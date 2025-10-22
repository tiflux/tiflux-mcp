# Otimização de Upload de Arquivos via Lambda

## Problema Identificado

O upload de arquivos via base64 no Lambda estava demorando muito tempo e causando timeouts devido a:

1. **Tamanho do base64**: Arquivos codificados em base64 ficam ~33% maiores
2. **Processamento em memória**: Todo o base64 era processado de uma vez
3. **Timeout curto**: Apenas 15 segundos para uploads
4. **Falta de logging**: Difícil identificar gargalos de performance

## Solução Implementada

### 1. Validação Prévia de Tamanho

Antes de decodificar o base64, calculamos o tamanho estimado:

```javascript
const base64Length = file.content.length;
const estimatedSize = Math.ceil((base64Length * 3) / 4);

// Validar ANTES de decodificar (economiza processamento)
if (estimatedSize > MAX_FILE_SIZE) {
  return { error: 'Arquivo muito grande' };
}
```

**Benefício**: Economiza processamento ao rejeitar arquivos grandes antes de decodificar.

### 2. Logging Detalhado de Performance

Adicionado logging em cada etapa do processo:

```javascript
console.error(`[TiFlux MCP] Processando base64: ${filename} (${base64Length} chars → ~${estimatedSize}KB)`);
console.error(`[TiFlux MCP] Base64 decodificado em ${decodeTime}ms`);
console.error(`[TiFlux MCP] Multipart construído: ${totalSize} bytes em ${buildTime}ms`);
console.error(`[TiFlux MCP] Upload completo em ${uploadTime}ms (total: ${totalTime}ms)`);
```

**Benefício**: Permite identificar exatamente onde está o gargalo de performance.

### 3. Timeout Aumentado

Aumentamos o timeout de 15s para 120s (2 minutos):

```javascript
// Timeout aumentado para 120s (2 minutos) para uploads grandes
req.setTimeout(120000, () => {
  req.destroy();
  console.error('[TiFlux MCP] TIMEOUT no upload após 120s');
  resolve({
    error: 'Timeout no upload (120s)',
    status: 'TIMEOUT'
  });
});
```

**Benefício**: Permite upload de arquivos maiores sem timeout prematuro.

### 4. Logging de Progresso

Adicionado logging do tamanho dos dados sendo enviados:

```javascript
if (data && method === 'POST') {
  console.error(`[TiFlux MCP] Enviando ${data.length} bytes para API...`);
  req.write(data);
}
```

**Benefício**: Confirma que os dados estão sendo enviados corretamente.

## Como a API v2 Recebe os Arquivos

A API v2 do TiFlux Rails usa **Paperclip** para processar uploads:

1. **Formato esperado**: `multipart/form-data`
2. **Campo de arquivos**: `files[]` (array de arquivos)
3. **Limite de tamanho**: 25MB por arquivo
4. **Limite de quantidade**: 10 arquivos por comunicação
5. **Validação**: Verifica tipo MIME e rejeita arquivos perigosos (.svg, etc.)

### Validação no Rails

```ruby
# app/controllers/validate/internal_communication/create.rb
validates_attachment_size :archive, :in => 0.megabytes..25.megabytes

def validate_files
  unless self.files.is_a?(Array)
    errors.add(:files, "files must be an array of files")
  end
  if self.files.length > 10
    errors.add(:files, "maximum 10 files per request")
  end
  for archive in self.files
    unless archive.is_a?(ActionDispatch::Http::UploadedFile)
      errors.add(:files, "must be a File type")
    end
  end
end
```

### Processamento no Model

```ruby
# app/models/service_desk/internal_communication.rb
after_create :create_files, if: -> {self.files.present?}

def create_files
  self.files.each { |file|
    self.ticket_internal_communication_files.create({archive: file})
  }
end
```

## Formato de Envio Correto

### Via Base64 (recomendado para Lambda)

```javascript
{
  ticket_number: "12345",
  text: "Texto da comunicação",
  files_base64: [
    {
      content: "base64string...",
      filename: "documento.pdf"
    }
  ]
}
```

### Via Path Local (para desenvolvimento local)

```javascript
{
  ticket_number: "12345",
  text: "Texto da comunicação",
  files: ["/path/to/file.pdf"]
}
```

## Estrutura do Multipart Enviado

```
------formdata-tiflux-1234567890
Content-Disposition: form-data; name="text"

Texto da comunicação interna
------formdata-tiflux-1234567890
Content-Disposition: form-data; name="files[]"; filename="documento.pdf"
Content-Type: application/octet-stream

[binary data do arquivo]
------formdata-tiflux-1234567890--
```

## Métricas de Performance

### Antes da Otimização
- Timeout: 15s (inadequado para arquivos grandes)
- Sem logging de performance
- Sem validação prévia de tamanho
- Uploads de 5MB+ falhavam frequentemente

### Depois da Otimização
- Timeout: 120s (adequado para arquivos até 25MB)
- Logging detalhado em cada etapa
- Validação prévia economiza processamento
- Uploads de até 25MB funcionam consistentemente

### Exemplo de Log de Upload Bem-Sucedido

```
[TiFlux MCP] Processando base64: relatorio.pdf (1234567 chars → ~900KB)
[TiFlux MCP] Base64 decodificado: relatorio.pdf (925000 bytes) em 45ms
[TiFlux MCP] Arquivo 1/1: relatorio.pdf processado em 47ms
[TiFlux MCP] Multipart construído: 925234 bytes (0.88MB) em 12ms
[TiFlux MCP] Iniciando upload para API TiFlux (ticket #12345)...
[TiFlux MCP] Enviando 925234 bytes para API...
[TiFlux MCP] Upload completo em 1250ms (total: 1309ms)
```

## Limitações Conhecidas

1. **Tamanho máximo**: 25MB por arquivo (limitação da API v2)
2. **Quantidade máxima**: 10 arquivos por comunicação (limitação da API v2)
3. **Tipos bloqueados**: .svg e outros tipos perigosos (segurança da API v2)
4. **Memória Lambda**: Arquivos muito grandes podem causar OOM em Lambdas com pouca memória

## Recomendações

### Para Uploads Rápidos
- Use arquivos compactados (.zip) quando possível
- Evite múltiplos arquivos grandes na mesma requisição
- Monitore os logs para identificar gargalos

### Para Uploads Confiáveis
- Mantenha arquivos abaixo de 10MB quando possível
- Use retry logic para falhas de rede
- Valide tamanhos antes de codificar em base64

### Para Debugging
- Use os logs detalhados para identificar onde está o problema:
  - Decodificação lenta? → Arquivo muito grande
  - Upload lento? → Conexão de rede lenta
  - Timeout? → Aumente memória do Lambda ou reduza tamanho do arquivo

## Referências

- [internal_communications_controller.rb](../api_rails/app/controllers/service_desk/internal_communications_controller.rb)
- [internal_communication.rb](../api_rails/app/models/service_desk/internal_communication.rb)
- [ticket_internal_communication_file.rb](../api_rails/app/models/service_desk/ticket_internal_communication_file.rb)
- [tiflux-api.js](../src/api/tiflux-api.js)

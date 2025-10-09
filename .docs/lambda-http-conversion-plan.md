# Conversao MCP Server (stdio) para Streamable HTTP + AWS Lambda

## Contexto do Projeto

### Objetivo Principal
Converter servidor MCP TiFlux de transporte **stdio** (local) para **Streamable HTTP** deployado em **AWS Lambda** com endpoint unico para multiplos clientes.

### Estrutura Atual
- **Linguagem:** JavaScript (Node.js >= 16.0.0)
- **Transporte atual:** StdioServerTransport
- **SDK MCP:** @modelcontextprotocol/sdk v1.17.5
- **Arquitetura:** DI Container, camadas (infrastructure, domain, presentation, handlers)
- **Arquivo principal:** server-sdk.js (sera mantido para uso local)

---

## Arquitetura da Solucao

### Endpoint Unico Multi-Tenant

**URL:** `https://[LAMBDA_URL]/mcp`

**Fluxo de dados:**
```
Cliente (Claude Desktop com API key: abc123)
  ↓
  Request HTTP POST com header: x-tiflux-api-key: abc123
  ↓
Lambda Function (endpoint unico)
  ↓
  1. Extrai x-tiflux-api-key do header
  2. Valida presenca (retorna 401 se ausente)
  3. Cria instancia servidor MCP (stateless)
  4. Passa API key para TiFlux API client
  ↓
TiFlux API (api.tiflux.com.br)
  ↓
  Autentica com x-tiflux-api-key e retorna dados do cliente
  ↓
Lambda Function
  ↓
  Formata resposta MCP e retorna
  ↓
Cliente (Claude Desktop)
  ↓
  Recebe dados do TiFlux
```

### Multi-tenancy

**Modelo:** Stateless - cada request cria nova instancia do servidor MCP

**Razoes:**
- **Seguranca:** Isolamento total entre clientes (zero risco de vazamento de dados)
- **Simplicidade:** Sem gerenciamento de sessoes, TTL, memory leaks
- **Compatibilidade Lambda:** Lambda pode ser reciclado a qualquer momento
- **Performance aceitavel:** Overhead de 50-100ms por request (aceitavel para uso IA)

**Funcionamento:**
1. Request chega com `x-tiflux-api-key: abc123`
2. Lambda cria novo servidor MCP configurado com essa API key
3. Servidor MCP executa tool solicitado
4. Lambda retorna resposta e descarta instancia
5. Proximo request (mesmo cliente ou diferente) repete processo

### Seguranca

**Validacoes:**
- ✅ Header `x-tiflux-api-key` obrigatorio em todo request
- ✅ Retorna 401 Unauthorized se header ausente
- ✅ API key NUNCA armazenada no servidor/Lambda
- ✅ API key passa apenas via header HTTP (HTTPS criptografado)
- ✅ TiFlux API faz validacao de permissoes por API key

**Isolamento:**
- ✅ Cliente A (key abc123) acessa apenas seus dados
- ✅ Cliente B (key xyz789) acessa apenas seus dados
- ✅ Zero compartilhamento de estado entre requests
- ✅ Instancias MCP isoladas por request

**Logs/Auditoria:**
- ✅ CloudWatch Logs com hash da API key (nao a key completa)
- ✅ Timestamp, request ID, tool executado
- ✅ Erros e stack traces

---

## Plano de Implementacao

### Etapa 1: Adaptacao para Streamable HTTP

**Arquivos a criar em src/lambda/:**

1. **handler.js** - Handler principal Lambda
   - Recebe evento HTTP (Function URL format)
   - Extrai headers, method, path, body
   - Valida x-tiflux-api-key
   - Cria servidor MCP via ServerFactory
   - Retorna resposta HTTP Lambda

2. **ServerFactory.js** - Factory para criar servidor MCP
   - Recebe apiKey como parametro
   - Cria instancia Server do SDK MCP
   - Configura StreamableHTTPServerTransport
   - Registra handlers com API key injetada
   - Retorna instancia isolada (stateless)

3. **EventParser.js** - Parser eventos Lambda Function URL
   - Extrai method, path, headers, body
   - Valida estrutura do evento
   - Normaliza dados para uso interno

4. **ResponseBuilder.js** - Builder respostas Lambda
   - Formata resposta para Lambda Function URL
   - Adiciona headers CORS (se necessario)
   - Trata erros HTTP (400, 401, 500)
   - Adiciona mcp-session-id header

**Modificacoes em arquivos existentes:**
- `src/api/tiflux-api.js` - Garantir que aceita API key via parametro (provavelmente ja aceita)
- `src/handlers/*` - Verificar se handlers podem receber API key dinamicamente

**Arquivo mantido intacto:**
- `server-sdk.js` - Continua funcionando com stdio para uso local/testes

### Etapa 2: Handler AWS Lambda

**Arquivo principal: lambda.js (raiz do projeto)**

Funcionalidades:
- Entry point Lambda (exports.handler)
- Recebe evento Lambda Function URL
- Delega para src/lambda/handler.js
- Setup de error handling global
- Logging estruturado para CloudWatch

**Endpoints:**
- `POST /mcp` - Endpoint principal MCP (mensagens JSON-RPC)
- `GET /health` - Health check (opcional mas recomendado)

### Etapa 3: Configuracao do Projeto

**Arquivos a criar/modificar:**

1. **package.json** - Adicionar scripts:
   ```json
   {
     "scripts": {
       "build-lambda": "npm ci --production",
       "package-lambda": "zip -r lambda.zip . -x '*.git*' 'tests/*' '.docs/*'",
       "deploy-lambda": "sam deploy"
     }
   }
   ```

2. **template.yaml** - AWS SAM template:
   - Lambda Function (Node.js 18.x)
   - Memory: 512MB
   - Timeout: 30s
   - Function URL habilitado
   - IAM Role com CloudWatch Logs
   - Environment variables (se necessario)

3. **.npmignore** - Excluir do bundle Lambda:
   - tests/
   - .docs/
   - .git/
   - node_modules (sera reinstalado no build)

4. **README-LAMBDA.md** - Documentacao especifica Lambda

### Etapa 4: Deploy na AWS

**Pre-requisitos:**
- AWS CLI configurado
- SAM CLI instalado
- Credenciais AWS com permissoes IAM

**Comandos:**
```bash
# 1. Build
npm run build-lambda
sam build

# 2. Deploy (primeira vez com --guided)
sam deploy --guided

# 3. Deploy (subsequentes)
sam deploy

# 4. Obter URL da Lambda
aws lambda get-function-url-config --function-name tiflux-mcp
```

**Testes:**
```bash
# Health check
curl https://[LAMBDA_URL]/health

# List tools
curl -X POST https://[LAMBDA_URL]/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Get ticket
curl -X POST https://[LAMBDA_URL]/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_ticket","arguments":{"ticket_number":"123"}}}'
```

### Etapa 5: Configuracao Claude Desktop

**Arquivo: claude_desktop_config.json**

```json
{
  "mcpServers": {
    "tiflux": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://[LAMBDA_URL]/mcp",
        "--header",
        "x-tiflux-api-key:${TIFLUX_API_KEY}"
      ],
      "env": {
        "TIFLUX_API_KEY": "sua_chave_tiflux_aqui"
      }
    }
  }
}
```

**Instrucoes:**
1. Substituir `[LAMBDA_URL]` pela URL real da Function URL
2. Substituir `sua_chave_tiflux_aqui` pela API key do TiFlux
3. Reiniciar Claude Desktop
4. Verificar conexao no menu MCP

---

## Decisoes Arquiteturais

### 1. Multi-tenancy
**Decisao:** Instancia separada por request (stateless)
**Razao:** Mais seguro, isola completamente dados entre clientes

### 2. Sessoes
**Decisao:** Stateless
**Razao:** Simplicidade, compatibilidade Lambda, overhead aceitavel

### 3. Estrutura de pastas
**Decisao:** src/lambda/ para toda logica HTTP/Lambda
**Razao:** Lambda Function URL ja e HTTP, nao precisa pasta http/ separada

### 4. Compatibilidade local
**Decisao:** Manter server-sdk.js intacto com stdio
**Razao:** Permite testes locais via npx sem deploy

### 5. Linguagem
**Decisao:** Manter JavaScript (nao converter para TypeScript)
**Razao:** Projeto atual e JavaScript, conversao adiciona complexidade desnecessaria

---

## Proximos Passos

1. ✅ **Analise completa** - Estrutura atual mapeada
2. ✅ **Planejamento** - Arquitetura definida e documentada
3. ⏳ **Etapa 1** - Implementar arquivos em src/lambda/
4. ⏳ **Etapa 2** - Criar lambda.js handler
5. ⏳ **Etapa 3** - Configurar package.json e template.yaml
6. ⏳ **Etapa 4** - Deploy e testes AWS
7. ⏳ **Etapa 5** - Documentar configuracao Claude Desktop

---

## Notas Tecnicas

### StreamableHTTPServerTransport
- Protocolo: MCP 2025-03-26
- Suporta streaming responses
- Compativel com mcp-remote client
- Headers: mcp-session-id para tracking

### Lambda Function URL
- Nao requer API Gateway
- Suporte nativo a streaming (Response Streaming)
- Formato de evento diferente do API Gateway
- HTTPS automatico

### Performance Esperada
- Lambda cold start: ~200-500ms (primeira invocacao)
- Lambda warm: ~50-100ms overhead MCP
- Tempo total: overhead + tempo execucao tool + latencia TiFlux API

### Custos AWS Estimados
- Lambda: ~$0.20 por 1M requests (512MB, 1s media)
- Data transfer: ~$0.09 por GB
- CloudWatch Logs: ~$0.50 por GB ingerido

---

**Documento criado em:** 2025-10-09
**Versao:** 1.0
**Status:** Planejamento aprovado, aguardando implementacao Etapa 1

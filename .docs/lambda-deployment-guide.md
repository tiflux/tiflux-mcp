# Guia Completo de Deploy Lambda - TiFlux MCP

## Resumo da Implementacao

### Arquivos Criados

```
tiflux-mcp/
├── lambda.js                         # Entry point Lambda (NOVO)
├── template.yaml                     # AWS SAM template (NOVO)
├── .npmignore                        # Exclusoes bundle (NOVO)
├── README-LAMBDA.md                  # Doc deploy (NOVO)
├── src/
│   ├── lambda/                       # Pasta nova
│   │   ├── handler.js               # Handler HTTP MCP (NOVO)
│   │   ├── ServerFactory.js         # Factory servidor MCP (NOVO)
│   │   ├── EventParser.js           # Parser eventos Lambda (NOVO)
│   │   └── ResponseBuilder.js       # Builder respostas HTTP (NOVO)
│   └── api/
│       └── tiflux-api.js            # MODIFICADO (aceita API key via construtor)
```

### Modificacoes

1. **src/api/tiflux-api.js:** Aceita API key via construtor
   ```javascript
   constructor(apiKey = null) {
     this.apiKey = apiKey || process.env.TIFLUX_API_KEY;
   }
   ```

2. **package.json:** Adicionados scripts Lambda
   ```json
   {
     "build:lambda": "npm ci --production",
     "package:lambda": "zip -r lambda-deployment.zip ...",
     "deploy:lambda": "sam deploy"
   }
   ```

---

## Checklist de Deploy

### Pre-Deploy

- [ ] AWS CLI instalado e configurado (`aws configure`)
- [ ] SAM CLI instalado (`sam --version`)
- [ ] Credenciais AWS com permissoes IAM adequadas
- [ ] API key do TiFlux para testes

### Build

```bash
cd /home/udo/code/tiflux/tiflux-mcp

# Build
npm run build:lambda
sam build
```

### Deploy (Primeira Vez)

```bash
sam deploy --guided
```

**Configuracoes:**
- Stack name: `tiflux-mcp-stack`
- Region: `us-east-1` (ou preferencia)
- Confirm changes: `Y`
- Allow IAM role creation: `Y`
- Disable rollback: `N`
- Save to config file: `Y`

### Deploy (Subsequentes)

```bash
sam build && sam deploy
```

### Pos-Deploy

- [ ] Obter URL do endpoint (outputs do SAM)
- [ ] Testar health check
- [ ] Testar tools/list
- [ ] Testar tool especifica (ex: get_ticket)
- [ ] Configurar Claude Desktop
- [ ] Validar logs CloudWatch

---

## Comandos de Teste

### 1. Health Check

```bash
export LAMBDA_URL="https://abc123.lambda-url.us-east-1.on.aws"

curl $LAMBDA_URL/health
```

**Resposta esperada:**
```json
{
  "status": "healthy",
  "service": "tiflux-mcp",
  "version": "2.0.0",
  "transport": "streamable-http",
  "deployment": "aws-lambda"
}
```

### 2. List Tools (sem API key - deve falhar)

```bash
curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Resposta esperada:** 401 Unauthorized

### 3. List Tools (com API key)

```bash
export TIFLUX_API_KEY="sua_chave_aqui"

curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

**Resposta esperada:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {"name": "get_ticket", ...},
      {"name": "create_ticket", ...},
      ...
    ]
  }
}
```

### 4. Get Ticket

```bash
curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_ticket",
      "arguments": {
        "ticket_number": "123"
      }
    }
  }'
```

### 5. Create Ticket

```bash
curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "create_ticket",
      "arguments": {
        "title": "Teste via Lambda",
        "description": "Ticket criado via MCP Lambda"
      }
    }
  }'
```

### 6. Search Client

```bash
curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "search_client",
      "arguments": {
        "client_name": "test"
      }
    }
  }'
```

---

## Configuracao Claude Desktop

### Localizacao do arquivo

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Configuracao

```json
{
  "mcpServers": {
    "tiflux-lambda": {
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

**Substituir:**
1. `[LAMBDA_URL]` → URL real do Lambda (sem barra final)
2. `sua_chave_tiflux_aqui` → Sua API key do TiFlux

**Exemplo real:**
```json
{
  "mcpServers": {
    "tiflux-lambda": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://abc123xyz.lambda-url.us-east-1.on.aws/mcp",
        "--header",
        "x-tiflux-api-key:${TIFLUX_API_KEY}"
      ],
      "env": {
        "TIFLUX_API_KEY": "sk_live_abc123xyz456"
      }
    }
  }
}
```

### Validacao

1. Salvar arquivo `claude_desktop_config.json`
2. **Reiniciar Claude Desktop completamente**
3. Abrir Claude Code ou Claude Desktop
4. Verificar no menu MCP se `tiflux-lambda` aparece
5. Testar comando: "Liste os tickets do TiFlux"

---

## Monitoramento CloudWatch

### Ver logs em tempo real

```bash
sam logs -n TiFluxMCPFunction --tail
```

### Ver logs de periodo especifico

```bash
sam logs -n TiFluxMCPFunction \
  --start-time '30 minutes ago' \
  --end-time 'now'
```

### Filtrar por texto

```bash
sam logs -n TiFluxMCPFunction \
  --filter '[MCPHandler]' \
  --tail
```

### CloudWatch Console

1. Acessar: https://console.aws.amazon.com/cloudwatch/
2. Logs > Log groups
3. Buscar: `/aws/lambda/tiflux-mcp-server`
4. Visualizar streams mais recentes

---

## Troubleshooting

### Erro: "Header x-tiflux-api-key obrigatorio"

**Sintoma:** Response 401
**Causa:** Header nao enviado
**Solucao:** Adicionar `-H "x-tiflux-api-key: SUA_KEY"`

### Erro: "Token de API invalido"

**Sintoma:** Response da TiFlux API com erro 401
**Causa:** API key invalida ou expirada
**Solucao:** Verificar key em https://app.tiflux.com.br/settings/api

### Lambda Timeout

**Sintoma:** Response 504 Gateway Timeout
**Causa:** Requisicao > 30s
**Solucao:** Aumentar timeout em template.yaml:
```yaml
Globals:
  Function:
    Timeout: 60
```

### Memory Exceeded

**Sintoma:** Erro "Runtime exited with error: signal: killed"
**Causa:** Lambda sem memoria suficiente
**Solucao:** Aumentar memory em template.yaml:
```yaml
Globals:
  Function:
    MemorySize: 1024
```

### Erro CORS

**Sintoma:** Browser bloqueia request
**Causa:** Headers CORS faltando
**Solucao:** Ja configurado em template.yaml, verificar se origin permitido

### Erro ao criar servidor MCP

**Sintoma:** "Handler tools/list nao encontrado"
**Causa:** Servidor MCP nao inicializado corretamente
**Solucao:** Verificar logs CloudWatch, testar localmente primeiro

---

## Rollback

### Voltar para versao anterior

```bash
# Listar deployments
aws cloudformation list-stacks \
  --stack-status-filter UPDATE_COMPLETE

# Fazer rollback
aws cloudformation rollback-stack \
  --stack-name tiflux-mcp-stack
```

### Deletar stack completo

```bash
sam delete

# Confirmar delecao
```

---

## Performance e Custos

### Metricas Esperadas

- **Cold Start:** 200-500ms (primeira invocacao)
- **Warm Start:** 50-100ms overhead MCP
- **Tempo Total:** overhead + tempo TiFlux API (1-3s tipico)

### Custos Estimados (apos free tier)

- **Lambda:** $0.20 por 1M requests
- **CloudWatch:** $0.50 por GB logs
- **Data Transfer:** $0.09 por GB

**Total:** < $5/mes para uso moderado (10k requests/mes)

---

## Proximos Passos

### Melhorias Opcionais

1. **Custom Domain:**
   - Route 53 + CloudFront
   - Certificado SSL/TLS custom

2. **Autenticacao Custom:**
   - Lambda Authorizer
   - API Gateway com auth

3. **Rate Limiting:**
   - API Gateway throttling
   - Custom logic no handler

4. **Metricas Custom:**
   - CloudWatch custom metrics
   - Dashboard CloudWatch

5. **Alarmes:**
   - SNS notifications
   - Alarmes de erro/latencia

---

**Documento criado em:** 2025-10-09
**Versao:** 1.0
**Status:** Deploy pronto para execucao

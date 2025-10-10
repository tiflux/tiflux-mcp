# Deploy Lambda TiFlux MCP - Sucesso!

**Data:** 2025-10-10
**Regiao:** sa-east-1 (Sao Paulo)
**Status:** ✅ ATIVO

---

## Informacoes do Deploy

### URLs

**Function URL:**
```
https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/
```

**Endpoints:**
- `GET /health` - Health check (sem autenticacao)
- `POST /mcp` - Endpoint MCP (requer x-tiflux-api-key)

### Recursos AWS

**Lambda Function:**
- Nome: `tiflux-mcp-server`
- ARN: `arn:aws:lambda:sa-east-1:121558336278:function:tiflux-mcp-server`
- Runtime: Node.js 18.x
- Memoria: 512MB
- Timeout: 30s
- Concurrent Executions: 10 (limite)

**CloudFormation Stack:**
- Nome: `tiflux-mcp-stack`
- Regiao: `sa-east-1`

---

## Como Usar

### 1. Health Check

```bash
curl https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "tiflux-mcp",
  "version": "2.0.0",
  "timestamp": "2025-10-10T18:27:47.971Z",
  "transport": "streamable-http",
  "deployment": "aws-lambda"
}
```

### 2. Listar Tools Disponiveis

```bash
curl -X POST https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY_AQUI" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

**Tools Disponiveis (16):**
- get_ticket
- create_ticket
- update_ticket
- cancel_ticket
- close_ticket
- list_tickets
- create_ticket_answer
- update_ticket_entities
- get_ticket_files
- search_client
- search_user
- search_stage
- search_catalog_item
- create_internal_communication
- list_internal_communications
- get_internal_communication

### 3. Buscar um Ticket

```bash
curl -X POST https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY_AQUI" \
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

---

## Configurar no Claude Desktop

### Arquivo de Configuracao

**Local:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tiflux-lambda": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-client-http",
        "https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp"
      ],
      "env": {
        "MCP_HTTP_HEADERS": "{\"x-tiflux-api-key\": \"SUA_API_KEY_TIFLUX_AQUI\"}"
      }
    }
  }
}
```

**Substituir:**
- `SUA_API_KEY_TIFLUX_AQUI` pela sua API key do TiFlux

**Reiniciar Claude Desktop** apos configurar.

---

## Configurar no n8n

### HTTP Request Node

**Method:** POST
**URL:** `https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-tiflux-api-key": "{{$credentials.tiflux.apiKey}}"
}
```

**Body (JSON):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_ticket",
    "arguments": {
      "ticket_number": "{{$json.ticketId}}"
    }
  }
}
```

---

## Monitoramento

### CloudWatch Logs

```bash
# Ver logs recentes
aws logs tail /aws/lambda/tiflux-mcp-server --follow

# Ver logs de periodo especifico
aws logs tail /aws/lambda/tiflux-mcp-server \
  --since 10m \
  --format short
```

### Metricas Lambda

```bash
# Ver invocacoes (ultimas 24h)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

# Ver erros
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

# Ver throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Throttles \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

### AWS Console

**Lambda:**
https://sa-east-1.console.aws.amazon.com/lambda/home?region=sa-east-1#/functions/tiflux-mcp-server

**CloudWatch Logs:**
https://sa-east-1.console.aws.amazon.com/cloudwatch/home?region=sa-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Ftiflux-mcp-server

**CloudFormation:**
https://sa-east-1.console.aws.amazon.com/cloudformation/home?region=sa-east-1#/stacks/stackinfo?stackId=arn:aws:cloudformation:sa-east-1:121558336278:stack/tiflux-mcp-stack

---

## Custos Estimados

**Com uso moderado (10k requests/mes):**
- Lambda: $0 (free tier)
- CloudWatch Logs: $0 (free tier)
- Data Transfer: $0 (free tier)

**Total:** $0/mes (dentro do free tier)

**Apos free tier (100k requests/mes):**
- Lambda: ~$2/mes
- CloudWatch: ~$1/mes
- Data Transfer: ~$1/mes

**Total:** ~$4/mes

---

## Proximos Passos

### Opcionais (melhorias futuras)

1. **Custom Domain**
   ```bash
   # Associar dominio customizado (ex: mcp.tiflux.com)
   # Requer certificado SSL no ACM
   ```

2. **WAF Protection**
   ```bash
   # Adicionar AWS WAF para protecao avancada
   # Rate limiting por IP
   # Bloqueio de paises especificos
   ```

3. **CloudFront**
   ```bash
   # Cache de responses estaticas
   # DDoS protection
   # Reduzir latencia global
   ```

4. **Alarmes CloudWatch**
   ```bash
   # Notificacoes de erros
   # Alertas de throttling
   # Monitoramento de latencia
   ```

---

## Troubleshooting

### Lambda retorna 429 (Too Many Requests)

**Causa:** Mais de 10 requests simultaneos

**Solucao:**
1. Implementar retry com backoff no cliente
2. Ou aumentar `ReservedConcurrentExecutions` no template.yaml

### Lambda timeout (30s)

**Causa:** Request muito lento

**Solucao:**
1. Verificar logs para identificar gargalo
2. Otimizar chamadas API TiFlux
3. Ou aumentar `Timeout` no template.yaml (max 900s)

### API key invalida

**Causa:** Header x-tiflux-api-key ausente ou invalido

**Solucao:**
1. Verificar se header esta presente
2. Validar API key em https://app.tiflux.com.br/settings/api
3. Gerar nova API key se expirada

---

## Comandos Uteis

### Atualizar Lambda

```bash
cd /home/udo/code/tiflux/tiflux-mcp
sam build
sam deploy
```

### Deletar Stack

```bash
aws cloudformation delete-stack --stack-name tiflux-mcp-stack
```

### Ver Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name tiflux-mcp-stack \
  --query 'Stacks[0].Outputs'
```

### Invocar Lambda Manualmente

```bash
aws lambda invoke \
  --function-name tiflux-mcp-server \
  --payload '{"requestContext":{"http":{"method":"GET","path":"/health"}}}' \
  response.json

cat response.json
```

---

**Documentacao completa:** [README-LAMBDA.md](../README-LAMBDA.md)
**Arquitetura:** [arquitetura-completa.md](arquitetura-completa.md)
**Rate Limiting:** [rate-limiting-infrastructure.md](rate-limiting-infrastructure.md)

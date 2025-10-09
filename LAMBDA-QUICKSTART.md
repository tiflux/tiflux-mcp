# TiFlux MCP Lambda - Quick Start

## ⚡ Inicio Rapido

### 1. Teste Local (2 minutos)

```bash
cd /home/udo/code/tiflux/tiflux-mcp

# Definir API key
export TIFLUX_API_KEY="sua_key_tiflux"

# Rodar testes
node test-lambda-local.js
```

**Resultado esperado:**
```
✓ Passou: 5/5 testes
🎉 Todos os testes passaram!
```

---

### 2. Deploy AWS (5 minutos)

```bash
# Build
sam build

# Deploy (primeira vez - guiado)
sam deploy --guided
```

**Responder:**
- Stack name: `tiflux-mcp-stack`
- Region: `us-east-1`
- Confirmar todas as perguntas com `Y`

**Obter URL:**
```bash
# URL aparece nos outputs do deploy:
# TiFluxMCPFunctionUrl: https://abc123.lambda-url.us-east-1.on.aws/
```

---

### 3. Testar Endpoint (1 minuto)

```bash
# Substituir [LAMBDA_URL] pela URL real
export LAMBDA_URL="https://abc123.lambda-url.us-east-1.on.aws"

# Health check
curl $LAMBDA_URL/health

# List tools
curl -X POST $LAMBDA_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

### 4. Configurar Claude Desktop (2 minutos)

**Editar:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tiflux-lambda": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://abc123.lambda-url.us-east-1.on.aws/mcp",
        "--header",
        "x-tiflux-api-key:${TIFLUX_API_KEY}"
      ],
      "env": {
        "TIFLUX_API_KEY": "sua_key_tiflux"
      }
    }
  }
}
```

**Reiniciar Claude Desktop** e testar: "Liste os tickets do TiFlux"

---

## 📚 Documentacao Completa

| Arquivo | Conteudo |
|---------|----------|
| [README-LAMBDA.md](README-LAMBDA.md) | Guia completo de deploy |
| [.docs/lambda-local-testing.md](.docs/lambda-local-testing.md) | Testes locais detalhados |
| [.docs/lambda-deployment-guide.md](.docs/lambda-deployment-guide.md) | Deploy passo a passo |
| [.docs/lambda-conversion-summary.md](.docs/lambda-conversion-summary.md) | Resumo da implementacao |

---

## 🏗️ Arquitetura

```
Cliente → Lambda (/mcp) → ServerFactory → MCP Server → TiFlux API
            ↓
         EventParser (extrai x-tiflux-api-key)
            ↓
         ResponseBuilder (formata HTTP)
```

**Multi-tenancy:** Cada request cria servidor MCP isolado com API key do cliente.

---

## ❓ FAQ

### Ja funciona com stdio local?
Sim! O `server-sdk.js` foi mantido. Ambos os metodos coexistem.

### Preciso mudar minha API key?
Nao. Use a mesma API key do TiFlux que ja tem.

### Quanto custa?
~$0 nos primeiros meses (free tier AWS). Depois ~$2-5/mes.

### Posso testar sem deploy?
Sim! Use `node test-lambda-local.js` ou `sam local start-api`.

### Como ver logs?
```bash
sam logs -n TiFluxMCPFunction --tail
```

---

## 🚨 Troubleshooting

| Erro | Solucao |
|------|---------|
| 401 Unauthorized | Adicionar header `-H "x-tiflux-api-key: SUA_KEY"` |
| Token invalido | Verificar key em https://app.tiflux.com.br/settings/api |
| Lambda timeout | Aumentar `Timeout` em template.yaml |
| Docker error | Iniciar Docker Desktop |

---

## ⚙️ Comandos Uteis

```bash
# Teste local
node test-lambda-local.js

# Build + Deploy
sam build && sam deploy

# Logs em tempo real
sam logs -n TiFluxMCPFunction --tail

# Deletar stack
sam delete
```

---

**Pronto!** Em 10 minutos voce tem o TiFlux MCP rodando em Lambda! 🎉

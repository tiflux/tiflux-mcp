# TiFlux MCP Server - AWS Lambda Deployment

Guia completo para deploy do TiFlux MCP Server em AWS Lambda com Function URL.

## Arquitetura

- **Transport:** Implementação MCP otimizada para Lambda
- **Deployment:** AWS Lambda com Function URL
- **Multi-tenancy:** Cada cliente passa sua API key via header `x-tiflux-api-key`
- **Stateless:** Cada request cria nova instancia do servidor MCP
- **Endpoint:** `/mcp` (POST) e `/health` (GET)

### Protocol Implementation

O servidor implementa o protocolo MCP (Model Context Protocol) usando o SDK oficial `@modelcontextprotocol/sdk` com uma arquitetura otimizada para AWS Lambda:

- ✅ **MCP Server SDK**: Usa `@modelcontextprotocol/sdk/server` para handlers MCP
- ✅ **JSON-RPC 2.0**: Implementação manual otimizada para Lambda stateless
- ✅ **Protocol Compliance**: Suporte completo a initialize, tools/list, tools/call
- ✅ **Session Management**: Headers customizados para tracking de sessões

### Por que não usar StreamableHTTPServerTransport?

O `StreamableHTTPServerTransport` do SDK MCP é projetado para servidores HTTP stateful de longa duração (long-running servers). Em ambientes serverless como AWS Lambda:

- ❌ **Stateful sessions**: Transport mantém sessões em memória (incompatível com Lambda)
- ❌ **SSE (Server-Sent Events)**: Requer conexões persistentes (Lambda timeout 30s)
- ❌ **Overhead**: Inicialização adicional desnecessária por request

Nossa implementação direta é:
- ✅ **Stateless**: Nova instância por request (ideal para Lambda)
- ✅ **Eficiente**: Sem overhead de gerenciamento de sessão
- ✅ **Simple**: Código mais direto e fácil de debugar
- ✅ **Cost-effective**: Menor tempo de execução = menor custo

### Fluxo de Requisição

1. **Lambda Function URL** recebe requisição HTTP POST
2. **EventParser** extrai e valida API key do header `x-tiflux-api-key`
3. **ServerFactory** cria servidor MCP isolado por request com API key do cliente
4. **MCPHandler** invoca handlers do servidor diretamente (tools/list, tools/call, initialize)
5. Servidor MCP processa requisição usando SDK oficial
6. **ResponseBuilder** formata resposta JSON-RPC 2.0 para Lambda

### Multi-tenancy

Cada requisição cria uma instância isolada do servidor MCP configurada com a API key específica do cliente, garantindo:
- 🔒 Total isolamento de dados entre organizações
- 🔑 Autenticação via API key do TiFlux
- 📊 Tracking por session ID
- ⚡ Zero compartilhamento de estado entre requests

## Teste Local

Antes de fazer deploy, teste localmente! Veja guia completo em [.docs/lambda-local-testing.md](.docs/lambda-local-testing.md)

**Quick start:**
```bash
# Metodo 1: SAM Local (requer Docker)
sam build
sam local start-api
curl http://localhost:3000/health

# Metodo 2: Node.js puro (sem Docker)
node test-lambda-local.js
```

## Pre-requisitos

### 1. Instalar AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verificar instalacao
aws --version
```

### 2. Configurar credenciais AWS

```bash
aws configure
```

Fornecer:
- AWS Access Key ID
- AWS Secret Access Key
- Region (ex: us-east-1)
- Output format (json)

### 3. Instalar AWS SAM CLI

```bash
# macOS
brew install aws-sam-cli

# Linux
wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install

# Verificar instalacao
sam --version
```

## Deploy

### Passo 1: Build

```bash
# Instalar dependencias de producao apenas
npm run build:lambda
```

### Passo 2: Deploy (primeira vez)

```bash
# Deploy guiado (primeira vez)
sam build
sam deploy --guided
```

Responder as perguntas:
- **Stack Name:** tiflux-mcp-stack
- **AWS Region:** us-east-1 (ou sua preferencia)
- **Confirm changes:** Y
- **Allow SAM CLI IAM role creation:** Y
- **Disable rollback:** N
- **Save arguments to configuration file:** Y
- **SAM configuration file:** samconfig.toml
- **SAM configuration environment:** default

### Passo 3: Deploy (subsequentes)

```bash
# Deploy rapido (usa configuracao salva)
sam build && sam deploy
```

### Passo 4: Obter URL do endpoint

```bash
# Listar outputs do CloudFormation
aws cloudformation describe-stacks \
  --stack-name tiflux-mcp-stack \
  --query 'Stacks[0].Outputs'
```

Ou no final do deploy, SAM mostra:
```
Outputs:
TiFluxMCPFunctionUrl: https://abc123xyz.lambda-url.us-east-1.on.aws/
```

## Testes

### 1. Health Check

```bash
curl https://[LAMBDA_URL]/health
```

Resposta esperada:
```json
{
  "status": "healthy",
  "service": "tiflux-mcp",
  "version": "2.0.0",
  "timestamp": "2025-10-09T...",
  "transport": "streamable-http",
  "deployment": "aws-lambda"
}
```

### 2. List Tools

```bash
curl -X POST https://[LAMBDA_URL]/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY_TIFLUX" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### 3. Get Ticket

```bash
curl -X POST https://[LAMBDA_URL]/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY_TIFLUX" \
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

### 4. Create Ticket

```bash
curl -X POST https://[LAMBDA_URL]/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: SUA_API_KEY_TIFLUX" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "create_ticket",
      "arguments": {
        "title": "Teste Lambda",
        "description": "Ticket criado via Lambda MCP"
      }
    }
  }'
```

## Configuracao Claude Desktop

Editar `claude_desktop_config.json`:

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
- `[LAMBDA_URL]` pela URL real do Lambda
- `sua_chave_tiflux_aqui` pela sua API key do TiFlux

**Reiniciar Claude Desktop** para aplicar configuracao.

## Monitoramento

### CloudWatch Logs

```bash
# Ver logs recentes
sam logs -n TiFluxMCPFunction --tail

# Ver logs de um periodo especifico
sam logs -n TiFluxMCPFunction \
  --start-time '10 minutes ago' \
  --end-time 'now'
```

### CloudWatch Console

1. Acessar: https://console.aws.amazon.com/cloudwatch/
2. Navegar para: Logs > Log groups
3. Buscar: `/aws/lambda/tiflux-mcp-server`

### Metricas Lambda

```bash
# Listar metricas disponiveis
aws cloudwatch list-metrics \
  --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=tiflux-mcp-server
```

## Atualizacao

### Atualizar codigo

```bash
# 1. Fazer mudancas no codigo
# 2. Build e deploy
sam build && sam deploy

# Sem perguntas (usa config salva)
```

### Atualizar configuracao

```bash
# 1. Editar template.yaml
# 2. Deploy com --guided para revisar mudancas
sam build && sam deploy --guided
```

## Troubleshooting

### Erro: "x-tiflux-api-key obrigatorio"

**Causa:** Header API key nao enviado ou invalido

**Solucao:** Adicionar header `-H "x-tiflux-api-key: SUA_KEY"` nos requests

### Erro: "Token de API invalido ou expirado"

**Causa:** API key do TiFlux invalida

**Solucao:** Verificar API key em https://app.tiflux.com.br/settings/api

### Lambda timeout

**Causa:** Requisicao demora mais de 30s

**Solucao:** Aumentar timeout no template.yaml:
```yaml
Globals:
  Function:
    Timeout: 60  # Aumentar para 60s
```

### Erro CORS

**Causa:** Headers CORS nao configurados

**Solucao:** Ja configurado no template.yaml. Verificar browser console.

## Custos Estimados

### AWS Lambda
- **Free Tier:** 1M requests + 400,000 GB-s compute/mes
- **Apos Free Tier:** ~$0.20 por 1M requests (512MB, 1s media)

### CloudWatch Logs
- **Free Tier:** 5GB ingest/mes
- **Apos Free Tier:** ~$0.50 por GB ingerido

### Data Transfer
- **Estimado:** ~$0.09 por GB transferido

**Total estimado (apos free tier):** < $5/mes para uso moderado

## Remover Deployment

```bash
# Deletar stack completo
sam delete

# Confirmar delecao
# Isso remove:
# - Lambda Function
# - Function URL
# - IAM Roles
# - CloudWatch Log Groups
```

## Suporte

- **Issues:** https://github.com/tiflux/tiflux-mcp/issues
- **Email:** dev@tiflux.com
- **Documentacao MCP:** https://modelcontextprotocol.io/

## Arquitetura de Componentes

### Componentes Principais

- **[handler.js](src/lambda/handler.js)** - Controlador principal HTTP para Lambda
  - Roteamento de endpoints (/mcp, /health)
  - Validação de métodos HTTP
  - Orquestração de processamento MCP

- **[EventParser.js](src/lambda/EventParser.js)** - Parse e validação de eventos Lambda
  - Extração de API key do header `x-tiflux-api-key`
  - Normalização de headers (case-insensitive)
  - Geração de session IDs
  - Validação de estrutura JSON-RPC

- **[ServerFactory.js](src/lambda/ServerFactory.js)** - Factory de servidores MCP
  - Criação de instâncias isoladas do MCP Server
  - Injeção de API key nos handlers
  - Registro de tools do TiFlux
  - Configuração de handlers (tools/list, tools/call)

- **[ResponseBuilder.js](src/lambda/ResponseBuilder.js)** - Formatação de respostas HTTP
  - Respostas JSON-RPC 2.0
  - Headers CORS
  - Códigos de status HTTP apropriados
  - Session tracking headers

### Decisões Arquiteturais

**Por que implementação manual em vez de StreamableHTTPServerTransport?**

1. **Stateless by design**: Lambda é efêmero, não mantém estado entre requests
2. **Performance**: Sem overhead de inicialização de transport
3. **Simplicidade**: Código direto, fácil de debugar e manter
4. **Custo**: Menor tempo de execução = menor custo AWS
5. **Controle**: Flexibilidade total sobre formato de requisição/resposta

Esta abordagem usa o `@modelcontextprotocol/sdk` para os handlers MCP (garantindo compliance com o protocolo), mas implementa a camada HTTP/JSON-RPC diretamente, otimizada para Lambda.

## Proximos Passos

1. ✅ Deploy funcional com arquitetura otimizada para Lambda
2. ⬜ Adicionar autenticacao custom (opcional)
3. ⬜ Configurar custom domain (opcional)
4. ⬜ Implementar rate limiting (opcional)
5. ⬜ Adicionar metricas customizadas (opcional)

---

**Versao:** 2.0.0
**Ultima atualizacao:** 2025-10-13

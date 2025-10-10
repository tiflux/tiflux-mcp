# Correcao de Compatibilidade: mcp-remote e Lambda

## Problema Identificado

O servidor TiFlux MCP Lambda estava rejeitando conexoes do cliente `mcp-remote` (usado pelo Claude Desktop) com erro HTTP 400:

```
Body deve ser uma requisicao JSON-RPC 2.0 valida
```

## Causa Raiz

O protocolo MCP via HTTP utiliza notificacoes JSON-RPC 2.0, que sao requisicoes **sem campo `id`**. O Lambda estava validando que todas as requisicoes devem ter `id`, o que e incorreto segundo a spec JSON-RPC 2.0.

Fluxo de conexao do mcp-remote:
1. POST `/mcp` - `initialize` (id: 0) -> Sucesso
2. POST `/mcp` - `notifications/initialized` (sem id) -> **Falha 400**

## Solucao Implementada

### 1. Relaxar Validacao (EventParser.js)

**Antes:**
```javascript
static isValidMCPRequest(parsedEvent) {
  const body = parsedEvent.body;
  return (
    body.jsonrpc === '2.0' &&
    body.method &&
    typeof body.method === 'string' &&
    (body.id !== undefined)  // ❌ Rejeita notificacoes
  );
}
```

**Depois:**
```javascript
static isValidMCPRequest(parsedEvent) {
  const body = parsedEvent.body;
  return (
    body.jsonrpc === '2.0' &&
    body.method &&
    typeof body.method === 'string'
    // ✅ id e opcional (notificacoes nao tem id)
  );
}
```

### 2. Suportar Notificacoes (MCPHandler.js)

**Adicoes:**
- Detectar se requisicao e notificacao: `const isNotification = id === undefined`
- Handler especifico para `notifications/initialized`
- Retornar HTTP 204 para notificacoes (sem corpo de resposta)
- Ignorar notificacoes desconhecidas (sem erro)

```javascript
case 'notifications/initialized':
  console.log('[MCPHandler] Cliente inicializado', { sessionId });
  return ResponseBuilder.noContent(sessionId);

default:
  // Ignorar notificacoes desconhecidas
  if (isNotification) {
    console.log('[MCPHandler] Notificacao desconhecida ignorada', {
      sessionId,
      method
    });
    return ResponseBuilder.noContent(sessionId);
  }
```

### 3. Novo Metodo de Resposta (ResponseBuilder.js)

```javascript
static noContent(sessionId = null) {
  const headers = this.getDefaultHeaders();
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  return {
    statusCode: 204,
    headers,
    body: ''
  };
}
```

## Resultado

O mcp-remote agora se conecta com sucesso:

```
✅ Connected to remote server using StreamableHTTPClientTransport
✅ Proxy established successfully
```

## Referencias

- **JSON-RPC 2.0 Spec:** https://www.jsonrpc.org/specification
  - Secao 4.1: "A Notification is a Request object without an id member"
- **MCP Protocol:** https://modelcontextprotocol.io/
- **mcp-remote:** Cliente MCP para conexoes HTTP remotas

## Deploy

```bash
sam build && sam deploy --no-confirm-changeset
```

## Teste

```bash
# Testar conexao mcp-remote
npx -y mcp-remote https://[LAMBDA_URL]/mcp \
  --header "x-tiflux-api-key:YOUR_KEY"

# Verificar logs
aws logs tail /aws/lambda/tiflux-mcp-server --since 5m
```

## Proximos Passos

- Claude Desktop precisa ser reiniciado para reconectar
- Servidor agora compativel com protocolo MCP completo
- Suporta tanto requests (com id) quanto notifications (sem id)

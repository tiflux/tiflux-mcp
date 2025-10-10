# Arquitetura Completa - TiFlux MCP Lambda

## Visao Geral

O TiFlux MCP tem duas implementacoes:
1. **Lambda (HTTP)** - Para deploy AWS (usado em producao)
2. **Local (stdio)** - Para uso via npm/npx

Este documento foca na **implementacao Lambda**.

---

## Estrutura de Pastas

```
tiflux-mcp/
├── lambda.js                    # Entry point AWS Lambda
├── server-sdk.js                # Entry point uso local (stdio)
├── template.yaml                # CloudFormation/SAM config
│
├── src/
│   ├── lambda/                  # Lambda-specific (HTTP)
│   │   ├── handler.js           # Orchestrator principal
│   │   ├── EventParser.js       # Parse eventos HTTP Lambda
│   │   ├── ResponseBuilder.js   # Constroi responses HTTP
│   │   └── ServerFactory.js     # Factory de servidores MCP isolados
│   │
│   ├── api/                     # Cliente HTTP TiFlux API
│   │   └── tiflux-api.js        # Wrapper da API v2 TiFlux
│   │
│   ├── handlers/                # Business logic handlers
│   │   ├── tickets.js           # CRUD tickets
│   │   ├── clients.js           # Busca clientes
│   │   ├── users.js             # Busca usuarios
│   │   ├── stages.js            # Busca estagios
│   │   ├── catalog_items.js     # Busca itens catalogo
│   │   └── internal_communications.js  # Comunicacoes internas
│   │
│   ├── schemas/                 # MCP tool schemas
│   │   ├── index.js             # Exporta todos schemas
│   │   ├── tickets.js           # Schemas de tickets
│   │   ├── clients.js           # Schemas de clientes
│   │   ├── users.js             # Schemas de usuarios
│   │   ├── stages.js            # Schemas de estagios
│   │   ├── catalog_items.js     # Schemas de catalogo
│   │   └── internal_communications.js  # Schemas comunicacoes
│   │
│   ├── core/                    # Core utilities (nao usado no Lambda)
│   │   ├── Config.js
│   │   ├── Container.js
│   │   └── Logger.js
│   │
│   ├── domain/                  # Domain layer (nao usado no Lambda)
│   ├── infrastructure/          # Infrastructure layer (nao usado no Lambda)
│   └── presentation/            # Presentation layer (nao usado no Lambda)
│
├── config/                      # Arquivos de config (nao usado no Lambda)
└── tests/                       # Testes automatizados
```

---

## Fluxo Completo de um Request Lambda

### 1. Cliente faz request HTTP

```bash
curl -X POST https://xyz123.lambda-url.sa-east-1.on.aws/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: eyJhbGc..." \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_ticket",
      "arguments": {"ticket_number": "123"}
    }
  }'
```

### 2. AWS Lambda recebe evento HTTP

Lambda Function URL converte request HTTP em evento Lambda:

```javascript
// Formato do evento recebido
{
  version: '2.0',
  routeKey: '$default',
  rawPath: '/mcp',
  headers: {
    'content-type': 'application/json',
    'x-tiflux-api-key': 'eyJhbGc...'
  },
  requestContext: {
    http: {
      method: 'POST',
      path: '/mcp'
    }
  },
  body: '{"jsonrpc":"2.0",...}',
  isBase64Encoded: false
}
```

### 3. lambda.js - Entry Point

**Arquivo:** `lambda.js`

```javascript
const MCPHandler = require('./src/lambda/handler');

exports.handler = async (event, context) => {
  // Configurar Lambda context
  context.callbackWaitsForEmptyEventLoop = false;

  // Log inicial (CloudWatch)
  console.log('[Lambda] Requisicao recebida', {
    requestId: context.requestId,
    path: event.requestContext?.http?.path,
    method: event.requestContext?.http?.method
  });

  try {
    // Delegar para MCPHandler
    const response = await MCPHandler.handle(event);
    return response;

  } catch (error) {
    // Ultima barreira de erro
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno do servidor'
        }
      })
    };
  }
};
```

**Responsabilidade:**
- Entry point do Lambda
- Configuracao de context
- Log inicial
- Delegacao para MCPHandler
- Catch de erros nao tratados

---

### 4. MCPHandler.handle() - Orchestrator

**Arquivo:** `src/lambda/handler.js`

```javascript
class MCPHandler {
  static async handle(event) {
    // 1. Extrair path ANTES de validar API key
    const path = event.requestContext?.http?.path || '/';
    const method = event.requestContext?.http?.method || 'GET';

    // 2. Roteamento por path (health nao precisa API key)
    if (path === '/health') {
      return this.handleHealth();
    }

    // Verificar se path e valido
    if (path !== '/mcp' && path !== '/') {
      return ResponseBuilder.notFound(`Path nao encontrado: ${path}`);
    }

    // 3. Parse completo do evento (valida API key)
    parsedEvent = EventParser.parse(event);
    const { apiKey, body, sessionId } = parsedEvent;

    // 4. Tratar preflight CORS
    if (method === 'OPTIONS') {
      return ResponseBuilder.corsPreFlight();
    }

    // 5. Validar metodo (apenas POST)
    if (method !== 'POST') {
      return ResponseBuilder.badRequest('Metodo nao permitido');
    }

    // 6. Validar JSON-RPC 2.0
    if (!EventParser.isValidMCPRequest(parsedEvent)) {
      return ResponseBuilder.badRequest('Body invalido');
    }

    // 7. Processar requisicao MCP
    return await this.handleMCPRequest(apiKey, body, sessionId);
  }
}
```

**Responsabilidade:**
- Roteamento de paths (/health, /mcp, 404)
- Validacao de API key
- Validacao de metodo HTTP
- Validacao JSON-RPC 2.0
- Delegacao para handleMCPRequest

---

### 5. EventParser.parse() - Parse e Validacao

**Arquivo:** `src/lambda/EventParser.js`

```javascript
class EventParser {
  static parse(event) {
    // 1. Extrair method e path
    const method = event.requestContext?.http?.method || 'GET';
    const path = event.requestContext?.http?.path || '/';

    // 2. Normalizar headers (lowercase)
    const headers = this.normalizeHeaders(event.headers || {});

    // 3. Extrair e parse body JSON
    let body = null;
    if (event.body) {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;

      if (headers['content-type']?.includes('application/json')) {
        body = JSON.parse(rawBody);
      }
    }

    // 4. VALIDACAO CRITICA: API key obrigatoria
    const apiKey = headers['x-tiflux-api-key'];
    if (!apiKey) {
      throw new Error('Header x-tiflux-api-key obrigatorio');
    }

    // 5. Gerar ou extrair session ID
    const sessionId = headers['mcp-session-id'] || this.generateSessionId();

    return {
      method,
      path,
      headers,
      body,
      apiKey,        // API key do cliente
      sessionId,     // Session ID para tracking
      rawEvent: event
    };
  }

  // Hash parcial para logging SEGURO
  static getApiKeyHash(apiKey) {
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
  }
}
```

**Responsabilidade:**
- Extrair dados do evento Lambda
- Normalizar headers (case-insensitive)
- Decodificar base64 se necessario
- Parse JSON body
- **VALIDAR API KEY (CRITICO)**
- Gerar session ID
- Hash seguro para logs

---

### 6. MCPHandler.handleMCPRequest() - Processamento MCP

**Arquivo:** `src/lambda/handler.js`

```javascript
class MCPHandler {
  static async handleMCPRequest(apiKey, body, sessionId) {
    const { method, id } = body;

    console.log('[MCPHandler] Processando requisicao MCP', {
      sessionId,
      mcpMethod: method,
      mcpId: id
    });

    // 1. CRIAR SERVIDOR MCP ISOLADO (stateless)
    const { server } = ServerFactory.createServer(apiKey, sessionId);

    // 2. Processar requisicao MCP por metodo
    let result;

    switch (method) {
      case 'tools/list':
        result = await this.handleToolsList(server);
        break;

      case 'tools/call':
        result = await this.handleToolsCall(server, body);
        break;

      case 'initialize':
        result = await this.handleInitialize(server);
        break;

      default:
        return ResponseBuilder.mcpError(
          `Metodo MCP desconhecido: ${method}`,
          -32601
        );
    }

    // 3. Retornar resposta MCP
    return ResponseBuilder.mcpResponse(result, id, sessionId);
  }
}
```

**Responsabilidade:**
- Criar servidor MCP isolado por request
- Roteamento de metodos MCP (tools/list, tools/call)
- Invocar handlers no servidor
- Construir response HTTP

---

### 7. ServerFactory.createServer() - Factory Isolado

**Arquivo:** `src/lambda/ServerFactory.js`

```javascript
class ServerFactory {
  static createServer(apiKey, sessionId = null) {
    // Log seguro (hash da API key)
    const apiKeyHash = this.getApiKeyHash(apiKey);
    console.log('[ServerFactory] Criando servidor MCP', {
      sessionId,
      apiKeyHash
    });

    // 1. CRIAR INSTANCIA DO SERVIDOR MCP
    const server = new Server(
      {
        name: 'tiflux-mcp-lambda',
        version: '2.0.0'
      },
      {
        capabilities: { tools: {} }
      }
    );

    // 2. CRIAR INSTANCIA DA API COM A API KEY DO CLIENTE
    const api = new TiFluxAPI(apiKey);  // <-- ISOLAMENTO AQUI

    // 3. CRIAR HANDLERS INJETANDO A INSTANCIA DA API
    const handlers = {
      tickets: new TicketHandlers(),
      clients: new ClientHandlers(),
      users: new UserHandlers(),
      stages: new StageHandlers(),
      catalogItems: new CatalogItemHandlers(),
      internalCommunications: new InternalCommunicationsHandlers()
    };

    // 4. INJETAR API NOS HANDLERS (substituir instancia padrao)
    Object.values(handlers).forEach(handler => {
      if (handler.api) {
        handler.api = api;  // <-- CADA HANDLER USA API ISOLADA
      }
    });

    // 5. REGISTRAR HANDLER PARA LISTAR TOOLS
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('[ServerFactory] Listando tools', { sessionId, apiKeyHash });
      return { tools: schemas.all };
    });

    // 6. REGISTRAR HANDLER PARA EXECUTAR TOOLS
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.log('[ServerFactory] Executando tool', {
        sessionId,
        apiKeyHash,
        toolName: name
      });

      let result;

      // Roteamento de tools
      switch (name) {
        case 'get_ticket':
          result = await handlers.tickets.handleGetTicket(args);
          break;

        case 'create_ticket':
          result = await handlers.tickets.handleCreateTicket(args);
          break;

        case 'search_client':
          result = await handlers.clients.handleSearchClient(args);
          break;

        // ... todos os outros tools

        default:
          throw new Error(`Tool desconhecida: ${name}`);
      }

      console.log('[ServerFactory] Tool executada com sucesso', {
        sessionId,
        toolName: name
      });

      return result;
    });

    return { server, handlers };
  }
}
```

**Responsabilidade:**
- **CRIACAO DE SERVIDOR ISOLADO POR REQUEST**
- Instanciar TiFluxAPI com API key especifica
- Criar handlers com API injetada
- Registrar handlers MCP (tools/list, tools/call)
- Roteamento de ferramentas

**CHAVE DO ISOLAMENTO:**
```javascript
const api = new TiFluxAPI(apiKey);  // Cada request = nova instancia
```

---

### 8. Handler Executado - Exemplo: TicketHandlers

**Arquivo:** `src/handlers/tickets.js`

```javascript
class TicketHandlers {
  constructor() {
    // API sera injetada pelo ServerFactory
    this.api = new TiFluxAPI();
  }

  async handleGetTicket(args) {
    const { ticket_number, show_entities, include_filled_entity } = args;

    // Validar parametros
    if (!ticket_number) {
      return {
        content: [{
          type: 'text',
          text: 'Erro: ticket_number e obrigatorio'
        }],
        isError: true
      };
    }

    // Chamar TiFlux API (usa API key injetada)
    const response = await this.api.fetchTicket(ticket_number, {
      show_entities,
      include_filled_entity
    });

    // Tratar erros
    if (response.error) {
      return {
        content: [{
          type: 'text',
          text: `Erro: ${response.error}`
        }],
        isError: true
      };
    }

    // Formatar resposta sucesso
    const ticket = response.data.ticket;
    return {
      content: [{
        type: 'text',
        text: this.formatTicketDetails(ticket)
      }]
    };
  }

  formatTicketDetails(ticket) {
    return `
**Ticket #${ticket.id}**

**Titulo:** ${ticket.title}
**Status:** ${ticket.status?.name || 'N/A'}
**Cliente:** ${ticket.client?.name || 'N/A'}
**Criado:** ${ticket.created_at}
    `.trim();
  }
}
```

**Responsabilidade:**
- Validar parametros da tool
- Chamar TiFlux API (com API key injetada)
- Tratar erros da API
- Formatar resposta MCP

---

### 9. TiFluxAPI - Cliente HTTP

**Arquivo:** `src/api/tiflux-api.js`

```javascript
class TiFluxAPI {
  constructor(apiKey = null) {
    this.baseUrl = 'https://api.tiflux.com/api/v2';
    // API key vem do construtor (Lambda) ou env var (local)
    this.apiKey = apiKey || process.env.TIFLUX_API_KEY;
  }

  async makeRequest(endpoint, method = 'GET', data = null, headers = {}) {
    // Validar API key
    if (!this.apiKey) {
      return {
        error: 'TIFLUX_API_KEY nao configurada',
        status: 'CONFIG_ERROR'
      };
    }

    const url = `${this.baseUrl}${endpoint}`;

    return new Promise((resolve) => {
      const parsedUrl = new URL(url);

      // Headers padrao COM API KEY
      const defaultHeaders = {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,  // <-- API KEY AQUI
        ...headers
      };

      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: defaultHeaders
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const jsonData = JSON.parse(responseData);
            resolve({ data: jsonData, status: res.statusCode });
          } else if (res.statusCode === 401) {
            resolve({
              error: 'Token de API invalido ou expirado',
              status: 401
            });
          } else {
            resolve({
              error: `Erro HTTP ${res.statusCode}`,
              status: res.statusCode
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          error: `Erro de conexao: ${error.message}`,
          status: 'CONNECTION_ERROR'
        });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({
          error: 'Timeout na requisicao (15s)',
          status: 'TIMEOUT'
        });
      });

      if (data && (method === 'POST' || method === 'PUT')) {
        req.write(data);
      }

      req.end();
    });
  }

  async fetchTicket(ticketId, options = {}) {
    const queryParams = [];

    if (options.show_entities) {
      queryParams.push('show_entities=true');
    }
    if (options.include_filled_entity) {
      queryParams.push('include_filled_entity=true');
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    return await this.makeRequest(`/tickets/${ticketId}${queryString}`);
  }
}
```

**Responsabilidade:**
- Fazer requisicoes HTTPS para TiFlux API
- Adicionar header Authorization com API key
- Tratar timeouts e erros
- Parse de responses JSON
- Metodos especializados (fetchTicket, createTicket, etc)

---

### 10. ResponseBuilder - Construtor de Responses HTTP

**Arquivo:** `src/lambda/ResponseBuilder.js`

```javascript
class ResponseBuilder {
  // Response MCP sucesso
  static mcpResponse(result, id, sessionId = null) {
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'x-mcp-session-id': sessionId || 'unknown',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: id,
        result: result
      })
    };
  }

  // Response MCP erro
  static mcpError(message, code, id, sessionId = null) {
    return {
      statusCode: 200,  // MCP errors use 200 + error object
      headers: {
        'content-type': 'application/json',
        'x-mcp-session-id': sessionId || 'unknown',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: id,
        error: {
          code: code,
          message: message
        }
      })
    };
  }

  // Health check
  static health() {
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({
        status: 'healthy',
        service: 'tiflux-mcp',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        transport: 'streamable-http',
        deployment: 'aws-lambda'
      })
    };
  }

  // CORS preflight
  static corsPreFlight() {
    return {
      statusCode: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-tiflux-api-key, mcp-session-id',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  // 404 Not Found
  static notFound(message, sessionId = null) {
    return {
      statusCode: 404,
      headers: {
        'content-type': 'application/json',
        'x-mcp-session-id': sessionId || 'unknown',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: message,
          statusCode: 404
        }
      })
    };
  }
}
```

**Responsabilidade:**
- Construir responses HTTP padronizadas
- Adicionar headers CORS
- Formatar JSON-RPC 2.0
- Tratar diferentes tipos de response (sucesso, erro, health, CORS)

---

## Resumo do Fluxo Completo

```
1. Cliente HTTP
   |
   v
2. AWS Lambda Function URL
   |
   v
3. lambda.js (exports.handler)
   | - Context config
   | - Log inicial
   |
   v
4. MCPHandler.handle(event)
   | - Roteamento paths
   | - Validacao API key
   |
   v
5. EventParser.parse(event)
   | - Extrai headers/body
   | - VALIDA API KEY
   | - Gera session ID
   |
   v
6. MCPHandler.handleMCPRequest(apiKey, body, sessionId)
   | - Cria servidor MCP isolado
   |
   v
7. ServerFactory.createServer(apiKey, sessionId)
   | - new Server() (MCP SDK)
   | - new TiFluxAPI(apiKey)  <-- ISOLAMENTO
   | - Injeta API nos handlers
   | - Registra handlers MCP
   |
   v
8. server.handle('tools/call')
   | - Roteia para handler correto
   |
   v
9. TicketHandlers.handleGetTicket(args)
   | - Valida parametros
   | - Chama this.api.fetchTicket()
   |
   v
10. TiFluxAPI.fetchTicket(ticketId)
    | - makeRequest() com API key
    | - HTTPS para api.tiflux.com
    | - Authorization: Bearer {apiKey}
    |
    v
11. TiFlux API v2
    | - Valida API key
    | - Retorna dados do ticket
    |
    v
12. Response volta pela stack
    |
    v
13. ResponseBuilder.mcpResponse(result, id)
    | - Formata JSON-RPC 2.0
    | - Adiciona headers CORS
    |
    v
14. Lambda retorna response HTTP
    |
    v
15. Cliente recebe response
```

---

## Isolamento Multi-Tenant (CRITICO)

### Como funciona:

**Por Request:**
```javascript
// Request 1 (Cliente A)
const apiKeyA = 'eyJhbGc...AAA';
const apiA = new TiFluxAPI(apiKeyA);  // Instancia isolada
const serverA = createServer(apiKeyA);

// Request 2 (Cliente B) - SIMULTANEO
const apiKeyB = 'eyJhbGc...BBB';
const apiB = new TiFluxAPI(apiKeyB);  // Instancia DIFERENTE
const serverB = createServer(apiKeyB);

// Nao ha compartilhamento entre A e B!
```

**Lifecycle:**
```
Request chega -> Cria instancia -> Processa -> Descarta instancia
                 (nova API key)                 (garbage collected)
```

**Garantias:**
- ✅ Cada request cria novo servidor MCP
- ✅ Cada servidor tem sua propria instancia TiFluxAPI
- ✅ Cada TiFluxAPI usa API key diferente
- ✅ Nenhum estado compartilhado
- ✅ Lambda pode escalar infinitamente sem conflitos

---

## Rate Limiting (Configurado)

**template.yaml:**
```yaml
ReservedConcurrentExecutions: 10
```

**O que acontece:**
```
Requests 1-10:  Processados simultaneamente
Request 11+:    Erro 429 (Too Many Requests)
```

**Fila:**
```
Lambda nao tem fila. Se >10 simultaneos = erro imediato.
Cliente deve implementar retry com backoff.
```

---

## Seguranca

**Validacoes Criticas:**

1. **API Key Obrigatoria** (EventParser.js:60)
   ```javascript
   if (!apiKey) {
     throw new Error('Header x-tiflux-api-key obrigatorio');
   }
   ```

2. **API Key Nunca Logada** (EventParser.js:126)
   ```javascript
   static getApiKeyHash(apiKey) {
     return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
   }
   ```

3. **Isolamento por Request**
   ```javascript
   const api = new TiFluxAPI(apiKey);  // Nova instancia
   ```

4. **Validacao JSON-RPC** (EventParser.js:105)
   ```javascript
   return body.jsonrpc === '2.0' && body.method && body.id;
   ```

---

## Performance

**Cold Start:** ~1-3s (primeira chamada)
**Warm Start:** ~200-500ms

**Otimizacoes:**
- Stateless = sem overhead de sessao
- Instancia nova = sem memory leaks
- Lambda reusa containers quando possivel

**Timeouts:**
- Lambda: 30s max
- TiFlux API: 15s max
- Buffer: 15s para processamento

---

## Monitoramento

**CloudWatch Logs:**
```
[Lambda] Requisicao recebida { requestId: xxx, path: /mcp }
[MCPHandler] Requisicao recebida { sessionId: yyy, apiKeyHash: eyJh...NhA }
[ServerFactory] Criando servidor MCP { sessionId: yyy }
[ServerFactory] Executando tool { toolName: get_ticket }
[ServerFactory] Tool executada com sucesso
[Lambda] Requisicao processada com sucesso
```

**Metricas:**
- Invocations
- Duration
- Errors
- Throttles
- ConcurrentExecutions

---

## Comparacao: Lambda vs Local

| Aspecto | Lambda (lambda.js) | Local (server-sdk.js) |
|---------|-------------------|---------------------|
| Transport | HTTP (Function URL) | stdio (process) |
| Lifecycle | Stateless (nova instancia/request) | Stateful (servidor continuo) |
| API Key | Via header HTTP | Via .env |
| Multi-tenant | Sim (API key por request) | Nao (uma API key) |
| Escalabilidade | Infinita (AWS) | Limitada (processo local) |
| Uso | Producao/Cloud | Desenvolvimento/CLI |

---

Esta e a arquitetura completa! Ficou clara a estrutura?

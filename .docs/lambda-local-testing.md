# Teste Local do Lambda - TiFlux MCP

## Metodos de Teste Local

### Metodo 1: SAM Local (Recomendado)

SAM CLI permite executar Lambda localmente com Docker.

#### Pre-requisitos
```bash
# Instalar Docker
# macOS
brew install docker

# Verificar
docker --version
```

#### Executar Lambda localmente

```bash
cd /home/udo/code/tiflux/tiflux-mcp

# Build
sam build

# Iniciar API local (porta 3000)
sam local start-api
```

#### Testar endpoints locais

```bash
# Health check
curl http://localhost:3000/health

# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Get ticket
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "x-tiflux-api-key: $TIFLUX_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_ticket",
      "arguments": {"ticket_number": "123"}
    }
  }'
```

---

### Metodo 2: Invocar Lambda diretamente

Invocar Lambda localmente passando evento JSON.

#### Criar arquivo de evento de teste

```bash
cat > events/test-health.json <<EOF
{
  "version": "2.0",
  "routeKey": "\$default",
  "rawPath": "/health",
  "requestContext": {
    "http": {
      "method": "GET",
      "path": "/health"
    }
  },
  "headers": {},
  "isBase64Encoded": false
}
EOF
```

```bash
cat > events/test-list-tools.json <<EOF
{
  "version": "2.0",
  "routeKey": "\$default",
  "rawPath": "/mcp",
  "requestContext": {
    "http": {
      "method": "POST",
      "path": "/mcp"
    }
  },
  "headers": {
    "content-type": "application/json",
    "x-tiflux-api-key": "SUA_API_KEY_AQUI"
  },
  "body": "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}",
  "isBase64Encoded": false
}
EOF
```

#### Invocar Lambda local

```bash
# Health check
sam local invoke TiFluxMCPFunction -e events/test-health.json

# List tools
sam local invoke TiFluxMCPFunction -e events/test-list-tools.json
```

---

### Metodo 3: Node.js puro (sem Docker)

Executar handler diretamente com Node.js.

#### Criar script de teste

```bash
cat > test-lambda-local.js <<'EOF'
const handler = require('./lambda').handler;

// Evento de teste (health check)
const eventHealth = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/health',
  requestContext: {
    http: {
      method: 'GET',
      path: '/health'
    }
  },
  headers: {},
  isBase64Encoded: false
};

// Evento de teste (list tools)
const eventListTools = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/mcp',
  requestContext: {
    http: {
      method: 'POST',
      path: '/mcp'
    }
  },
  headers: {
    'content-type': 'application/json',
    'x-tiflux-api-key': process.env.TIFLUX_API_KEY || 'test_key'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  }),
  isBase64Encoded: false
};

// Evento de teste (get ticket)
const eventGetTicket = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/mcp',
  requestContext: {
    http: {
      method: 'POST',
      path: '/mcp'
    }
  },
  headers: {
    'content-type': 'application/json',
    'x-tiflux-api-key': process.env.TIFLUX_API_KEY || 'test_key'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'get_ticket',
      arguments: { ticket_number: '123' }
    }
  }),
  isBase64Encoded: false
};

// Context mock
const context = {
  requestId: 'local-test-' + Date.now(),
  functionName: 'tiflux-mcp-local',
  callbackWaitsForEmptyEventLoop: false
};

async function runTests() {
  console.log('=== Teste 1: Health Check ===');
  const result1 = await handler(eventHealth, context);
  console.log(JSON.stringify(result1, null, 2));

  console.log('\n=== Teste 2: List Tools (sem API key - deve falhar) ===');
  const eventNoKey = { ...eventListTools };
  delete eventNoKey.headers['x-tiflux-api-key'];
  const result2 = await handler(eventNoKey, context);
  console.log(JSON.stringify(result2, null, 2));

  console.log('\n=== Teste 3: List Tools (com API key) ===');
  const result3 = await handler(eventListTools, context);
  console.log(JSON.stringify(result3, null, 2));

  console.log('\n=== Teste 4: Get Ticket ===');
  const result4 = await handler(eventGetTicket, context);
  console.log(JSON.stringify(result4, null, 2));
}

runTests().catch(console.error);
EOF
```

#### Executar testes

```bash
# Definir API key
export TIFLUX_API_KEY="sua_key_aqui"

# Executar
node test-lambda-local.js
```

---

### Metodo 4: Teste unitario com Jest

Criar testes automatizados.

#### Criar arquivo de teste

```bash
cat > tests/lambda-handler.test.js <<'EOF'
const handler = require('../lambda').handler;

describe('Lambda Handler', () => {
  const mockContext = {
    requestId: 'test-123',
    functionName: 'test-function',
    callbackWaitsForEmptyEventLoop: false
  };

  test('Health check deve retornar 200', async () => {
    const event = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/health',
      requestContext: {
        http: { method: 'GET', path: '/health' }
      },
      headers: {},
      isBase64Encoded: false
    };

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('healthy');
  });

  test('Request sem API key deve retornar 401', async () => {
    const event = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/mcp',
      requestContext: {
        http: { method: 'POST', path: '/mcp' }
      },
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }),
      isBase64Encoded: false
    };

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
  });

  test('List tools com API key deve retornar 200', async () => {
    const event = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/mcp',
      requestContext: {
        http: { method: 'POST', path: '/mcp' }
      },
      headers: {
        'content-type': 'application/json',
        'x-tiflux-api-key': 'test_key'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }),
      isBase64Encoded: false
    };

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result).toBeDefined();
  });
});
EOF
```

#### Executar testes Jest

```bash
npm test
```

---

## Comparacao dos Metodos

| Metodo | Pros | Contras | Quando usar |
|--------|------|---------|-------------|
| **SAM Local** | Ambiente real, Docker | Requer Docker | Pre-deploy completo |
| **Invocar direto** | Testa eventos especificos | Verbose | Debug evento especifico |
| **Node.js puro** | Rapido, sem deps | Nao simula Lambda 100% | Dev iterativo rapido |
| **Jest** | Automatizado, CI/CD | Requer setup | Testes continuos |

---

## Workflow Recomendado

### 1. Desenvolvimento inicial
```bash
# Node.js puro para iteracao rapida
node test-lambda-local.js
```

### 2. Validacao pre-deploy
```bash
# SAM Local para ambiente real
sam build
sam local start-api
curl http://localhost:3000/health
```

### 3. CI/CD
```bash
# Jest para testes automatizados
npm test
```

### 4. Deploy
```bash
# Deploy para AWS
sam build && sam deploy
```

---

## Debug Local

### Logs detalhados

```bash
# SAM Local com debug
sam local start-api --debug

# Node.js com debug
NODE_DEBUG=* node test-lambda-local.js
```

### Breakpoints (VS Code)

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Lambda Local",
      "program": "${workspaceFolder}/test-lambda-local.js",
      "env": {
        "TIFLUX_API_KEY": "sua_key_aqui"
      }
    }
  ]
}
```

Adicionar breakpoints e executar: F5

---

## Troubleshooting Local

### Erro: "Docker not running"
```bash
# Iniciar Docker
open -a Docker  # macOS
sudo systemctl start docker  # Linux
```

### Erro: "Port 3000 already in use"
```bash
# Usar porta diferente
sam local start-api --port 3001
```

### Erro: "Module not found"
```bash
# Reinstalar dependencias
rm -rf node_modules
npm install
```

---

**Documento criado em:** 2025-10-09
**Versao:** 1.0
**Recomendacao:** Use SAM Local para testes pre-deploy completos

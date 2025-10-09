#!/usr/bin/env node

/**
 * Script de teste local para Lambda Handler
 *
 * Executa o handler Lambda localmente sem Docker/SAM.
 * Util para desenvolvimento rapido e iterativo.
 *
 * Uso:
 *   export TIFLUX_API_KEY="sua_key"
 *   node test-lambda-local.js
 */

const handler = require('./lambda').handler;

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logResult(statusCode, body) {
  const color = statusCode >= 200 && statusCode < 300 ? 'green' : 'red';
  log(`Status: ${statusCode}`, color);
  console.log(JSON.stringify(body, null, 2));
}

// Mock do Lambda context
const mockContext = {
  requestId: 'local-test-' + Date.now(),
  functionName: 'tiflux-mcp-local',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:local:123456789012:function:tiflux-mcp-local',
  memoryLimitInMB: '512',
  awsRequestId: 'local-' + Math.random().toString(36).substring(7),
  logGroupName: '/aws/lambda/tiflux-mcp-local',
  logStreamName: '2025/10/09/[$LATEST]local',
  callbackWaitsForEmptyEventLoop: false,
  getRemainingTimeInMillis: () => 30000
};

// Eventos de teste
const events = {
  health: {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/health',
    requestContext: {
      http: {
        method: 'GET',
        path: '/health',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'local-123',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    headers: {
      'user-agent': 'curl/7.64.1',
      'accept': '*/*'
    },
    isBase64Encoded: false
  },

  listToolsNoKey: {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/mcp',
    requestContext: {
      http: {
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'local-124',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    headers: {
      'content-type': 'application/json',
      'user-agent': 'curl/7.64.1'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    }),
    isBase64Encoded: false
  },

  listTools: {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/mcp',
    requestContext: {
      http: {
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'local-125',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    headers: {
      'content-type': 'application/json',
      'x-tiflux-api-key': process.env.TIFLUX_API_KEY || 'test_key',
      'user-agent': 'curl/7.64.1'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    }),
    isBase64Encoded: false
  },

  getTicket: {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/mcp',
    requestContext: {
      http: {
        method: 'POST',
        path: '/mcp',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'local-126',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    headers: {
      'content-type': 'application/json',
      'x-tiflux-api-key': process.env.TIFLUX_API_KEY || 'test_key',
      'user-agent': 'curl/7.64.1'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_ticket',
        arguments: {
          ticket_number: '123'
        }
      }
    }),
    isBase64Encoded: false
  },

  notFound: {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/unknown',
    requestContext: {
      http: {
        method: 'GET',
        path: '/unknown',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'curl/7.64.1'
      },
      requestId: 'local-127',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    headers: {},
    isBase64Encoded: false
  }
};

async function runTests() {
  console.log('\n');
  log('┌─────────────────────────────────────────────────────────┐', 'cyan');
  log('│    TiFlux MCP Lambda - Testes Locais                   │', 'cyan');
  log('└─────────────────────────────────────────────────────────┘', 'cyan');

  if (!process.env.TIFLUX_API_KEY) {
    log('\n⚠️  Aviso: TIFLUX_API_KEY nao definida', 'yellow');
    log('Alguns testes usarao API key de teste (nao funcionarao com TiFlux API real)\n', 'yellow');
  } else {
    log(`\n✓ TIFLUX_API_KEY: ${process.env.TIFLUX_API_KEY.substring(0, 8)}...`, 'green');
  }

  const tests = [
    {
      name: 'Teste 1: Health Check',
      event: events.health,
      expectStatus: 200
    },
    {
      name: 'Teste 2: List Tools (sem API key - deve falhar)',
      event: events.listToolsNoKey,
      expectStatus: 401
    },
    {
      name: 'Teste 3: List Tools (com API key)',
      event: events.listTools,
      expectStatus: 200
    },
    {
      name: 'Teste 4: Get Ticket (requer API key real)',
      event: events.getTicket,
      expectStatus: 200
    },
    {
      name: 'Teste 5: Path nao encontrado',
      event: events.notFound,
      expectStatus: 404
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    logSection(test.name);

    try {
      const startTime = Date.now();
      const result = await handler(test.event, mockContext);
      const duration = Date.now() - startTime;

      const body = result.body ? JSON.parse(result.body) : {};

      logResult(result.statusCode, body);

      // Validar status code
      if (result.statusCode === test.expectStatus) {
        log(`\n✓ Status code correto: ${result.statusCode}`, 'green');
        log(`⏱  Tempo: ${duration}ms`, 'gray');
        passed++;
      } else {
        log(`\n✗ Status code incorreto: esperado ${test.expectStatus}, recebido ${result.statusCode}`, 'red');
        failed++;
      }

    } catch (error) {
      log(`\n✗ Erro: ${error.message}`, 'red');
      log(error.stack, 'gray');
      failed++;
    }
  }

  // Resumo
  logSection('Resumo dos Testes');
  log(`Total: ${tests.length}`, 'cyan');
  log(`✓ Passou: ${passed}`, 'green');
  if (failed > 0) {
    log(`✗ Falhou: ${failed}`, 'red');
  }

  console.log('\n');

  if (failed === 0) {
    log('🎉 Todos os testes passaram!', 'green');
    process.exit(0);
  } else {
    log('❌ Alguns testes falharam', 'red');
    process.exit(1);
  }
}

// Executar testes
runTests().catch((error) => {
  log(`\n✗ Erro fatal: ${error.message}`, 'red');
  console.error(error.stack);
  process.exit(1);
});

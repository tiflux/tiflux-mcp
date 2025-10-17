#!/usr/bin/env node

/**
 * Teste local para upload de arquivos via base64
 *
 * Testa a nova funcionalidade de envio de arquivos em base64
 * para Internal Communications e Ticket Answers
 *
 * Uso:
 *   export TIFLUX_API_KEY="sua_key"
 *   node test-base64-upload.js
 */

const handler = require('./lambda').handler;
const fs = require('fs');
const path = require('path');

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

// Mock do Lambda context
const mockContext = {
  requestId: 'local-test-' + Date.now(),
  functionName: 'tiflux-mcp-local',
  functionVersion: '1',
  awsRequestId: 'local-' + Math.random().toString(36).substring(7),
  getRemainingTimeInMillis: () => 30000
};

// Criar arquivo de teste pequeno
function createTestFile() {
  let testContent = 'Este é um arquivo de teste para upload via base64\n';
  testContent += 'Linha 2\n';
  testContent += 'Linha 3\n';
  testContent += `Timestamp: ${new Date().toISOString()}\n`;

  return Buffer.from(testContent, 'utf-8');
}

// Converter para base64
function fileToBase64(buffer) {
  return buffer.toString('base64');
}

async function runTests() {
  console.log('\n');
  log('┌─────────────────────────────────────────────────────────┐', 'cyan');
  log('│    TiFlux MCP - Teste de Upload Base64                 │', 'cyan');
  log('└─────────────────────────────────────────────────────────┘', 'cyan');

  if (!process.env.TIFLUX_API_KEY) {
    log('\n❌ Erro: TIFLUX_API_KEY não definida', 'red');
    log('Execute: export TIFLUX_API_KEY="sua_key"\n', 'yellow');
    process.exit(1);
  }

  log(`\n✓ TIFLUX_API_KEY: ${process.env.TIFLUX_API_KEY.substring(0, 8)}...`, 'green');

  // Criar arquivo de teste
  const testBuffer = createTestFile();
  const testBase64 = fileToBase64(testBuffer);

  log(`✓ Arquivo de teste criado: ${testBuffer.length} bytes`, 'green');
  log(`✓ Base64 gerado: ${testBase64.length} caracteres\n`, 'green');

  // Pedir número do ticket
  const ticketNumber = process.argv[2] || '85890';
  log(`📋 Usando ticket: #${ticketNumber}\n`, 'cyan');

  const tests = [
    {
      name: 'Teste 1: Internal Communication com arquivo base64',
      event: {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/mcp',
        requestContext: {
          http: {
            method: 'POST',
            path: '/mcp',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test-script'
          },
          requestId: 'test-base64-1',
          time: new Date().toISOString(),
          timeEpoch: Date.now()
        },
        headers: {
          'content-type': 'application/json',
          'x-tiflux-api-key': process.env.TIFLUX_API_KEY,
          'user-agent': 'test-script'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'create_internal_communication',
            arguments: {
              ticket_number: ticketNumber,
              text: 'Teste de upload via base64 - Internal Communication\n\nArquivo anexado via base64 encoding.',
              files_base64: [
                {
                  content: testBase64,
                  filename: 'teste-base64.txt'
                }
              ]
            }
          }
        }),
        isBase64Encoded: false
      }
    },
    {
      name: 'Teste 2: Validação de arquivo base64 inválido (sem filename)',
      event: {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/mcp',
        requestContext: {
          http: {
            method: 'POST',
            path: '/mcp',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test-script'
          },
          requestId: 'test-base64-2',
          time: new Date().toISOString(),
          timeEpoch: Date.now()
        },
        headers: {
          'content-type': 'application/json',
          'x-tiflux-api-key': process.env.TIFLUX_API_KEY,
          'user-agent': 'test-script'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'create_internal_communication',
            arguments: {
              ticket_number: ticketNumber,
              text: 'Este teste deve falhar - arquivo sem filename',
              files_base64: [
                {
                  content: testBase64
                  // filename ausente (erro esperado)
                }
              ]
            }
          }
        }),
        isBase64Encoded: false
      }
    },
    {
      name: 'Teste 3: Listar tools para verificar schema atualizado',
      event: {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/mcp',
        requestContext: {
          http: {
            method: 'POST',
            path: '/mcp',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test-script'
          },
          requestId: 'test-base64-3',
          time: new Date().toISOString(),
          timeEpoch: Date.now()
        },
        headers: {
          'content-type': 'application/json',
          'x-tiflux-api-key': process.env.TIFLUX_API_KEY,
          'user-agent': 'test-script'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list'
        }),
        isBase64Encoded: false
      }
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

      console.log(JSON.stringify(body, null, 2));

      if (result.statusCode >= 200 && result.statusCode < 300) {
        log(`\n✓ Status: ${result.statusCode}`, 'green');
        log(`⏱  Tempo: ${duration}ms`, 'gray');
        passed++;
      } else {
        log(`\n⚠️  Status: ${result.statusCode}`, 'yellow');
        log(`⏱  Tempo: ${duration}ms`, 'gray');

        // Para teste 2, esperamos erro de validação
        if (test.name.includes('inválido')) {
          log('✓ Erro esperado - validação funcionou', 'green');
          passed++;
        } else {
          failed++;
        }
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
    log('\n📝 Próximos passos:', 'cyan');
    log('1. Verificar no TiFlux se a comunicação interna foi criada', 'gray');
    log(`2. Acessar: https://app.tiflux.com/tickets/${ticketNumber}`, 'gray');
    log('3. Verificar se o arquivo foi anexado corretamente', 'gray');
    log('4. Se tudo OK, fazer deploy: sam build && sam deploy\n', 'gray');
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

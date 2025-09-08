#!/usr/bin/env node

// Script de debug para ver exatamente o que o Claude Code está enviando

const readline = require('readline');
const fs = require('fs');

const logFile = '/tmp/tiflux-mcp-debug.log';

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.error(logMessage.trim());
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

log('TiFlux MCP Debug - Iniciando...');
log(`PID: ${process.pid}`);
log(`Args: ${JSON.stringify(process.argv)}`);
log(`ENV: ${JSON.stringify(process.env)}`);

let messageCount = 0;

rl.on('line', (line) => {
  messageCount++;
  log(`Mensagem ${messageCount}: ${line}`);
  
  try {
    const request = JSON.parse(line);
    log(`Parsed: ${JSON.stringify(request, null, 2)}`);
    
    // Resposta mínima válida
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: request.method === 'initialize' ? {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'debug', version: '1.0.0' },
        capabilities: { tools: true }
      } : { tools: [] }
    };
    
    const responseStr = JSON.stringify(response);
    log(`Respondendo: ${responseStr}`);
    process.stdout.write(responseStr + '\n');
    
  } catch (error) {
    log(`Erro: ${error.message}`);
  }
});

rl.on('close', () => {
  log('Conexão fechada');
});

process.on('SIGTERM', () => {
  log('Recebido SIGTERM');
  process.exit(0);
});

// Manter vivo por 30 segundos
setTimeout(() => {
  log('Timeout - encerrando');
  process.exit(0);
}, 30000);
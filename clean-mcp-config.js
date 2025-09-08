#!/usr/bin/env node

/**
 * Script para limpar TODAS as configurações MCP tiflux do Claude Code
 */

const fs = require('fs');

const configPath = '/home/udo/.claude.json';

try {
  console.log('Lendo configuração atual...');
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);
  
  let removidos = 0;
  
  // Verificar na raiz e em qualquer lugar da estrutura JSON
  function limparTiflux(obj, caminho = '') {
    if (typeof obj === 'object' && obj !== null) {
      // Se for um objeto com chaves que parecem servidores MCP
      if (typeof obj === 'object' && !Array.isArray(obj)) {
        const keys = Object.keys(obj);
        keys.forEach(key => {
          if (key.includes('tiflux')) {
            console.log(`- Removendo: ${key} em ${caminho}`);
            delete obj[key];
            removidos++;
          }
        });
        
        // Recursivamente limpar subobjetos
        keys.forEach(key => {
          if (obj[key] && typeof obj[key] === 'object') {
            limparTiflux(obj[key], caminho ? `${caminho}.${key}` : key);
          }
        });
      }
    }
  }
  
  limparTiflux(config, 'config');
  
  // Buscar em projetos específicos também
  Object.keys(config).forEach(projeto => {
    if (typeof config[projeto] === 'object' && config[projeto].mcpServers) {
      console.log(`\nVerificando projeto: ${projeto}`);
      Object.keys(config[projeto].mcpServers).forEach(key => {
        if (key.includes('tiflux')) {
          console.log(`- Removendo: ${key} em ${projeto}`);
          delete config[projeto].mcpServers[key];
          removidos++;
        }
      });
    }
  });
  
  console.log(`\n✅ Total removido: ${removidos} configurações tiflux`);
  
  if (removidos > 0) {
    console.log('Salvando configuração limpa...');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Configuração salva com sucesso!');
  } else {
    console.log('ℹ️ Nenhuma configuração tiflux encontrada para remover.');
  }
  
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
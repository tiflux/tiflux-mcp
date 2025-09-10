#!/usr/bin/env node

/**
 * Teste da correção do update_ticket
 */

const TiFluxAPI = require('./src/api/tiflux-api');

async function testUpdateTicket() {
  console.log('🧪 Testando update_ticket após correção...');
  
  const api = new TiFluxAPI();
  
  // Teste de atualização do ticket 80137
  const ticketId = '80137';
  const updateData = {
    title: 'Retirar dos logs o conteúdo das mensagens no consumer - TESTE MCP'
  };
  
  console.log(`📝 Atualizando ticket #${ticketId}...`);
  console.log('Dados:', updateData);
  
  const response = await api.updateTicket(ticketId, updateData);
  
  if (response.error) {
    console.error('❌ Erro:', response.error);
    console.error('Status:', response.status);
  } else {
    console.log('✅ Sucesso!');
    console.log('Ticket atualizado:', response.data.title);
    console.log('Atualizado em:', response.data.updated_at);
  }
}

// Executar teste
testUpdateTicket().catch(console.error);
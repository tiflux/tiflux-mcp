#!/usr/bin/env node

/**
 * Script de teste para as funcionalidades de comunicações internas
 */

const TiFluxAPI = require('./src/api/tiflux-api');
const InternalCommunicationsHandlers = require('./src/handlers/internal_communications');

async function testInternalCommunications() {
  console.log('🧪 Testando funcionalidades de comunicações internas...\n');
  
  const handlers = new InternalCommunicationsHandlers();
  const testTicketNumber = '1'; // Ticket de teste
  
  try {
    // Teste 1: Listar comunicações internas
    console.log('📋 Teste 1: Listar comunicações internas do ticket #' + testTicketNumber);
    const listResult = await handlers.handleListInternalCommunications({
      ticket_number: testTicketNumber,
      offset: 1,
      limit: 5
    });
    
    console.log('Resultado:');
    console.log(listResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Teste 2: Criar comunicação interna (apenas texto)
    console.log('✍️ Teste 2: Criar comunicação interna no ticket #' + testTicketNumber);
    const createResult = await handlers.handleCreateInternalCommunication({
      ticket_number: testTicketNumber,
      text: 'Comunicação interna de teste criada via MCP TiFlux - ' + new Date().toISOString()
    });
    
    console.log('Resultado:');
    console.log(createResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Teste 3: Validação de parâmetros obrigatórios
    console.log('⚠️ Teste 3: Validação - ticket_number obrigatório');
    try {
      await handlers.handleListInternalCommunications({
        offset: 1,
        limit: 5
      });
    } catch (error) {
      console.log('✅ Validação funcionou:', error.message);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Teste 4: Validação de parâmetros obrigatórios para criação
    console.log('⚠️ Teste 4: Validação - text obrigatório na criação');
    try {
      await handlers.handleCreateInternalCommunication({
        ticket_number: testTicketNumber
      });
    } catch (error) {
      console.log('✅ Validação funcionou:', error.message);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Teste 5: Teste de paginação
    console.log('📄 Teste 5: Paginação - página 2');
    const paginationResult = await handlers.handleListInternalCommunications({
      ticket_number: testTicketNumber,
      offset: 2,
      limit: 3
    });
    
    console.log('Resultado:');
    console.log(paginationResult.content[0].text);
    
    console.log('\n🎉 Todos os testes concluídos!');
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    process.exit(1);
  }
}

// Verificar variáveis de ambiente
if (!process.env.TIFLUX_API_KEY) {
  console.error('❌ TIFLUX_API_KEY não configurada');
  console.log('Configure a variável de ambiente antes de executar os testes:');
  console.log('export TIFLUX_API_KEY="sua_chave_aqui"');
  process.exit(1);
}

// Executar testes
testInternalCommunications().catch(console.error);
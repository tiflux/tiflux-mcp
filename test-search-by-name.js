#!/usr/bin/env node

/**
 * Teste para a nova funcionalidade de busca de tickets por nome de mesa e estágio
 */

const TicketHandlers = require('./src/handlers/tickets');

async function testSearchByName() {
  const handler = new TicketHandlers();
  
  console.log('🧪 Testando busca de tickets por nome de mesa e estágio...\n');
  
  // Teste 1: Busca por nome de mesa apenas
  console.log('📋 Teste 1: Buscar tickets da mesa "cansados"');
  try {
    const result1 = await handler.handleListTickets({
      desk_name: 'cansados'
    });
    console.log('✅ Resultado:', result1.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Erro:', error.message, '\n');
  }
  
  // Teste 2: Busca por nome de mesa e estágio
  console.log('📋 Teste 2: Buscar tickets no estágio "to do" da mesa "cansados"');
  try {
    const result2 = await handler.handleListTickets({
      desk_name: 'cansados',
      stage_name: 'to do'
    });
    console.log('✅ Resultado:', result2.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Erro:', error.message, '\n');
  }
  
  // Teste 3: Busca por mesa inexistente
  console.log('📋 Teste 3: Buscar tickets da mesa "mesa_inexistente"');
  try {
    const result3 = await handler.handleListTickets({
      desk_name: 'mesa_inexistente'
    });
    console.log('✅ Resultado:', result3.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Erro:', error.message, '\n');
  }
  
  console.log('🏁 Testes concluídos!');
}

// Executar testes apenas se chamado diretamente
if (require.main === module) {
  testSearchByName().catch(console.error);
}

module.exports = testSearchByName;
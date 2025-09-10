#!/usr/bin/env node

/**
 * Teste da nova função list_tickets
 */

const TiFluxAPI = require('./src/api/tiflux-api');
const TicketHandlers = require('./src/handlers/tickets');

async function testListTickets() {
  console.log('🧪 Testando nova função list_tickets...\n');
  
  const api = new TiFluxAPI();
  const handler = new TicketHandlers();

  // Teste 1: Sem filtros obrigatórios (deve dar erro)
  console.log('🔍 Teste 1: Sem filtros obrigatórios');
  const test1 = await handler.handleListTickets({});
  console.log('Resultado:', test1.content[0].text.substring(0, 100) + '...\n');

  // Teste 2: Com filtro de mesa
  console.log('🔍 Teste 2: Listando tickets da mesa ID 1');
  const test2 = await handler.handleListTickets({
    desk_ids: '1',
    limit: 5
  });
  console.log('Resultado:', test2.content[0].text.substring(0, 200) + '...\n');

  // Teste 3: Testando API diretamente
  console.log('🔍 Teste 3: Chamada direta da API');
  const apiResponse = await api.listTickets({ desk_ids: '1', limit: 3 });
  
  if (apiResponse.error) {
    console.error('❌ Erro na API:', apiResponse.error);
  } else {
    console.log('✅ API funcionando!');
    console.log(`Retornou ${apiResponse.data?.length || 0} tickets`);
    if (apiResponse.data && apiResponse.data.length > 0) {
      console.log('Primeiro ticket:', {
        id: apiResponse.data[0].ticket_number,
        title: apiResponse.data[0].title?.substring(0, 50) + '...'
      });
    }
  }

  console.log('\n✅ Teste concluído!');
}

// Executar teste
testListTickets().catch(console.error);
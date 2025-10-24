const TicketValidator = require('./src/domain/tickets/TicketValidator');
const TicketMapper = require('./src/domain/tickets/TicketMapper');

// Mock container
const mockContainer = {
  resolve: (name) => {
    if (name === 'logger') {
      return {
        debug: () => {},
        info: () => {},
        error: () => {},
        startTimer: () => () => {}
      };
    }
    if (name === 'config') {
      return {
        get: () => ({})
      };
    }
    if (name === 'searchService') {
      return {
        searchClient: async () => null,
        searchUser: async () => null,
        searchStage: async () => null,
        searchCatalogItem: async () => null
      };
    }
  }
};

async function testUpdate() {
  console.log('=== Teste de Update MCP ===\n');

  const validator = new TicketValidator(mockContainer);
  const mapper = new TicketMapper(mockContainer);

  // Dados de entrada
  const updateData = {
    ticket_number: '80850',
    desk_id: 42821,
    services_catalogs_item_id: 1388284
  };

  console.log('1. Dados de entrada:');
  console.log(JSON.stringify(updateData, null, 2));
  console.log();

  // Validação
  console.log('2. Após validação:');
  const validatedData = await validator.validateUpdateData(updateData);
  console.log(JSON.stringify(validatedData, null, 2));
  console.log();

  // Mapeamento para API
  console.log('3. Payload para API:');
  const apiData = mapper.mapUpdateToAPI(validatedData);
  console.log(JSON.stringify(apiData, null, 2));
  console.log();

  // Comparar com curl que funciona
  console.log('4. Payload do curl que funciona:');
  const curlPayload = {
    desk_id: 42821,
    services_catalogs_item_id: 1388284
  };
  console.log(JSON.stringify(curlPayload, null, 2));
  console.log();

  // Diferenças
  console.log('5. Campos presentes:');
  console.log('  - MCP apiData:', Object.keys(apiData));
  console.log('  - curl payload:', Object.keys(curlPayload));
  console.log();

  console.log('6. Valores dos campos:');
  console.log('  - MCP desk_id:', apiData.desk_id, '(tipo:', typeof apiData.desk_id, ')');
  console.log('  - curl desk_id:', curlPayload.desk_id, '(tipo:', typeof curlPayload.desk_id, ')');
  console.log('  - MCP services_catalogs_item_id:', apiData.services_catalogs_item_id, '(tipo:', typeof apiData.services_catalogs_item_id, ')');
  console.log('  - curl services_catalogs_item_id:', curlPayload.services_catalogs_item_id, '(tipo:', typeof curlPayload.services_catalogs_item_id, ')');
}

testUpdate().catch(console.error);

const TicketMapper = require('./src/domain/tickets/TicketMapper');

// Mock container
const mockContainer = {
  resolve: (name) => {
    if (name === 'logger') {
      return {
        debug: () => {},
        info: console.log,
        error: console.error,
        startTimer: () => () => {}
      };
    }
    if (name === 'config') {
      return {};
    }
    return null;
  }
};

// Criar mapper com container mock
const mapper = new TicketMapper(mockContainer);

// Testar mapUpdateToAPI
const updateData = {
  desk_id: 42821,
  services_catalogs_item_id: 793519
};

console.log('\n=== TEST: mapUpdateToAPI ===');
console.log('Input:', JSON.stringify(updateData, null, 2));

const apiData = mapper.mapUpdateToAPI(updateData);
console.log('Output:', JSON.stringify(apiData, null, 2));

// Verificar se services_catalogs_item_id está presente
if (apiData.services_catalogs_item_id) {
  console.log('\n✅ SUCCESS: services_catalogs_item_id is present in output!');
} else {
  console.log('\n❌ FAIL: services_catalogs_item_id is MISSING from output!');
}

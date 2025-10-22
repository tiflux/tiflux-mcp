const TicketValidator = require('./src/domain/tickets/TicketValidator');

// Mock container
const mockContainer = {
  resolve: (name) => {
    if (name === 'logger') {
      return {
        debug: () => {},
        info: console.log,
        warn: console.warn,
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

// Criar validator com container mock
const validator = new TicketValidator(mockContainer);

// Testar validateUpdateData
const updateData = {
  desk_id: 42821,
  services_catalogs_item_id: 793519
};

console.log('\n=== TEST: validateUpdateData ===');
console.log('Input:', JSON.stringify(updateData, null, 2));

validator.validateUpdateData(updateData)
  .then(() => {
    console.log('\n✅ SUCCESS: Validation passed!');
  })
  .catch((error) => {
    console.log('\n❌ FAIL: Validation failed!');
    console.log('Error:', error.message);
  });

#!/usr/bin/env node

const TiFluxAPI = require('./src/api/tiflux-api');

async function test() {
  console.log('=== Teste direto do tiflux-api.js ===\n');

  const api = new TiFluxAPI();

  const updateData = {
    desk_id: 42821,
    services_catalogs_item_id: 1388284
  };

  console.log('Input data:', updateData);
  console.log();

  try {
    console.log('Calling api.updateTicket(80850, updateData)...\n');
    const result = await api.updateTicket('80850', updateData);

    if (result.error) {
      console.log('✗ ERROR from API');
      console.log('Status:', result.status);
      console.log('Error:', result.error);
    } else {
      console.log('✓ SUCCESS');
      console.log('Ticket number:', result.data.ticket_number);
      console.log('Desk:', result.data.desk?.name);
    }
  } catch (error) {
    console.log('✗ EXCEPTION');
    console.log('Error:', error.message);
  }
}

test();

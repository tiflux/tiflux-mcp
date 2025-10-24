#!/usr/bin/env node

// Teste completo do fluxo de update_ticket
process.env.TIFLUX_API_KEY = process.env.TIFLUX_API_KEY || 'test';

const Container = require('./src/core/Container');
const InfrastructureBootstrap = require('./src/infrastructure/InfrastructureBootstrap');
const DomainBootstrap = require('./src/domain/DomainBootstrap');

async function testUpdateTicket() {
  console.log('=== Teste Completo do Fluxo update_ticket ===\n');

  // 1. Criar container
  const container = new Container();

  // 2. Bootstrap infrastructure
  InfrastructureBootstrap.register(container);
  console.log('✓ Infrastructure bootstrapped');

  // 3. Bootstrap domain
  DomainBootstrap.register(container);
  console.log('✓ Domain bootstrapped\n');

  // 4. Resolver ticketService
  const ticketService = container.resolve('ticketService');
  console.log('✓ TicketService resolved\n');

  // 5. Dados de teste
  const updateData = {
    desk_id: 42821,
    services_catalogs_item_id: 1388284
  };

  console.log('Input data:', JSON.stringify(updateData, null, 2));
  console.log();

  // 6. Tentar update
  try {
    console.log('Calling ticketService.updateTicket("80850", updateData)...\n');
    const result = await ticketService.updateTicket('80850', updateData);
    console.log('\n✓ SUCCESS!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('\n✗ ERROR!');
    console.log('Error message:', error.message);
    console.log('Error data:', error.data ? JSON.stringify(error.data, null, 2) : 'none');
  }
}

testUpdateTicket().catch(console.error);

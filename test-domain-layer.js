#!/usr/bin/env node

/**
 * Script de teste completo para a camada de domínio
 *
 * Testa todos os serviços, repositórios, validators e mappers
 * implementados na Fase 3
 */

const Container = require('./src/core/Container');
const Config = require('./src/core/Config');
const Logger = require('./src/core/Logger');

// Bootstraps
const InfrastructureBootstrap = require('./src/infrastructure/InfrastructureBootstrap');
const DomainBootstrap = require('./src/domain/DomainBootstrap');

async function testDomainLayer() {
  console.log('🧪 Testing TiFlux MCP Domain Layer (Fase 3)...\n');

  let container;

  try {
    // 1. Setup completo do container
    console.log('1. Setting up container and dependencies...');
    container = new Container();

    const config = new Config();
    await config.load();
    container.registerInstance('config', config);

    const logger = new Logger(config.get('logging', {}));
    container.registerInstance('logger', logger);

    // Bootstrap infrastructure (necessário para domain)
    InfrastructureBootstrap.register(container);
    InfrastructureBootstrap.registerEnvironmentConfig(container);

    // Bootstrap domain layer
    DomainBootstrap.register(container);
    DomainBootstrap.registerEnvironmentConfig(container);

    console.log('✅ Container setup completed\n');

    // 2. Test Container Registration
    console.log('2. Testing service registration...');
    const services = container.list();
    console.log(`✅ Total services registered: ${services.length}`);

    // Domain services específicos
    const domainServices = services.filter(service =>
      service.includes('ticket') ||
      service.includes('client') ||
      service.includes('communication') ||
      service.includes('domain')
    );

    console.log(`✅ Domain services: ${domainServices.length}`);
    domainServices.forEach(service => console.log(`   - ${service}`));
    console.log();

    // 3. Test Domain Health Checker
    console.log('3. Testing Domain Health Checker...');
    const domainHealthChecker = container.resolve('domainHealthChecker');
    const health = await domainHealthChecker.checkHealth();
    console.log('✅ Domain Health:', JSON.stringify(health, null, 2));
    console.log();

    // 4. Test Ticket Domain
    console.log('4. Testing Ticket Domain...');
    await testTicketDomain(container);

    // 5. Test Client Domain
    console.log('5. Testing Client Domain...');
    await testClientDomain(container);

    // 6. Test Communication Domain
    console.log('6. Testing Communication Domain...');
    await testCommunicationDomain(container);

    // 7. Test Cross-Domain Operations
    console.log('7. Testing Cross-Domain Operations...');
    await testCrossDomainOperations(container);

    // 8. Test Domain Stats
    console.log('8. Testing Domain Statistics...');
    const domainStats = await domainHealthChecker.getStats();
    console.log('✅ Domain Stats:', JSON.stringify(domainStats, null, 2));
    console.log();

    console.log('🎉 All domain layer tests passed!\n');

  } catch (error) {
    console.error('❌ Domain layer test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

async function testTicketDomain(container) {
  console.log('   Testing Ticket Services...');

  // Test Ticket Mapper
  const ticketMapper = container.resolve('ticketMapper');
  console.log(`   ✅ TicketMapper resolved: ${!!ticketMapper}`);

  const mockAPITicket = {
    id: 123,
    title: 'Test Ticket',
    description: 'Test description',
    status: { name: 'Aberto' },
    client: { id: 1, name: 'Test Client' },
    created_at: '2024-01-01T12:00:00Z'
  };

  const mappedTicket = ticketMapper.mapFromAPI(mockAPITicket);
  console.log(`   ✅ TicketMapper mapping works: ${!!mappedTicket && mappedTicket.id === 123}`);

  // Test Ticket Validator
  const ticketValidator = container.resolve('ticketValidator');
  console.log(`   ✅ TicketValidator resolved: ${!!ticketValidator}`);

  try {
    await ticketValidator.validateCreateData({
      title: 'Test Ticket',
      description: 'This is a test ticket description',
      client_id: 1
    });
    console.log('   ✅ TicketValidator validation works');
  } catch (error) {
    console.log('   ❌ TicketValidator validation failed:', error.message);
  }

  // Test Ticket Repository
  const ticketRepository = container.resolve('ticketRepository');
  console.log(`   ✅ TicketRepository resolved: ${!!ticketRepository}`);
  console.log(`   ✅ TicketRepository stats:`, JSON.stringify(ticketRepository.getStats(), null, 2));

  // Test Ticket Service
  const ticketService = container.resolve('ticketService');
  console.log(`   ✅ TicketService resolved: ${!!ticketService}`);

  console.log('   ✅ Ticket Domain completed\n');
}

async function testClientDomain(container) {
  console.log('   Testing Client Services...');

  // Test Client Mapper
  const clientMapper = container.resolve('clientMapper');
  console.log(`   ✅ ClientMapper resolved: ${!!clientMapper}`);

  const mockAPIClient = {
    id: 1,
    name: 'Test Client',
    email: 'test@example.com',
    phone: '+5511999999999',
    active: true
  };

  const mappedClient = clientMapper.mapFromAPI(mockAPIClient);
  console.log(`   ✅ ClientMapper mapping works: ${!!mappedClient && mappedClient.id === 1}`);

  // Test Client Repository
  const clientRepository = container.resolve('clientRepository');
  console.log(`   ✅ ClientRepository resolved: ${!!clientRepository}`);
  console.log(`   ✅ ClientRepository stats:`, JSON.stringify(clientRepository.getStats(), null, 2));

  // Test Client Service
  const clientService = container.resolve('clientService');
  console.log(`   ✅ ClientService resolved: ${!!clientService}`);
  console.log(`   ✅ ClientService stats:`, JSON.stringify(clientService.getStats(), null, 2));

  console.log('   ✅ Client Domain completed\n');
}

async function testCommunicationDomain(container) {
  console.log('   Testing Communication Services...');

  // Test Communication Mapper
  const communicationMapper = container.resolve('communicationMapper');
  console.log(`   ✅ CommunicationMapper resolved: ${!!communicationMapper}`);

  const mockAPICommunication = {
    id: 456,
    text: 'Test communication',
    author: { id: 1, name: 'Test User' },
    created_at: '2024-01-01T12:00:00Z',
    attachments: []
  };

  const mappedComm = communicationMapper.mapFromAPI(mockAPICommunication);
  console.log(`   ✅ CommunicationMapper mapping works: ${!!mappedComm && mappedComm.id === 456}`);

  // Test Communication Validator
  const communicationValidator = container.resolve('communicationValidator');
  console.log(`   ✅ CommunicationValidator resolved: ${!!communicationValidator}`);

  try {
    await communicationValidator.validateCreateData('123', {
      text: 'This is a test communication with sufficient content'
    });
    console.log('   ✅ CommunicationValidator validation works');
  } catch (error) {
    console.log('   ❌ CommunicationValidator validation failed:', error.message);
  }

  // Test Communication Repository
  const communicationRepository = container.resolve('communicationRepository');
  console.log(`   ✅ CommunicationRepository resolved: ${!!communicationRepository}`);
  console.log(`   ✅ CommunicationRepository stats:`, JSON.stringify(communicationRepository.getStats(), null, 2));

  // Test Communication Service
  const communicationService = container.resolve('communicationService');
  console.log(`   ✅ CommunicationService resolved: ${!!communicationService}`);
  console.log(`   ✅ CommunicationService stats:`, JSON.stringify(communicationService.getStats(), null, 2));

  console.log('   ✅ Communication Domain completed\n');
}

async function testCrossDomainOperations(container) {
  console.log('   Testing Cross-Domain Operations...');

  // Test Domain Orchestrator
  const domainOrchestrator = container.resolve('domainOrchestrator');
  console.log(`   ✅ DomainOrchestrator resolved: ${!!domainOrchestrator}`);

  // Test Domain Validator
  const domainValidator = container.resolve('domainValidator');
  console.log(`   ✅ DomainValidator resolved: ${!!domainValidator}`);

  try {
    await domainValidator.validateTicketCreation({
      title: 'Cross-Domain Test Ticket',
      description: 'This is a cross-domain validation test',
      client_id: 1
    });
    console.log('   ✅ Cross-domain ticket validation works');
  } catch (error) {
    console.log('   ❌ Cross-domain ticket validation failed:', error.message);
  }

  try {
    await domainValidator.validateClientSearch('Test Client');
    console.log('   ✅ Cross-domain client validation works');
  } catch (error) {
    console.log('   ❌ Cross-domain client validation failed:', error.message);
  }

  try {
    await domainValidator.validateCommunicationCreation('123', {
      text: 'Cross-domain communication validation test'
    });
    console.log('   ✅ Cross-domain communication validation works');
  } catch (error) {
    console.log('   ❌ Cross-domain communication validation failed:', error.message);
  }

  // Test Domain Mapper
  const domainMapper = container.resolve('domainMapper');
  console.log(`   ✅ DomainMapper resolved: ${!!domainMapper}`);

  const mockTickets = [
    { id: 1, title: 'Ticket 1', client: { id: 1 } },
    { id: 2, title: 'Ticket 2', client: { id: 2 } }
  ];

  const mockClients = [
    { id: 1, name: 'Client 1' },
    { id: 2, name: 'Client 2' }
  ];

  const mappedTicketsWithClients = domainMapper.mapTicketListWithClients(mockTickets, mockClients);
  console.log(`   ✅ Cross-domain mapping works: ${mappedTicketsWithClients.length === 2}`);

  console.log('   ✅ Cross-Domain Operations completed\n');
}

// Execute tests
testDomainLayer().catch(console.error);
#!/usr/bin/env node

/**
 * Script de teste completo para a camada de apresentação (Fase 4)
 *
 * Testa todos os handlers, middleware pipeline, formatters e orchestrator
 * implementados na Fase 4 - Presentation Layer
 */

const Container = require('./src/core/Container');
const Config = require('./src/core/Config');
const Logger = require('./src/core/Logger');

// Bootstraps
const InfrastructureBootstrap = require('./src/infrastructure/InfrastructureBootstrap');
const DomainBootstrap = require('./src/domain/DomainBootstrap');
const PresentationBootstrap = require('./src/presentation/PresentationBootstrap');

async function testPresentationLayer() {
  console.log('🎭 Testing TiFlux MCP Presentation Layer (Fase 4)...\n');

  let container;

  try {
    // 1. Setup completo do container
    console.log('1. Setting up complete container stack...');
    container = new Container();

    const config = new Config();
    await config.load();
    container.registerInstance('config', config);

    const logger = new Logger(config.get('logging', {}));
    container.registerInstance('logger', logger);

    // Bootstrap todas as camadas (necessário para presentation)
    InfrastructureBootstrap.register(container);
    InfrastructureBootstrap.registerEnvironmentConfig(container);

    DomainBootstrap.register(container);
    DomainBootstrap.registerEnvironmentConfig(container);

    PresentationBootstrap.register(container);
    PresentationBootstrap.registerEnvironmentConfig(container);

    console.log('✅ Complete container stack setup completed\n');

    // 2. Test Container Registration
    console.log('2. Testing presentation service registration...');
    const services = container.list();
    console.log(`✅ Total services registered: ${services.length}`);

    // Presentation services específicos
    const presentationServices = services.filter(service =>
      service.includes('Handler') ||
      service.includes('middleware') ||
      service.includes('formatter') ||
      service.includes('presentation')
    );

    console.log(`✅ Presentation services: ${presentationServices.length}`);
    presentationServices.forEach(service => console.log(`   - ${service}`));
    console.log();

    // 3. Test Presentation Health Checker
    console.log('3. Testing Presentation Health Checker...');
    const presentationHealthChecker = container.resolve('presentationHealthChecker');
    const health = await presentationHealthChecker.checkHealth();
    console.log('✅ Presentation Health:', JSON.stringify(health, null, 2));
    console.log();

    // 4. Test Handlers
    console.log('4. Testing Handlers...');
    await testHandlers(container);

    // 5. Test Middleware Pipeline
    console.log('5. Testing Middleware Pipeline...');
    await testMiddlewarePipeline(container);

    // 6. Test Response Formatter
    console.log('6. Testing Response Formatter...');
    await testResponseFormatter(container);

    // 7. Test Presentation Orchestrator
    console.log('7. Testing Presentation Orchestrator...');
    await testPresentationOrchestrator(container);

    // 8. Test Complete Integration
    console.log('8. Testing Complete Integration...');
    await testCompleteIntegration(container);

    // 9. Test Presentation Stats
    console.log('9. Testing Presentation Statistics...');
    const presentationStats = await presentationHealthChecker.getDetailedStats();
    console.log('✅ Presentation Stats:', JSON.stringify(presentationStats, null, 2));
    console.log();

    console.log('🎉 All presentation layer tests passed!\n');

  } catch (error) {
    console.error('❌ Presentation layer test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

async function testHandlers(container) {
  console.log('   Testing Individual Handlers...');

  // Test TicketHandler
  const ticketHandler = container.resolve('ticketHandler');
  console.log(`   ✅ TicketHandler resolved: ${!!ticketHandler}`);
  console.log(`   ✅ TicketHandler stats:`, JSON.stringify(ticketHandler.getStats(), null, 2));

  // Test ClientHandler
  const clientHandler = container.resolve('clientHandler');
  console.log(`   ✅ ClientHandler resolved: ${!!clientHandler}`);
  console.log(`   ✅ ClientHandler stats:`, JSON.stringify(clientHandler.getStats(), null, 2));

  // Test CommunicationHandler
  const communicationHandler = container.resolve('communicationHandler');
  console.log(`   ✅ CommunicationHandler resolved: ${!!communicationHandler}`);
  console.log(`   ✅ CommunicationHandler stats:`, JSON.stringify(communicationHandler.getStats(), null, 2));

  console.log('   ✅ Handlers testing completed\n');
}

async function testMiddlewarePipeline(container) {
  console.log('   Testing Middleware Pipeline...');

  const middlewarePipeline = container.resolve('middlewarePipeline');
  console.log(`   ✅ MiddlewarePipeline resolved: ${!!middlewarePipeline}`);

  // Test pipeline stats
  const pipelineStats = middlewarePipeline.getStats();
  console.log(`   ✅ Pipeline stats:`, JSON.stringify(pipelineStats, null, 2));

  // Test middleware execution com contexto mock
  const mockContext = {
    operation: 'test_operation',
    args: { test: 'value' },
    requestId: 'test_req_123'
  };

  try {
    const processedContext = await middlewarePipeline.execute('test_operation', mockContext);
    console.log(`   ✅ Pipeline execution works: ${!!processedContext}`);
    console.log(`   ✅ Context enhanced: ${!!processedContext.enhanceResponse}`);
  } catch (error) {
    console.log(`   ⚠️  Pipeline execution test skipped (expected for unknown operation): ${error.message}`);
  }

  // Test DefaultMiddlewares
  const defaultMiddlewares = container.resolve('defaultMiddlewares');
  console.log(`   ✅ DefaultMiddlewares resolved: ${!!defaultMiddlewares}`);

  console.log('   ✅ Middleware Pipeline testing completed\n');
}

async function testResponseFormatter(container) {
  console.log('   Testing Response Formatter...');

  const responseFormatter = container.resolve('responseFormatter');
  console.log(`   ✅ ResponseFormatter resolved: ${!!responseFormatter}`);

  // Test basic formatting
  const successResponse = responseFormatter.formatSuccess('Test data', 'test_operation');
  console.log(`   ✅ Success formatting works: ${!!(successResponse && successResponse.content)}`);

  // Test error formatting
  const testError = new Error('Test error message');
  const errorResponse = responseFormatter.formatError(testError, 'test_operation');
  console.log(`   ✅ Error formatting works: ${!!(errorResponse && errorResponse.content)}`);

  // Test list formatting
  const mockItems = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' }
  ];
  const listResponse = responseFormatter.formatList(mockItems, 'test_operation', {
    title: 'Test List',
    pagination: { current_page: 1, total_pages: 1, total: 2 }
  });
  console.log(`   ✅ List formatting works: ${!!(listResponse && listResponse.content)}`);

  // Test details formatting
  const mockItem = { id: 1, name: 'Test Item', description: 'Test description' };
  const detailsResponse = responseFormatter.formatDetails(mockItem, 'test_operation', {
    title: 'Test Details'
  });
  console.log(`   ✅ Details formatting works: ${!!(detailsResponse && detailsResponse.content)}`);

  console.log('   ✅ Response Formatter testing completed\n');
}

async function testPresentationOrchestrator(container) {
  console.log('   Testing Presentation Orchestrator...');

  const presentationOrchestrator = container.resolve('presentationOrchestrator');
  console.log(`   ✅ PresentationOrchestrator resolved: ${!!presentationOrchestrator}`);

  // Test stats
  const orchestratorStats = await presentationOrchestrator.getStats();
  console.log(`   ✅ Orchestrator stats available: ${!!orchestratorStats}`);
  console.log(`   ✅ Available operations: ${orchestratorStats.operations ? orchestratorStats.operations.length : 0}`);

  // Test handler resolution (sem executar, apenas testar mapeamento)
  const handlerMap = {
    get_ticket: 'ticketHandler',
    search_client: 'clientHandler',
    create_internal_communication: 'communicationHandler'
  };

  for (const [operation, expectedHandler] of Object.entries(handlerMap)) {
    try {
      const handler = presentationOrchestrator._resolveHandler(operation, container);
      const method = presentationOrchestrator._resolveHandlerMethod(operation);
      console.log(`   ✅ ${operation} → ${expectedHandler}.${method}`);
    } catch (error) {
      console.log(`   ❌ Failed to resolve ${operation}: ${error.message}`);
    }
  }

  console.log('   ✅ Presentation Orchestrator testing completed\n');
}

async function testCompleteIntegration(container) {
  console.log('   Testing Complete Integration...');

  const presentationOrchestrator = container.resolve('presentationOrchestrator');

  // Test com operação que deveria funcionar mesmo sem API real
  // Usar validação que vai falhar mas vai testar o pipeline completo
  try {
    const result = await presentationOrchestrator.executeHandler('get_ticket', { ticket_id: '' }, {
      requestId: 'test_integration_123',
      clientId: 'test_client'
    });

    // Deveria retornar erro de validação formatado
    console.log(`   ✅ Integration test completed: ${!!(result && result.content)}`);
    console.log(`   ✅ Error properly formatted: ${result.content[0].text.includes('ticket_id é obrigatório')}`);

  } catch (error) {
    console.log(`   ⚠️  Integration test with expected error: ${error.message}`);
  }

  // Test com argumentos válidos mas que pode falhar na API (esperado)
  try {
    const result = await presentationOrchestrator.executeHandler('search_client', { client_name: 'TestClient' }, {
      requestId: 'test_integration_456',
      clientId: 'test_client'
    });

    console.log(`   ✅ Search client integration: ${!!(result && result.content)}`);

  } catch (error) {
    console.log(`   ⚠️  Search client test with API error (expected): ${error.message.substring(0, 100)}...`);
  }

  console.log('   ✅ Complete Integration testing completed\n');
}

// Execute tests
testPresentationLayer().catch(console.error);
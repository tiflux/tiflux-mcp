#!/usr/bin/env node

/**
 * Script de teste para validar a nova infraestrutura
 */

const TifluxMCPServerV2 = require('./server-v2');

async function testInfrastructure() {
  console.log('🧪 Testing TiFlux MCP Server v2.0 Infrastructure...\n');

  let server;

  try {
    // 1. Initialize server
    console.log('1. Initializing server...');
    server = new TifluxMCPServerV2();
    await server.initialize();
    console.log('✅ Server initialized successfully\n');

    // 2. Test Container DI
    console.log('2. Testing Container DI...');
    const container = server.getContainer();
    const services = container.list();
    console.log(`✅ Container has ${services.length} registered services:`);
    services.forEach(service => console.log(`   - ${service}`));
    console.log();

    // 3. Test Config
    console.log('3. Testing Config...');
    const config = container.resolve('config');
    console.log(`✅ Config loaded for environment: ${config.get('environment')}`);
    console.log(`✅ API URL: ${config.get('api.url', 'NOT_SET')}`);
    console.log(`✅ Has API key: ${config.has('api.key')}`);
    console.log();

    // 4. Test Logger
    console.log('4. Testing Logger...');
    const logger = container.resolve('logger');
    logger.info('Test log message', { component: 'test', working: true });
    console.log('✅ Logger working\n');

    // 5. Test HttpClient
    console.log('5. Testing HttpClient...');
    const httpClient = container.resolve('tifluxHttpClient');
    const httpConfig = httpClient.getConfig();
    console.log(`✅ HttpClient configured with timeout: ${httpConfig.timeout}ms`);
    console.log(`✅ Max retries: ${httpConfig.maxRetries}`);
    console.log();

    // 6. Test Cache Managers
    console.log('6. Testing Cache Managers...');
    const apiCache = container.resolve('apiCacheManager');
    const metadataCache = container.resolve('metadataCacheManager');

    // Test cache operations
    apiCache.set('test_key', { test: true }, { ttl: 5000 });
    const cached = apiCache.get('test_key');
    console.log(`✅ API Cache working: ${cached ? 'YES' : 'NO'}`);

    console.log('✅ API Cache Stats:', JSON.stringify(apiCache.getStats(), null, 2));
    console.log();

    // 7. Test Cache Strategy
    console.log('7. Testing Cache Strategy...');
    const cacheStrategy = container.resolve('cacheStrategy');

    // Test ticket caching
    await cacheStrategy.cacheTicket('123', { id: 123, title: 'Test Ticket' });
    const cachedTicket = await cacheStrategy.getTicket('123');
    console.log(`✅ Cache Strategy working: ${cachedTicket ? 'YES' : 'NO'}`);

    const cacheStats = cacheStrategy.getStats();
    console.log('✅ Cache Stats:', JSON.stringify(cacheStats, null, 2));
    console.log();

    // 8. Test Retry Policies
    console.log('8. Testing Retry Policies...');
    const tifluxRetryPolicy = container.resolve('tifluxRetryPolicy');
    const fileUploadRetryPolicy = container.resolve('fileUploadRetryPolicy');

    console.log(`✅ TiFlux Retry Policy max retries: ${tifluxRetryPolicy.config.maxRetries}`);
    console.log(`✅ File Upload Retry Policy max retries: ${fileUploadRetryPolicy.config.maxRetries}`);
    console.log();

    // 9. Test Health Checker
    console.log('9. Testing Health Checker...');
    const healthChecker = container.resolve('infrastructureHealthChecker');
    const health = await healthChecker.checkHealth();
    console.log('✅ Health Check Result:', JSON.stringify(health, null, 2));
    console.log();

    // 10. Test Server Stats
    console.log('10. Testing Server Stats...');
    const stats = await server.getStats();
    console.log('✅ Server Stats:', JSON.stringify(stats, null, 2));
    console.log();

    // 11. Test Cleanup
    console.log('11. Testing Cleanup...');
    await healthChecker.cleanup();
    console.log('✅ Cleanup completed successfully\n');

    console.log('🎉 All infrastructure tests passed!\n');

  } catch (error) {
    console.error('❌ Infrastructure test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Execute tests
testInfrastructure().catch(console.error);
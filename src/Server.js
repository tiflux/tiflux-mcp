#!/usr/bin/env node
/**
 * TiFlux MCP Server — modo Server (Clean Architecture residual)
 *
 * Pós vertical-slice migration (2026-04-17), o servidor consome o HandlerRegistry
 * central (src/registry/) em cima dos slices em src/tools/. Apenas 2 camadas
 * compartilhadas permanecem no container DI:
 *   - Infrastructure: HttpClient, Cache, RetryPolicy, Logger estruturado
 *   - Presentation: middleware pipeline + responseFormatter + presentationOrchestrator
 *     (resolve handler via container.resolve('registry') em runtime)
 *
 * A ex-Domain Layer (TicketService/Repository/Validator/Mapper, Clean Arch para
 * clients/communications) foi removida: o projeto é adaptador de protocolo, não
 * domínio rico. Ver .docs/specs/2026-04-16-handler-consolidation-clean-arch/.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');

// Core imports
const Container = require('./core/Container');
const Config = require('./core/Config');
const Logger = require('./core/Logger');

// Bootstrap imports
const InfrastructureBootstrap = require('./infrastructure/InfrastructureBootstrap');
const PresentationBootstrap = require('./presentation/PresentationBootstrap');

// Registry central — schemas e listagem de operacoes
const { createRegistry } = require('./registry');
const { version } = require('../package.json');

class TiFluxMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tiflux-mcp',
        version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.container = null;
    this.logger = null;
    this.presentationOrchestrator = null;
    this.healthChecker = null;
    this.registry = null;
    this.isInitialized = false;
  }

  /**
   * Inicializa o servidor completo
   */
  async initialize() {
    try {
      console.log('🚀 Starting TiFlux MCP Server initialization...');

      // 1. Setup do Container DI
      this.container = new Container();
      console.log('✅ Container DI created');

      // 2. Configuração
      const config = new Config();
      await config.load();
      this.container.registerInstance('config', config);
      console.log('✅ Configuration loaded');

      // 3. Logger
      const logger = new Logger(config.get('logging', {}));
      this.container.registerInstance('logger', logger);
      this.logger = logger;
      this.logger.info('TiFlux MCP Server starting', {
        version,
        environment: config.get('environment', 'development'),
        node_version: process.version
      });

      // 4. Registry central — schemas e roteamento self-describing
      this.registry = createRegistry();
      this.container.registerInstance('registry', this.registry);

      // 5. Bootstrap das camadas
      this.logger.info('Bootstrapping infrastructure layer...');
      InfrastructureBootstrap.register(this.container);
      InfrastructureBootstrap.registerEnvironmentConfig(this.container);

      this.logger.info('Bootstrapping presentation layer...');
      PresentationBootstrap.register(this.container);
      PresentationBootstrap.registerEnvironmentConfig(this.container);

      // 5. Resolve componentes principais
      this.presentationOrchestrator = this.container.resolve('presentationOrchestrator');

      // Health checker agregado
      const self = this;
      this.healthChecker = {
        async checkHealth() {
          const results = {
            server: { status: 'healthy', timestamp: new Date().toISOString() },
            layers: {}
          };

          // Infrastructure health
          try {
            const infraHealthChecker = self.container.resolve('infrastructureHealthChecker');
            results.layers.infrastructure = await infraHealthChecker.checkHealth();
          } catch (error) {
            results.layers.infrastructure = { status: 'error', error: error.message };
          }

          // Presentation health
          try {
            const presentationHealthChecker = self.container.resolve('presentationHealthChecker');
            results.layers.presentation = await presentationHealthChecker.checkHealth();
          } catch (error) {
            results.layers.presentation = { status: 'error', error: error.message };
          }

          return results;
        }
      };

      // 6. Registra handlers MCP
      this._registerMCPHandlers();

      // 7. Teste de inicialização
      await this._performInitializationTest();

      this.isInitialized = true;
      this.logger.info('TiFlux MCP Server initialized successfully', {
        total_services: this.container.list().length,
        layers: ['core', 'infrastructure', 'presentation'],
        operations: await this._getAvailableOperations()
      });

      console.log('🎉 TiFlux MCP Server initialized successfully!');

    } catch (error) {
      const errorMessage = `Failed to initialize TiFlux MCP Server: ${error.message}`;

      if (this.logger) {
        this.logger.error('Server initialization failed', {
          error: error.message,
          stack: error.stack
        });
      } else {
        console.error('❌', errorMessage);
        console.error(error.stack);
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Registra handlers MCP padrão
   */
  _registerMCPHandlers() {
    // List tools handler — schemas vem do registry (self-describing handlers)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = this.registry.getTools();
        this.logger.debug('Listed MCP tools', { toolCount: tools.length });
        return { tools };

      } catch (error) {
        this.logger.error('Failed to list tools', { error: error.message });
        throw new McpError(ErrorCode.InternalError, `Failed to list tools: ${error.message}`);
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: operation, arguments: args } = request.params;

      try {
        this.logger.info('MCP tool called', {
          operation,
          hasArgs: !!args,
          requestId: this._generateRequestId()
        });

        // Verifica se servidor foi inicializado
        if (!this.isInitialized) {
          throw new McpError(ErrorCode.InternalError, 'Server not fully initialized');
        }

        // Valida operação
        const availableOperations = await this._getAvailableOperations();
        if (!availableOperations.includes(operation)) {
          throw new McpError(ErrorCode.InvalidRequest, `Unknown operation: ${operation}`);
        }

        // Executa via presentation orchestrator
        const result = await this.presentationOrchestrator.executeHandler(operation, args, {
          requestId: this._generateRequestId(),
          timestamp: new Date().toISOString()
        });

        this.logger.info('MCP tool executed successfully', {
          operation,
          hasResult: !!result,
          hasContent: !!(result && result.content)
        });

        return result;

      } catch (error) {
        this.logger.error('MCP tool execution failed', {
          operation,
          error: error.message,
          stack: error.stack
        });

        // Se é um McpError, re-throw
        if (error instanceof McpError) {
          throw error;
        }

        // Senão, converte para McpError
        const errorCode = this._getErrorCode(error);
        throw new McpError(errorCode, error.message);
      }
    });

    this.logger.info('MCP handlers registered successfully');
  }

  /**
   * Realiza teste básico de inicialização.
   *
   * Apenas 2 camadas compartilhadas permanecem no container: Infrastructure
   * e Presentation (Clean Arch removida em 2026-04-17).
   */
  async _performInitializationTest() {
    this.logger.info('Performing initialization test...');

    try {
      const health = await this.healthChecker.checkHealth();

      const healthyLayers = Object.values(health.layers).filter(layer =>
        !layer.error && !layer.status !== 'error'
      ).length;

      if (healthyLayers < 2) {
        throw new Error(`Only ${healthyLayers}/2 layers are healthy`);
      }

      const stats = await this.presentationOrchestrator.getStats();
      if (!stats.handlers || Object.keys(stats.handlers).length < 3) {
        throw new Error('Insufficient handlers registered');
      }

      this.logger.info('Initialization test passed', {
        healthyLayers,
        totalHandlers: Object.keys(stats.handlers).length,
        totalOperations: stats.operations ? stats.operations.length : 0
      });

    } catch (error) {
      this.logger.error('Initialization test failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Inicia o servidor
   */
  async start() {
    try {
      // Inicializa se necessário
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Conecta transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('TiFlux MCP Server started successfully', {
        transport: 'stdio',
        pid: process.pid
      });

      console.log('🎉 TiFlux MCP Server is running!');

    } catch (error) {
      const errorMessage = `Failed to start TiFlux MCP Server: ${error.message}`;

      if (this.logger) {
        this.logger.error('Server start failed', {
          error: error.message,
          stack: error.stack
        });
      } else {
        console.error('❌', errorMessage);
      }

      process.exit(1);
    }
  }

  /**
   * Para o servidor gracefully
   */
  async stop() {
    try {
      this.logger.info('Stopping TiFlux MCP Server...');

      if (this.server) {
        await this.server.close();
      }

      // Limpa recursos do container
      if (this.container) {
        // Fecha conexões, limpa caches, etc.
        try {
          const cacheManager = this.container.resolve('cacheManager');
          cacheManager.clear();
        } catch (error) {
          this.logger.warn('Failed to clear cache on shutdown', { error: error.message });
        }
      }

      this.logger.info('TiFlux MCP Server stopped successfully');
      console.log('👋 TiFlux MCP Server stopped');

    } catch (error) {
      this.logger.error('Error stopping server', { error: error.message });
      throw error;
    }
  }

  /**
   * Operacoes disponiveis — fonte unica de verdade e o registry.
   */
  async _getAvailableOperations() {
    return this.registry.listOperations();
  }

  /**
   * Gera ID único para request
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Converte erro para código MCP apropriado
   */
  _getErrorCode(error) {
    const errorName = error.constructor.name;

    switch (errorName) {
      case 'ValidationError':
        return ErrorCode.InvalidRequest;
      case 'NotFoundError':
        return ErrorCode.InvalidRequest;
      case 'TimeoutError':
        return ErrorCode.InternalError;
      case 'NetworkError':
        return ErrorCode.InternalError;
      case 'APIError':
        return ErrorCode.InternalError;
      case 'RateLimitError':
        return ErrorCode.InvalidRequest;
      default:
        return ErrorCode.InternalError;
    }
  }
}

// ============ MAIN EXECUTION ============

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const server = new TiFluxMCPServer();

// Inicia o servidor
server.start().catch((error) => {
  console.error('❌ Fatal error starting server:', error);
  process.exit(1);
});

module.exports = TiFluxMCPServer;
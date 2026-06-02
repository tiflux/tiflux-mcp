#!/usr/bin/env node

/**
 * TiFlux MCP Server v2.0 - Nova Arquitetura
 *
 * Nova implementação com:
 * - Container DI completo
 * - Infrastructure layer (HTTP + Cache)
 * - Logging estruturado
 * - Configuração por ambiente
 * - Error handling robusto
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

// Core components
const Container = require('./src/core/Container');
const Config = require('./src/core/Config');
const Logger = require('./src/core/Logger');

// Infrastructure
const InfrastructureBootstrap = require('./src/infrastructure/InfrastructureBootstrap');

// Registry central de tools — schemas + roteamento self-describing por handler
const { createRegistry } = require('./src/registry');

class TifluxMCPServerV2 {
  constructor() {
    this.container = null;
    this.server = null;
    this.logger = null;
    this.config = null;
    this.registry = null;
    this.isInitialized = false;
  }

  /**
   * Inicializa o servidor com DI Container
   */
  async initialize() {
    try {
      // 1. Setup Container DI
      this.container = new Container();

      // 2. Setup Config
      this.config = new Config();
      await this.config.load();
      this.container.registerInstance('config', this.config);

      // 3. Setup Logger
      this.logger = new Logger(this.config.get('logging', {}));
      this.container.registerInstance('logger', this.logger);

      // 4. Bootstrap Infrastructure Layer
      InfrastructureBootstrap.register(this.container);
      InfrastructureBootstrap.registerEnvironmentConfig(this.container);

      // 5. Setup MCP Server
      this.server = new Server(
        {
          name: 'tiflux-mcp',
          version: '2.0.0',
          vendor: 'TiFlux'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // 6. Criar registry central (instancia handlers + agrega schemas)
      this.registry = createRegistry();

      // 7. Setup handlers
      this.setupHandlers();

      // 8. Health check inicial
      const healthChecker = this.container.resolve('infrastructureHealthChecker');
      const health = await healthChecker.checkHealth();

      this.logger.info('TiFlux MCP Server v2.0 initialized successfully', {
        version: '2.0.0',
        environment: this.config.get('environment'),
        infrastructure: health,
        container: {
          registeredServices: this.container.list().length
        }
      });

      this.isInitialized = true;

    } catch (error) {
      console.error('[FATAL] Failed to initialize TiFlux MCP Server v2.0:', error);
      process.exit(1);
    }
  }

  /**
   * Setup dos handlers MCP — delega schemas e roteamento ao registry.
   */
  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing available tools');
      return { tools: this.registry.getTools() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = Math.random().toString(36).substring(7);

      const timer = this.logger.startTimer(`tool_${name}_${requestId}`);

      this.logger.info('Tool execution started', {
        requestId,
        toolName: name,
        hasArguments: !!args && Object.keys(args).length > 0
      });

      try {
        const result = await this.registry.execute(name, args);

        timer();

        this.logger.info('Tool execution completed successfully', {
          requestId,
          toolName: name,
          hasResult: !!result
        });

        return result;

      } catch (error) {
        timer();

        this.logger.error('Tool execution failed', {
          requestId,
          toolName: name,
          error: error.message,
          stack: error.stack
        });

        throw error;
      }
    });
  }

  /**
   * Executa o servidor
   */
  async run() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info('TiFlux MCP Server v2.0 connected and ready', {
        transport: 'stdio',
        pid: process.pid,
        nodeVersion: process.version
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const cleanup = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Cleanup infrastructure
        const healthChecker = this.container.resolve('infrastructureHealthChecker');
        await healthChecker.cleanup();

        // Cleanup logger
        if (this.logger.close) {
          this.logger.close();
        }

        this.logger.info('Server shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGINT', () => cleanup('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', {
        reason: reason?.toString(),
        promise: promise?.toString()
      });
    });
  }

  /**
   * Retorna estatísticas do servidor
   */
  async getStats() {
    if (!this.isInitialized) {
      return { initialized: false };
    }

    const healthChecker = this.container.resolve('infrastructureHealthChecker');
    const cacheStrategy = this.container.resolve('cacheStrategy');

    return {
      initialized: true,
      version: '2.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      infrastructure: await healthChecker.checkHealth(),
      cache: cacheStrategy.getStats(),
      container: {
        services: this.container.list()
      }
    };
  }

  /**
   * Retorna o container DI (para testes)
   */
  getContainer() {
    return this.container;
  }
}

// Inicializar servidor se executado diretamente
if (require.main === module) {
  const server = new TifluxMCPServerV2();
  server.run().catch((error) => {
    console.error('[FATAL] Server startup failed:', error);
    process.exit(1);
  });
}

module.exports = TifluxMCPServerV2;
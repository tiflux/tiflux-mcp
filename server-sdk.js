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

// Handlers (ainda serão refatorados nas próximas fases)
const schemas = require('./src/schemas');
const TicketHandlers = require('./src/handlers/tickets');
const ClientHandlers = require('./src/handlers/clients');
const UserHandlers = require('./src/handlers/users');
const StageHandlers = require('./src/handlers/stages');
const CatalogItemHandlers = require('./src/handlers/catalog_items');
const InternalCommunicationsHandlers = require('./src/handlers/internal_communications');

class TifluxMCPServerV2 {
  constructor() {
    this.container = null;
    this.server = null;
    this.logger = null;
    this.config = null;

    // Handlers (serão substituídos por services na Fase 3)
    this.ticketHandlers = null;
    this.clientHandlers = null;
    this.userHandlers = null;
    this.stageHandlers = null;
    this.catalogItemHandlers = null;
    this.internalCommunicationsHandlers = null;

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

      // 6. Initialize handlers (temporário até Fase 3)
      this.ticketHandlers = new TicketHandlers();
      this.clientHandlers = new ClientHandlers();
      this.userHandlers = new UserHandlers();
      this.stageHandlers = new StageHandlers();
      this.catalogItemHandlers = new CatalogItemHandlers();
      this.internalCommunicationsHandlers = new InternalCommunicationsHandlers();

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
   * Setup dos handlers MCP
   */
  setupHandlers() {
    // Handler para listar tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing available tools');
      return { tools: schemas.all };
    });

    // Handler para executar tools com logging e error handling
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
        let result;

        // Roteamento por área do sistema (será refatorado na Fase 4)
        switch (name) {
          // Tools de tickets
          case 'get_ticket':
            result = await this.ticketHandlers.handleGetTicket(args);
            break;

          case 'create_ticket':
            result = await this.ticketHandlers.handleCreateTicket(args);
            break;

          case 'update_ticket':
            result = await this.ticketHandlers.handleUpdateTicket(args);
            break;

          case 'list_tickets':
            result = await this.ticketHandlers.handleListTickets(args);
            break;

          case 'cancel_ticket':
            result = await this.ticketHandlers.handleCancelTicket(args);
            break;

          case 'close_ticket':
            result = await this.ticketHandlers.handleCloseTicket(args);
            break;

          case 'create_ticket_answer':
            result = await this.ticketHandlers.handleCreateTicketAnswer(args);
            break;

          case 'get_ticket_files':
            result = await this.ticketHandlers.handleGetTicketFiles(args);
            break;

          case 'update_ticket_entities':
            result = await this.ticketHandlers.handleUpdateTicketEntities(args);
            break;

          // Tools de clientes
          case 'search_client':
            result = await this.clientHandlers.handleSearchClient(args);
            break;

          // Tools de usuários
          case 'search_user':
            result = await this.userHandlers.handleSearchUser(args);
            break;

          // Tools de estágios
          case 'search_stage':
            result = await this.stageHandlers.handleSearchStage(args);
            break;

          // Tools de itens de catálogo
          case 'search_catalog_item':
            result = await this.catalogItemHandlers.handleSearchCatalogItem(args);
            break;

          // Tools de comunicações internas
          case 'create_internal_communication':
            result = await this.internalCommunicationsHandlers.handleCreateInternalCommunication(args);
            break;

          case 'list_internal_communications':
            result = await this.internalCommunicationsHandlers.handleListInternalCommunications(args);
            break;

          case 'get_internal_communication':
            result = await this.internalCommunicationsHandlers.handleGetInternalCommunication(args);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

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

        // Re-throw para MCP SDK handle
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
#!/usr/bin/env node
/**
 * TiFlux MCP Server - Versão Final com Arquitetura Limpa
 *
 * Servidor MCP completo com 4 camadas bem definidas:
 * - Core Layer: Container DI, Config, Logger, Error handling
 * - Infrastructure Layer: HTTP Client, Cache, Retry policies
 * - Domain Layer: Services, Repositories, Validators, Mappers
 * - Presentation Layer: Handlers, Middleware pipeline, Response formatters
 *
 * Características:
 * - Clean Architecture com separação clara de responsabilidades
 * - Container DI para todas as dependências
 * - Pipeline de middleware robusto
 * - Formatação consistente de respostas
 * - Health checks e métricas completas
 * - 100% de compatibilidade com MCP Protocol
 * - Configuração específica por ambiente
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
const DomainBootstrap = require('./domain/DomainBootstrap');
const PresentationBootstrap = require('./presentation/PresentationBootstrap');

class TiFluxMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tiflux-mcp',
        version: '1.0.0'
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
        version: '1.0.0',
        environment: config.get('environment', 'development'),
        node_version: process.version
      });

      // 4. Bootstrap das camadas
      this.logger.info('Bootstrapping infrastructure layer...');
      InfrastructureBootstrap.register(this.container);
      InfrastructureBootstrap.registerEnvironmentConfig(this.container);

      this.logger.info('Bootstrapping domain layer...');
      DomainBootstrap.register(this.container);
      DomainBootstrap.registerEnvironmentConfig(this.container);

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

          // Domain health
          try {
            const domainHealthChecker = self.container.resolve('domainHealthChecker');
            results.layers.domain = await domainHealthChecker.checkHealth();
          } catch (error) {
            results.layers.domain = { status: 'error', error: error.message };
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
        layers: ['core', 'infrastructure', 'domain', 'presentation'],
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
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = [
          // Ticket operations
          {
            name: 'get_ticket',
            description: 'Buscar um ticket específico no TiFlux pelo ID',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_id: { type: 'string', description: 'ID do ticket a ser buscado' }
              },
              required: ['ticket_id']
            }
          },
          {
            name: 'create_ticket',
            description: 'Criar um novo ticket no TiFlux',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título do ticket' },
                description: { type: 'string', description: 'Descrição do ticket' },
                client_id: { type: 'number', description: 'ID do cliente (opcional se client_name fornecido)' },
                client_name: { type: 'string', description: 'Nome do cliente para busca automática' },
                desk_id: { type: 'number', description: 'ID da mesa (opcional)' },
                desk_name: { type: 'string', description: 'Nome da mesa para busca automática' },
                priority_id: { type: 'number', description: 'ID da prioridade (opcional)' },
                services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo (opcional)' },
                responsible_id: { type: 'number', description: 'ID do responsável (opcional)' },
                status_id: { type: 'number', description: 'ID do status (opcional)' },
                requestor_name: { type: 'string', description: 'Nome do solicitante (opcional)' },
                requestor_email: { type: 'string', description: 'Email do solicitante (opcional)' },
                requestor_telephone: { type: 'string', description: 'Telefone do solicitante (opcional)' },
                followers: { type: 'string', description: 'Emails dos seguidores separados por vírgula (opcional)' }
              },
              required: ['title', 'description']
            }
          },
          {
            name: 'update_ticket',
            description: 'Atualizar um ticket existente no TiFlux',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_id: { type: 'string', description: 'ID do ticket a ser atualizado' },
                title: { type: 'string', description: 'Novo título do ticket (opcional)' },
                description: { type: 'string', description: 'Nova descrição do ticket (opcional)' },
                client_id: { type: 'number', description: 'Novo ID do cliente (opcional)' },
                desk_id: { type: 'number', description: 'Novo ID da mesa (opcional)' },
                responsible_id: { type: 'number', description: 'ID do responsável (opcional)' },
                stage_id: { type: 'number', description: 'ID do estágio/fase do ticket (opcional)' },
                followers: { type: 'string', description: 'Emails dos seguidores separados por vírgula (opcional)' }
              },
              required: ['ticket_id']
            }
          },
          {
            name: 'list_tickets',
            description: 'Listar tickets do TiFlux com filtros',
            inputSchema: {
              type: 'object',
              properties: {
                desk_ids: { type: 'string', description: 'IDs das mesas separados por vírgula (máximo 15)' },
                desk_name: { type: 'string', description: 'Nome da mesa para busca automática' },
                client_ids: { type: 'string', description: 'IDs dos clientes separados por vírgula (máximo 15)' },
                stage_ids: { type: 'string', description: 'IDs dos estágios separados por vírgula (máximo 15)' },
                stage_name: { type: 'string', description: 'Nome do estágio para busca automática' },
                responsible_ids: { type: 'string', description: 'IDs dos responsáveis separados por vírgula (máximo 15)' },
                is_closed: { type: 'boolean', description: 'Filtrar tickets fechados (padrão: false - apenas abertos)' },
                limit: { type: 'number', description: 'Número de tickets por página (padrão: 20, máximo: 200)' },
                offset: { type: 'number', description: 'Número da página (padrão: 1)' }
              },
              required: []
            }
          },
          {
            name: 'close_ticket',
            description: 'Fechar um ticket específico no TiFlux',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_number: { type: 'string', description: 'Número do ticket a ser fechado (ex: "37", "123")' }
              },
              required: ['ticket_number']
            }
          },

          // Client operations
          {
            name: 'search_client',
            description: 'Buscar clientes no TiFlux por nome',
            inputSchema: {
              type: 'object',
              properties: {
                client_name: { type: 'string', description: 'Nome do cliente a ser buscado (busca parcial)' }
              },
              required: ['client_name']
            }
          },

          // Communication operations
          {
            name: 'create_internal_communication',
            description: 'Criar uma nova comunicação interna em um ticket específico',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_number: { type: 'string', description: 'Número do ticket onde será criada a comunicação interna' },
                text: { type: 'string', description: 'Conteúdo da comunicação interna' },
                files: {
                  type: 'array',
                  description: 'Lista com os caminhos dos arquivos a serem anexados (opcional, máximo 10 arquivos de 25MB cada)',
                  items: { type: 'string' }
                }
              },
              required: ['ticket_number', 'text']
            }
          },
          {
            name: 'list_internal_communications',
            description: 'Listar comunicações internas existentes em um ticket específico',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_number: { type: 'string', description: 'Número do ticket para listar as comunicações internas' },
                limit: { type: 'number', description: 'Número de comunicações por página (padrão: 20, máximo: 200)' },
                offset: { type: 'number', description: 'Número da página a ser retornada (padrão: 1)' }
              },
              required: ['ticket_number']
            }
          },
          {
            name: 'get_internal_communication',
            description: 'Obter uma comunicação interna específica com texto completo',
            inputSchema: {
              type: 'object',
              properties: {
                ticket_number: { type: 'string', description: 'Número do ticket da comunicação interna' },
                communication_id: { type: 'string', description: 'ID da comunicação interna a ser obtida' }
              },
              required: ['ticket_number', 'communication_id']
            }
          }
        ];

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
   * Realiza teste básico de inicialização
   */
  async _performInitializationTest() {
    this.logger.info('Performing initialization test...');

    try {
      // Testa health checks
      const health = await this.healthChecker.checkHealth();

      const healthyLayers = Object.values(health.layers).filter(layer =>
        !layer.error && !layer.status !== 'error'
      ).length;

      if (healthyLayers < 3) {
        throw new Error(`Only ${healthyLayers}/3 layers are healthy`);
      }

      // Testa presentation orchestrator
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
   * Obtém operações disponíveis
   */
  async _getAvailableOperations() {
    try {
      const stats = await this.presentationOrchestrator.getStats();
      return stats.operations || [];
    } catch (error) {
      this.logger.warn('Failed to get available operations', { error: error.message });
      return [
        'get_ticket', 'create_ticket', 'update_ticket', 'list_tickets', 'close_ticket',
        'search_client', 'create_internal_communication',
        'list_internal_communications', 'get_internal_communication'
      ];
    }
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
/**
 * ServerFactory - Factory para criar instancias isoladas do servidor MCP
 *
 * Cria uma nova instancia do servidor MCP por request (stateless).
 * Cada instancia e configurada com a API key especifica do cliente,
 * garantindo isolamento total de dados entre clientes (multi-tenancy).
 *
 * IMPORTANTE: Esta abordagem stateless e ideal para AWS Lambda porque:
 * - Lambda pode ser reciclado a qualquer momento
 * - Sem gerenciamento de sessoes/TTL
 * - Sem memory leaks
 * - Isolamento total de dados
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

// Schemas das tools
const schemas = require('../schemas');

// Handlers (precisam ser instanciados com API key)
const TicketHandlers = require('../handlers/tickets');
const ClientHandlers = require('../handlers/clients');
const UserHandlers = require('../handlers/users');
const StageHandlers = require('../handlers/stages');
const CatalogItemHandlers = require('../handlers/catalog_items');
const InternalCommunicationsHandlers = require('../handlers/internal_communications');

// API Client
const TiFluxAPI = require('../api/tiflux-api');

class ServerFactory {
  /**
   * Cria uma nova instancia do servidor MCP configurada com API key
   * @param {string} apiKey - API key do TiFlux do cliente
   * @param {string} sessionId - Session ID para logging
   * @returns {Object} - { server, handlers } - Instancia do servidor e handlers
   */
  static createServer(apiKey, sessionId = null) {
    if (!apiKey) {
      throw new Error('API key obrigatoria para criar servidor MCP');
    }

    // Log (sem expor API key completa)
    const apiKeyHash = this.getApiKeyHash(apiKey);
    console.log('[ServerFactory] Criando servidor MCP', {
      sessionId,
      apiKeyHash,
      timestamp: new Date().toISOString()
    });

    // 1. Criar instancia do servidor MCP
    const server = new Server(
      {
        name: 'tiflux-mcp-lambda',
        version: '2.0.0',
        vendor: 'TiFlux'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // 2. Criar instancia da API TiFlux com a API key do cliente
    const api = new TiFluxAPI(apiKey);

    // 3. Criar handlers injetando a instancia da API
    const handlers = {
      tickets: new TicketHandlers(),
      clients: new ClientHandlers(),
      users: new UserHandlers(),
      stages: new StageHandlers(),
      catalogItems: new CatalogItemHandlers(),
      internalCommunications: new InternalCommunicationsHandlers()
    };

    // 4. Injetar API nos handlers (substituir a instancia padrao)
    Object.values(handlers).forEach(handler => {
      if (handler.api) {
        handler.api = api;
      }
    });

    // 5. Registrar handler para listar tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('[ServerFactory] Listando tools', { sessionId, apiKeyHash });
      return { tools: schemas.all };
    });

    // 6. Registrar handler para executar tools
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = Math.random().toString(36).substring(7);

      console.log('[ServerFactory] Executando tool', {
        sessionId,
        apiKeyHash,
        requestId,
        toolName: name,
        timestamp: new Date().toISOString()
      });

      try {
        let result;

        // Roteamento de tools
        switch (name) {
          // Tools de tickets
          case 'get_ticket':
            result = await handlers.tickets.handleGetTicket(args);
            break;
          case 'create_ticket':
            result = await handlers.tickets.handleCreateTicket(args);
            break;
          case 'update_ticket':
            result = await handlers.tickets.handleUpdateTicket(args);
            break;
          case 'list_tickets':
            result = await handlers.tickets.handleListTickets(args);
            break;
          case 'cancel_ticket':
            result = await handlers.tickets.handleCancelTicket(args);
            break;
          case 'close_ticket':
            result = await handlers.tickets.handleCloseTicket(args);
            break;
          case 'create_ticket_answer':
            result = await handlers.tickets.handleCreateTicketAnswer(args);
            break;
          case 'get_ticket_files':
            result = await handlers.tickets.handleGetTicketFiles(args);
            break;
          case 'update_ticket_entities':
            result = await handlers.tickets.handleUpdateTicketEntities(args);
            break;

          // Tools de clientes
          case 'search_client':
            result = await handlers.clients.handleSearchClient(args);
            break;

          // Tools de usuarios
          case 'search_user':
            result = await handlers.users.handleSearchUser(args);
            break;

          // Tools de estagios
          case 'search_stage':
            result = await handlers.stages.handleSearchStage(args);
            break;

          // Tools de itens de catalogo
          case 'search_catalog_item':
            result = await handlers.catalogItems.handleSearchCatalogItem(args);
            break;

          // Tools de comunicacoes internas
          case 'create_internal_communication':
            result = await handlers.internalCommunications.handleCreateInternalCommunication(args);
            break;
          case 'list_internal_communications':
            result = await handlers.internalCommunications.handleListInternalCommunications(args);
            break;
          case 'get_internal_communication':
            result = await handlers.internalCommunications.handleGetInternalCommunication(args);
            break;

          default:
            throw new Error(`Tool desconhecida: ${name}`);
        }

        console.log('[ServerFactory] Tool executada com sucesso', {
          sessionId,
          apiKeyHash,
          requestId,
          toolName: name,
          timestamp: new Date().toISOString()
        });

        return result;

      } catch (error) {
        console.error('[ServerFactory] Erro ao executar tool', {
          sessionId,
          apiKeyHash,
          requestId,
          toolName: name,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });

        // Re-throw para tratamento no handler Lambda
        throw error;
      }
    });

    console.log('[ServerFactory] Servidor MCP criado com sucesso', {
      sessionId,
      apiKeyHash,
      timestamp: new Date().toISOString()
    });

    return { server, handlers };
  }

  /**
   * Hash parcial da API key para logging seguro
   * @param {string} apiKey - API key
   * @returns {string} - Hash parcial
   */
  static getApiKeyHash(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return 'invalid';
    }
    // Mostrar apenas primeiros 4 e ultimos 4 caracteres
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
  }
}

module.exports = ServerFactory;

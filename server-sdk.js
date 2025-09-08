#!/usr/bin/env node

/**
 * TiFlux MCP Server
 * Estrutura modular organizada por áreas do sistema
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

// Importar módulos organizados
const schemas = require('./src/schemas');
const TicketHandlers = require('./src/handlers/tickets');
const ClientHandlers = require('./src/handlers/clients');

class TifluxMCPServer {
  constructor() {
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

    // Inicializar handlers
    this.ticketHandlers = new TicketHandlers();
    this.clientHandlers = new ClientHandlers();

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler para listar tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: schemas.all
    }));

    // Handler para executar tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Roteamento por área do sistema
      switch (name) {
        // Tools de tickets
        case 'get_ticket':
          return this.ticketHandlers.handleGetTicket(args);
        
        case 'create_ticket':
          return this.ticketHandlers.handleCreateTicket(args);
        
        // Tools de clientes
        case 'search_client':
          return this.clientHandlers.handleSearchClient(args);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('[TiFlux MCP v2.0] Servidor refatorado iniciado e conectado');
  }
}

// Inicializar servidor se executado diretamente
if (require.main === module) {
  const server = new TifluxMCPServer();
  server.run().catch(console.error);
}

module.exports = TifluxMCPServer;
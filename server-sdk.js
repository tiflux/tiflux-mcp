#!/usr/bin/env node

/**
 * TiFlux MCP Server usando SDK oficial
 * Baseado no padrão do @playwright/mcp
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

class TifluxMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tiflux-mcp',
        version: '1.0.0',
        vendor: 'TiFlux'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler para listar tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_ticket',
          description: 'Buscar um ticket específico no TiFlux pelo ID',
          inputSchema: {
            type: 'object',
            properties: {
              ticket_id: {
                type: 'string',
                description: 'ID do ticket a ser buscado (ex: "123", "456")'
              }
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
              title: {
                type: 'string',
                description: 'Título do ticket'
              },
              description: {
                type: 'string',
                description: 'Descrição do ticket'
              },
              client_id: {
                type: 'number',
                description: 'ID do cliente (opcional - usa TIFLUX_DEFAULT_CLIENT_ID se não informado)'
              },
              desk_id: {
                type: 'number',
                description: 'ID da mesa (opcional - usa TIFLUX_DEFAULT_DESK_ID se não informado)'
              },
              priority_id: {
                type: 'number',
                description: 'ID da prioridade (opcional - usa TIFLUX_DEFAULT_PRIORITY_ID se não informado)'
              },
              services_catalogs_item_id: {
                type: 'number',
                description: 'ID do item de catálogo (opcional - usa TIFLUX_DEFAULT_CATALOG_ITEM_ID se não informado)'
              },
              status_id: {
                type: 'number',
                description: 'ID do status (opcional)'
              },
              requestor_name: {
                type: 'string',
                description: 'Nome do solicitante (opcional)'
              },
              requestor_email: {
                type: 'string',
                description: 'Email do solicitante (opcional)'
              },
              requestor_telephone: {
                type: 'string',
                description: 'Telefone do solicitante (opcional)'
              },
              responsible_id: {
                type: 'number',
                description: 'ID do responsável (opcional)'
              },
              followers: {
                type: 'string',
                description: 'Emails dos seguidores separados por vírgula (opcional)'
              }
            },
            required: ['title', 'description']
          }
        }
      ]
    }));

    // Handler para executar tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name === 'get_ticket') {
        return this.handleGetTicket(args);
      }
      
      if (name === 'create_ticket') {
        return this.handleCreateTicket(args);
      }
      
      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async handleGetTicket(args) {
    const { ticket_id } = args;
    
    if (!ticket_id) {
      throw new Error('ticket_id é obrigatório');
    }

    try {
      // Buscar ticket via API real do TiFlux
      const response = await this.fetchTicketFromAPI(ticket_id);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao buscar ticket #${ticket_id}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
            }
          ]
        };
      }

      const ticket = response.data;
      
      return {
        content: [
          {
            type: 'text',
            text: `**Ticket #${ticket_id}**\n\n` +
                  `**Título:** ${ticket.title || 'N/A'}\n` +
                  `**Status:** ${ticket.status || 'N/A'}\n` +
                  `**Prioridade:** ${ticket.priority || 'N/A'}\n` +
                  `**Cliente:** ${ticket.client?.name || ticket.client_name || 'N/A'}\n` +
                  `**Técnico:** ${ticket.assigned_to?.name || ticket.assigned_to_name || 'Não atribuído'}\n` +
                  `**Criado em:** ${ticket.created_at || 'N/A'}\n` +
                  `**Atualizado em:** ${ticket.updated_at || 'N/A'}\n\n` +
                  `**Descrição:**\n${ticket.description || 'Sem descrição'}\n\n` +
                  `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao buscar ticket #${ticket_id}**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  async handleCreateTicket(args) {
    const { 
      title, 
      description, 
      client_id, 
      desk_id, 
      priority_id, 
      services_catalogs_item_id, 
      status_id,
      requestor_name,
      requestor_email,
      requestor_telephone,
      responsible_id,
      followers
    } = args;
    
    if (!title || !description) {
      throw new Error('title e description são obrigatórios');
    }

    try {
      // Usar valores padrão das variáveis de ambiente se não informados
      const finalClientId = client_id || process.env.TIFLUX_DEFAULT_CLIENT_ID;
      const finalDeskId = desk_id || process.env.TIFLUX_DEFAULT_DESK_ID;
      const finalPriorityId = priority_id || process.env.TIFLUX_DEFAULT_PRIORITY_ID;
      const finalCatalogItemId = services_catalogs_item_id || process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID;
      
      if (!finalClientId || !finalDeskId) {
        throw new Error('client_id e desk_id são obrigatórios (configure TIFLUX_DEFAULT_CLIENT_ID e TIFLUX_DEFAULT_DESK_ID ou informe nos parâmetros)');
      }

      // Criar ticket via API
      const response = await this.createTicketOnAPI({
        title,
        description,
        client_id: parseInt(finalClientId),
        desk_id: parseInt(finalDeskId),
        priority_id: finalPriorityId ? parseInt(finalPriorityId) : undefined,
        services_catalogs_item_id: finalCatalogItemId ? parseInt(finalCatalogItemId) : undefined,
        status_id: status_id ? parseInt(status_id) : undefined,
        requestor_name,
        requestor_email,
        requestor_telephone,
        responsible_id: responsible_id ? parseInt(responsible_id) : undefined,
        followers
      });
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao criar ticket**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique os parâmetros e configurações.*`
            }
          ]
        };
      }

      const ticket = response.data.ticket;
      
      return {
        content: [
          {
            type: 'text',
            text: `**✅ Ticket criado com sucesso!**\n\n` +
                  `**Número:** #${ticket.ticket_number}\n` +
                  `**Título:** ${ticket.title}\n` +
                  `**Cliente:** ${ticket.client.name}\n` +
                  `**Mesa:** ${ticket.desk.display_name}\n` +
                  `**Status:** ${ticket.status.name}\n` +
                  `**Prioridade:** ${ticket.priority?.name || 'N/A'}\n` +
                  `**Criado em:** ${ticket.created_at}\n\n` +
                  `**URL Externa:** ${ticket.url_external_path}\n` +
                  `**URL Interna:** ${ticket.url_internal_path}\n\n` +
                  `*✅ Ticket criado via API TiFlux*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao criar ticket**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  async fetchTicketFromAPI(ticketId) {
    const apiKey = process.env.TIFLUX_API_KEY;
    
    if (!apiKey) {
      return {
        error: 'TIFLUX_API_KEY não configurada',
        status: 'CONFIG_ERROR'
      };
    }

    try {
      const url = `https://api.tiflux.com/api/v2/tickets/${ticketId}`;
      
      // Usar fetch nativo do Node.js (v18+) ou implementar com https
      const https = require('https');
      const { URL } = require('url');
      
      return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'TiFlux-MCP/1.0.0'
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const jsonData = JSON.parse(data);
                resolve({ data: jsonData });
              } else if (res.statusCode === 404) {
                resolve({ 
                  error: `Ticket #${ticketId} não encontrado`, 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 401) {
                resolve({ 
                  error: 'Token de API inválido ou expirado', 
                  status: res.statusCode 
                });
              } else {
                resolve({ 
                  error: `Erro HTTP ${res.statusCode}`, 
                  status: res.statusCode 
                });
              }
            } catch (parseError) {
              resolve({ 
                error: `Erro ao processar resposta: ${parseError.message}`, 
                status: 'PARSE_ERROR' 
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ 
            error: `Erro de conexão: ${error.message}`, 
            status: 'CONNECTION_ERROR' 
          });
        });

        req.setTimeout(10000, () => {
          req.destroy();
          resolve({ 
            error: 'Timeout na requisição (10s)', 
            status: 'TIMEOUT' 
          });
        });

        req.end();
      });
      
    } catch (error) {
      return {
        error: `Erro interno: ${error.message}`,
        status: 'INTERNAL_ERROR'
      };
    }
  }

  async createTicketOnAPI(ticketData) {
    const apiKey = process.env.TIFLUX_API_KEY;
    
    if (!apiKey) {
      return {
        error: 'TIFLUX_API_KEY não configurada',
        status: 'CONFIG_ERROR'
      };
    }

    try {
      const url = 'https://api.tiflux.com/api/v2/tickets';
      const https = require('https');
      const { URL } = require('url');
      const querystring = require('querystring');
      
      // Preparar dados para multipart/form-data
      const formData = {};
      
      // Adicionar campos obrigatórios
      if (ticketData.title) formData.title = ticketData.title;
      if (ticketData.description) formData.description = ticketData.description;
      if (ticketData.client_id) formData.client_id = ticketData.client_id;
      if (ticketData.desk_id) formData.desk_id = ticketData.desk_id;
      
      // Adicionar campos opcionais se fornecidos
      if (ticketData.priority_id) formData.priority_id = ticketData.priority_id;
      if (ticketData.services_catalogs_item_id) formData.services_catalogs_item_id = ticketData.services_catalogs_item_id;
      if (ticketData.status_id) formData.status_id = ticketData.status_id;
      if (ticketData.requestor_name) formData.requestor_name = ticketData.requestor_name;
      if (ticketData.requestor_email) formData.requestor_email = ticketData.requestor_email;
      if (ticketData.requestor_telephone) formData.requestor_telephone = ticketData.requestor_telephone;
      if (ticketData.responsible_id) formData.responsible_id = ticketData.responsible_id;
      if (ticketData.followers) formData.followers = ticketData.followers;

      // Converter para formato form-urlencoded para simplificar
      const postData = querystring.stringify(formData);
      
      return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Accept': 'application/json',
            'User-Agent': 'TiFlux-MCP/1.0.0'
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode === 200 || res.statusCode === 201) {
                const jsonData = JSON.parse(data);
                resolve({ data: jsonData });
              } else if (res.statusCode === 400) {
                resolve({ 
                  error: `Dados inválidos: ${data}`, 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 401) {
                resolve({ 
                  error: 'Token de API inválido ou expirado', 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 422) {
                resolve({ 
                  error: `Erro de validação: ${data}`, 
                  status: res.statusCode 
                });
              } else {
                resolve({ 
                  error: `Erro HTTP ${res.statusCode}: ${data}`, 
                  status: res.statusCode 
                });
              }
            } catch (parseError) {
              resolve({ 
                error: `Erro ao processar resposta: ${parseError.message}`, 
                status: 'PARSE_ERROR' 
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ 
            error: `Erro de conexão: ${error.message}`, 
            status: 'CONNECTION_ERROR' 
          });
        });

        req.setTimeout(15000, () => {
          req.destroy();
          resolve({ 
            error: 'Timeout na requisição (15s)', 
            status: 'TIMEOUT' 
          });
        });

        req.write(postData);
        req.end();
      });
      
    } catch (error) {
      return {
        error: `Erro interno: ${error.message}`,
        status: 'INTERNAL_ERROR'
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('[TiFlux MCP SDK] Servidor iniciado e conectado');
  }
}

// Inicializar servidor se executado diretamente
if (require.main === module) {
  const server = new TifluxMCPServer();
  server.run().catch(console.error);
}

module.exports = TifluxMCPServer;
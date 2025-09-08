/**
 * Handlers para operações relacionadas a tickets
 */

const TiFluxAPI = require('../api/tiflux-api');

class TicketHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para buscar um ticket específico
   */
  async handleGetTicket(args) {
    const { ticket_id } = args;
    
    if (!ticket_id) {
      throw new Error('ticket_id é obrigatório');
    }

    try {
      const response = await this.api.fetchTicket(ticket_id);
      
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

  /**
   * Handler para criar um novo ticket
   */
  async handleCreateTicket(args) {
    const { 
      title, 
      description, 
      client_id, 
      client_name,
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
      let finalClientId = client_id;
      
      // Se client_name foi fornecido, buscar o ID do cliente
      if (client_name && !client_id) {
        const clientSearchResponse = await this.api.searchClients(client_name);
        
        if (clientSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Erro ao buscar cliente "${client_name}"**\n\n` +
                      `**Erro:** ${clientSearchResponse.error}\n\n` +
                      `*Verifique se o nome do cliente está correto ou use client_id diretamente.*`
              }
            ]
          };
        }
        
        const clients = clientSearchResponse.data || [];
        if (clients.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Cliente "${client_name}" não encontrado**\n\n` +
                    `*Verifique se o nome está correto ou use client_id diretamente.*`
              }
            ]
          };
        }
        
        if (clients.length > 1) {
          let clientsList = '**Clientes encontrados:**\n';
          clients.forEach((client, index) => {
            clientsList += `${index + 1}. **ID:** ${client.id} | **Nome:** ${client.name}\n`;
          });
          
          return {
            content: [
              {
                type: 'text',
                text: `**⚠️ Múltiplos clientes encontrados para "${client_name}"**\n\n` +
                      `${clientsList}\n` +
                      `*Use client_id específico ou seja mais específico no client_name.*`
              }
            ]
          };
        }
        
        finalClientId = clients[0].id;
      }
      
      // Usar valores padrão das variáveis de ambiente se não informados
      finalClientId = finalClientId || process.env.TIFLUX_DEFAULT_CLIENT_ID;
      const finalDeskId = desk_id || process.env.TIFLUX_DEFAULT_DESK_ID;
      const finalPriorityId = priority_id || process.env.TIFLUX_DEFAULT_PRIORITY_ID;
      const finalCatalogItemId = services_catalogs_item_id || process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID;
      
      if (!finalClientId || !finalDeskId) {
        throw new Error('client_id e desk_id são obrigatórios (configure TIFLUX_DEFAULT_CLIENT_ID e TIFLUX_DEFAULT_DESK_ID ou informe nos parâmetros)');
      }

      // Criar ticket via API
      const response = await this.api.createTicket({
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
}

module.exports = TicketHandlers;
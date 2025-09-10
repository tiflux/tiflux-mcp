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

  /**
   * Handler para atualizar um ticket existente
   */
  async handleUpdateTicket(args) {
    const { 
      ticket_id,
      title, 
      description, 
      client_id, 
      desk_id, 
      stage_id,
      responsible_id,
      followers
    } = args;
    
    if (!ticket_id) {
      throw new Error('ticket_id é obrigatório');
    }

    try {
      // Preparar dados de atualização (apenas campos fornecidos)
      const updateData = {};
      
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (client_id !== undefined) updateData.client_id = parseInt(client_id);
      if (desk_id !== undefined) updateData.desk_id = parseInt(desk_id);
      if (stage_id !== undefined) updateData.stage_id = parseInt(stage_id);
      if (followers !== undefined) updateData.followers = followers;
      
      // Tratamento especial para responsible_id (pode ser null)
      if (responsible_id !== undefined) {
        updateData.responsible_id = responsible_id ? parseInt(responsible_id) : null;
      }

      // Verificar se há campos para atualizar
      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**⚠️ Nenhum campo informado para atualização**\n\n` +
                    `**Ticket ID:** #${ticket_id}\n\n` +
                    `*Informe pelo menos um campo para atualizar: title, description, client_id, desk_id, stage_id, responsible_id, followers*`
            }
          ]
        };
      }

      // Atualizar ticket via API
      const response = await this.api.updateTicket(ticket_id, updateData);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao atualizar ticket #${ticket_id}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para editá-lo.*`
            }
          ]
        };
      }

      const ticket = response.data;
      
      // Preparar resumo das alterações
      let changesText = '**Alterações realizadas:**\n';
      if (title !== undefined) changesText += `• Título: ${title}\n`;
      if (description !== undefined) changesText += `• Descrição: ${description.substring(0, 50)}...\n`;
      if (client_id !== undefined) changesText += `• Cliente ID: ${client_id}\n`;
      if (desk_id !== undefined) changesText += `• Mesa ID: ${desk_id}\n`;
      if (stage_id !== undefined) changesText += `• Estágio ID: ${stage_id}\n`;
      if (responsible_id !== undefined) {
        changesText += `• Responsável: ${responsible_id ? `ID ${responsible_id}` : 'Removido (não atribuído)'}\n`;
      }
      if (followers !== undefined) changesText += `• Seguidores: ${followers}\n`;
      
      return {
        content: [
          {
            type: 'text',
            text: `**✅ Ticket #${ticket_id} atualizado com sucesso!**\n\n` +
                  `${changesText}\n` +
                  `**Atualizado em:** ${new Date().toISOString()}\n\n` +
                  `*✅ Ticket atualizado via API TiFlux*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao atualizar ticket #${ticket_id}**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para listar tickets com filtros
   */
  async handleListTickets(args) {
    const { 
      desk_ids, 
      desk_name,
      client_ids, 
      stage_ids, 
      stage_name,
      responsible_ids,
      offset,
      limit,
      is_closed
    } = args;
    
    // Validar se pelo menos um dos filtros obrigatórios foi informado
    if (!desk_ids && !desk_name && !client_ids && !stage_ids && !stage_name && !responsible_ids) {
      return {
        content: [
          {
            type: 'text',
            text: `**⚠️ Filtro obrigatório não informado**\n\n` +
                  `Você deve informar pelo menos um dos seguintes filtros:\n` +
                  `• **desk_ids** - IDs das mesas (ex: "1,2,3")\n` +
                  `• **desk_name** - Nome da mesa (ex: "cansados")\n` +
                  `• **client_ids** - IDs dos clientes (ex: "1,2,3")\n` +
                  `• **stage_ids** - IDs dos estágios (ex: "1,2,3")\n` +
                  `• **stage_name** - Nome do estágio (deve usar junto com desk_name, ex: "to do")\n` +
                  `• **responsible_ids** - IDs dos responsáveis (ex: "1,2,3")\n\n` +
                  `*Esta validação evita retornar uma quantidade excessiva de tickets.*`
          }
        ]
      };
    }

    try {
      let finalDeskIds = desk_ids;
      let finalStageIds = stage_ids;

      // Resolver nome da mesa em ID se fornecido
      if (desk_name && !desk_ids) {
        const deskSearchResponse = await this.api.searchDesks(desk_name);
        
        if (deskSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Erro ao buscar mesa "${desk_name}"**\n\n` +
                      `**Erro:** ${deskSearchResponse.error}\n\n` +
                      `*Verifique se o nome da mesa está correto ou use desk_ids diretamente.*`
              }
            ]
          };
        }
        
        const desks = deskSearchResponse.data || [];
        if (desks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Mesa "${desk_name}" não encontrada**\n\n` +
                      `*Verifique se o nome está correto ou use desk_ids diretamente.*`
              }
            ]
          };
        }
        
        if (desks.length > 1) {
          let desksList = '**Mesas encontradas:**\n';
          desks.forEach((desk, index) => {
            desksList += `${index + 1}. **ID:** ${desk.id} | **Nome:** ${desk.name} | **Display:** ${desk.display_name}\n`;
          });
          
          return {
            content: [
              {
                type: 'text',
                text: `**⚠️ Múltiplas mesas encontradas para "${desk_name}"**\n\n` +
                      `${desksList}\n` +
                      `*Use desk_ids específico ou seja mais específico no desk_name.*`
              }
            ]
          };
        }
        
        const foundDesk = desks[0];
        finalDeskIds = foundDesk.id.toString();

        // Se stage_name foi fornecido junto com desk_name, buscar o estágio
        if (stage_name && !stage_ids) {
          const stageSearchResponse = await this.api.searchStages(foundDesk.id);
          
          if (stageSearchResponse.error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Erro ao buscar estágios da mesa "${desk_name}"**\n\n` +
                        `**Erro:** ${stageSearchResponse.error}\n\n` +
                        `*Verifique se a mesa existe e tem estágios configurados.*`
                }
              ]
            };
          }
          
          const stages = stageSearchResponse.data || [];
          const matchingStages = stages.filter(stage => 
            stage.name.toLowerCase().includes(stage_name.toLowerCase())
          );
          
          if (matchingStages.length === 0) {
            let stagesList = stages.map(stage => `• ${stage.name}`).join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Estágio "${stage_name}" não encontrado na mesa "${desk_name}"**\n\n` +
                        `**Estágios disponíveis:**\n${stagesList}\n\n` +
                        `*Use stage_ids diretamente ou ajuste o stage_name.*`
                }
              ]
            };
          }
          
          if (matchingStages.length > 1) {
            let stagesList = '**Estágios encontrados:**\n';
            matchingStages.forEach((stage, index) => {
              stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name}\n`;
            });
            
            return {
              content: [
                {
                  type: 'text',
                  text: `**⚠️ Múltiplos estágios encontrados para "${stage_name}" na mesa "${desk_name}"**\n\n` +
                        `${stagesList}\n` +
                        `*Use stage_ids específico ou seja mais específico no stage_name.*`
                }
              ]
            };
          }
          
          finalStageIds = matchingStages[0].id.toString();
        }
      }

      // Preparar filtros para a API
      const filters = {};
      
      if (finalDeskIds) filters.desk_ids = finalDeskIds;
      if (client_ids) filters.client_ids = client_ids;
      if (finalStageIds) filters.stage_ids = finalStageIds;
      if (responsible_ids) filters.responsible_ids = responsible_ids;
      if (offset) filters.offset = parseInt(offset);
      if (limit) filters.limit = parseInt(limit);
      if (is_closed !== undefined) filters.is_closed = is_closed;

      // Chamar API para listar tickets
      const response = await this.api.listTickets(filters);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao listar tickets**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique os filtros informados e suas permissões.*`
            }
          ]
        };
      }

      const tickets = response.data || [];
      
      if (tickets.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**📋 Nenhum ticket encontrado**\n\n` +
                    `Não foram encontrados tickets com os filtros aplicados.\n\n` +
                    `**Filtros utilizados:**\n` +
                    (finalDeskIds ? `• Mesas: ${finalDeskIds}${desk_name ? ` (${desk_name})` : ''}\n` : '') +
                    (client_ids ? `• Clientes: ${client_ids}\n` : '') +
                    (finalStageIds ? `• Estágios: ${finalStageIds}${stage_name ? ` (${stage_name})` : ''}\n` : '') +
                    (responsible_ids ? `• Responsáveis: ${responsible_ids}\n` : '') +
                    `• Status: ${is_closed ? 'Fechados' : 'Abertos'}\n\n` +
                    `*Tente ajustar os filtros para encontrar tickets.*`
            }
          ]
        };
      }

      // Formatar lista de tickets
      let ticketsList = `**📋 Lista de Tickets** (${tickets.length} encontrados)\n\n`;
      
      tickets.forEach((ticket, index) => {
        const ticketNumber = ticket.ticket_number || 'N/A';
        const title = ticket.title || 'Sem título';
        const clientName = ticket.client?.name || 'Cliente não informado';
        const deskName = ticket.desk?.name || 'Mesa não informada';
        const stageName = ticket.stage?.name || 'Estágio não informado';
        const responsibleName = ticket.responsible?.name || 'Não atribuído';
        const status = ticket.status?.name || 'Status não informado';
        const createdAt = ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('pt-BR') : 'Data não informada';
        
        // Resumo da descrição (primeiras 100 caracteres)
        let descriptionSummary = '';
        if (ticket.description) {
          descriptionSummary = ticket.description.length > 100 
            ? ticket.description.substring(0, 100) + '...' 
            : ticket.description;
          descriptionSummary = `\n   📄 ${descriptionSummary}`;
        }

        ticketsList += `**${index + 1}. Ticket #${ticketNumber}**\n` +
                      `   📝 **Título:** ${title}\n` +
                      `   👤 **Responsável:** ${responsibleName}\n` +
                      `   🏢 **Cliente:** ${clientName}\n` +
                      `   🗂️ **Mesa:** ${deskName}\n` +
                      `   📊 **Estágio:** ${stageName}\n` +
                      `   🚨 **Status:** ${status}\n` +
                      `   📅 **Criado em:** ${createdAt}${descriptionSummary}\n\n`;
      });

      // Informações de paginação
      const currentOffset = filters.offset || 1;
      const currentLimit = filters.limit || 20;
      const hasMoreTickets = tickets.length === currentLimit; // Se retornou o limite máximo, pode ter mais
      
      let paginationInfo = `**📊 Paginação:**\n`;
      paginationInfo += `• Página atual: ${currentOffset}\n`;
      paginationInfo += `• Tickets por página: ${currentLimit}\n`;
      paginationInfo += `• Tickets nesta página: ${tickets.length}\n`;
      
      if (hasMoreTickets) {
        const nextOffset = currentOffset + 1;
        paginationInfo += `• Próxima página: Use \`offset: ${nextOffset}\` para ver mais tickets\n`;
      } else {
        paginationInfo += `• Esta é a última página disponível\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `${ticketsList}${paginationInfo}\n*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao listar tickets**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }
}

module.exports = TicketHandlers;
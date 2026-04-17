/**
 * Handlers para operações relacionadas a tickets
 */

const fs = require('fs');
const TiFluxAPI = require('../api/tiflux-api');

class TicketHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para buscar um ticket específico
   */
  async handleGetTicket(args) {
    const { ticket_number, show_entities, include_filled_entity } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      const options = {};
      if (show_entities) options.show_entities = true;
      if (include_filled_entity) options.include_filled_entity = true;

      const response = await this.api.fetchTicket(ticket_number, options);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao buscar ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
            }
          ]
        };
      }

      const ticket = response.data;

      // Formatar campos personalizados se existirem
      let entitiesText = '';
      if (ticket.entities || ticket.entity_fields) {
        const entities = ticket.entities || [];
        const entityFields = ticket.entity_fields || [];

        if (entities.length > 0) {
          entitiesText = '\n\n**Campos Personalizados (entities):**\n';
          entities.forEach(entity => {
            entitiesText += `\n**${entity.name || 'Menu'}** (ID: ${entity.id})\n`;
            if (entity.entity_fields && entity.entity_fields.length > 0) {
              entity.entity_fields.forEach(field => {
                const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
                entitiesText += `  • ${field.name} (${field.field_type}): ${value}\n`;
                entitiesText += `    - entity_field_id: ${field.entity_field_id}\n`;
              });
            }
          });
        } else if (entityFields.length > 0) {
          entitiesText = '\n\n**Campos Personalizados (entity_fields):**\n';
          entityFields.forEach(field => {
            const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
            entitiesText += `  • ${field.name} (${field.field_type}): ${value}\n`;
            entitiesText += `    - entity_field_id: ${field.entity_field_id}\n`;
          });
        }
      }

      // Formatar informações expandidas
      let statusInfo = '';
      if (ticket.status) {
        statusInfo = `**Status:** ${ticket.status.name || 'N/A'} (ID: ${ticket.status.id || 'N/A'})\n`;
        statusInfo += `  • Aberto: ${ticket.status.default_open ? 'Sim' : 'Não'}\n`;
        statusInfo += `  • Fechado: ${ticket.is_closed ? 'Sim' : 'Não'}\n`;
      }

      let priorityInfo = '';
      if (ticket.priority) {
        priorityInfo = `**Prioridade:** ${ticket.priority.name || 'N/A'} (ID: ${ticket.priority.id || 'N/A'})\n`;
      } else {
        priorityInfo = `**Prioridade:** Não definida\n`;
      }

      let deskInfo = '';
      if (ticket.desk) {
        deskInfo = `**Mesa:** ${ticket.desk.display_name || ticket.desk.name || 'N/A'} (ID: ${ticket.desk.id || 'N/A'})\n`;
        deskInfo += `  • Nome interno: ${ticket.desk.name || 'N/A'}\n`;
        deskInfo += `  • Ativa: ${ticket.desk.active ? 'Sim' : 'Não'}\n`;
      }

      let stageInfo = '';
      if (ticket.stage) {
        // Emoji indicator baseado no tipo de estágio
        let stageEmoji = '📊';
        if (ticket.stage.first_stage) stageEmoji = '🟢';
        else if (ticket.stage.last_stage) stageEmoji = '🏁';
        else if (ticket.stage.name && ticket.stage.name.toLowerCase().includes('review')) stageEmoji = '🟡';

        stageInfo = `**Estágio:** ${ticket.stage.name || 'N/A'} ${stageEmoji} (ID: ${ticket.stage.id || 'N/A'})\n`;
        stageInfo += `  • Primeiro estágio: ${ticket.stage.first_stage ? 'Sim' : 'Não'}\n`;
        stageInfo += `  • Último estágio: ${ticket.stage.last_stage ? 'Sim' : 'Não'}\n`;
        if (ticket.stage.max_time) {
          stageInfo += `  • Tempo máximo: ${ticket.stage.max_time}\n`;
        }
      }

      let catalogInfo = '';
      if (ticket.services_catalog) {
        catalogInfo = `\n**Catálogo de Serviços:**\n`;
        catalogInfo += `  • Item: ${ticket.services_catalog.item_name || 'N/A'} (ID: ${ticket.services_catalog.id || 'N/A'})\n`;
        catalogInfo += `  • Área: ${ticket.services_catalog.area_name || 'N/A'}`;
        if (ticket.services_catalog.area_id) {
          catalogInfo += ` (ID: ${ticket.services_catalog.area_id})`;
        }
        catalogInfo += `\n`;
        catalogInfo += `  • Catálogo: ${ticket.services_catalog.catalog_name || 'N/A'}`;
        if (ticket.services_catalog.catalog_id) {
          catalogInfo += ` (ID: ${ticket.services_catalog.catalog_id})`;
        }
        catalogInfo += `\n`;
      }

      let responsibleInfo = '';
      if (ticket.responsible) {
        responsibleInfo = `**Responsável:** ${ticket.responsible.name || 'N/A'} (ID: ${ticket.responsible.id || 'N/A'})\n`;
        responsibleInfo += `  • Email: ${ticket.responsible.email || 'N/A'}\n`;
        responsibleInfo += `  • Tipo: ${ticket.responsible._type || 'N/A'}\n`;
        responsibleInfo += `  • Ativo: ${ticket.responsible.active ? 'Sim' : 'Não'}\n`;
        if (ticket.responsible.technical_group_id) {
          responsibleInfo += `  • Grupo técnico ID: ${ticket.responsible.technical_group_id}\n`;
        }
      } else {
        responsibleInfo = `**Responsável:** Não atribuído\n`;
      }

      let clientInfo = '';
      if (ticket.client) {
        clientInfo = `**Cliente:** ${ticket.client.name || 'N/A'} (ID: ${ticket.client.id || 'N/A'})\n`;
        if (ticket.client.social) {
          clientInfo += `  • Razão social: ${ticket.client.social}\n`;
        }
        clientInfo += `  • Ativo: ${ticket.client.status ? 'Sim' : 'Não'}\n`;
      }

      let createdByInfo = '';
      if (ticket.created_by_id) {
        createdByInfo = `**Criado por:** `;
        if (ticket.created_by && ticket.created_by.name) {
          createdByInfo += `${ticket.created_by.name} (ID: ${ticket.created_by_id})`;
        } else {
          createdByInfo += `ID ${ticket.created_by_id}`;
        }
        if (ticket.created_by_way_of) {
          createdByInfo += ` (via ${ticket.created_by_way_of})`;
        }
        createdByInfo += `\n`;
      }

      let updatedByInfo = '';
      if (ticket.updated_by_id) {
        updatedByInfo = `**Atualizado por:** `;
        if (ticket.updated_by && ticket.updated_by.name) {
          updatedByInfo += `${ticket.updated_by.name} (ID: ${ticket.updated_by_id})`;
        } else {
          updatedByInfo += `ID ${ticket.updated_by_id}`;
        }
        updatedByInfo += `\n`;
      }

      let slaInfo = '';
      if (ticket.sla_info) {
        slaInfo = `\n**SLA:**\n`;
        slaInfo += `  • Parado: ${ticket.sla_info.stopped ? 'Sim' : 'Não'}\n`;
        if (ticket.sla_info.stage_expiration) {
          slaInfo += `  • Expiração do estágio: ${ticket.sla_info.stage_expiration}\n`;
        }
        if (ticket.sla_info.attend_sla) {
          slaInfo += `  • SLA de atendimento: ${ticket.sla_info.attend_sla}\n`;
        }
        if (ticket.sla_info.attend_expiration) {
          slaInfo += `  • Expiração atendimento: ${ticket.sla_info.attend_expiration}\n`;
        }
        if (ticket.sla_info.solve_expiration) {
          slaInfo += `  • Expiração resolução: ${ticket.sla_info.solve_expiration}\n`;
        }
        if (ticket.sla_info.solved_in_time !== null) {
          slaInfo += `  • Resolvido no prazo: ${ticket.sla_info.solved_in_time ? 'Sim' : 'Não'}\n`;
        }
      }

      let additionalInfo = '';
      if (ticket.followers) {
        additionalInfo += `**Seguidores:** ${ticket.followers}\n`;
      }
      if (ticket.tags && Array.isArray(ticket.tags) && ticket.tags.length > 0) {
        additionalInfo += `**Tags:** ${ticket.tags.join(', ')}\n`;
      } else if (ticket.tags && typeof ticket.tags === 'string' && ticket.tags.trim()) {
        additionalInfo += `**Tags:** ${ticket.tags}\n`;
      }
      if (ticket.worked_hours) {
        additionalInfo += `**Horas trabalhadas:** ${ticket.worked_hours}\n`;
      }
      if (ticket.closed_at) {
        additionalInfo += `**Fechado em:** ${ticket.closed_at}\n`;
      }
      if (ticket.reopen_count > 0) {
        additionalInfo += `**Reaberturas:** ${ticket.reopen_count}\n`;
      }
      if (ticket.last_reopen_date) {
        additionalInfo += `**Última reabertura:** ${ticket.last_reopen_date}\n`;
      }
      if (ticket.is_grouped) {
        additionalInfo += `**Agrupado:** Sim\n`;
      }
      if (ticket.is_revised) {
        additionalInfo += `**Revisado:** Sim\n`;
      }

      let urlInfo = '';
      if (ticket.url_internal_path || ticket.url_external_path) {
        urlInfo = `\n**URLs:**\n`;
        if (ticket.url_internal_path) {
          urlInfo += `  • Interna: ${ticket.url_internal_path}\n`;
        }
        if (ticket.url_external_path) {
          urlInfo += `  • Externa: ${ticket.url_external_path}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `**Ticket #${ticket_number}**\n\n` +
                  `**Título:** ${ticket.title || 'N/A'}\n\n` +
                  `${statusInfo}` +
                  `${priorityInfo}\n` +
                  `${deskInfo}\n` +
                  `${stageInfo}\n` +
                  `${catalogInfo}\n` +
                  `${responsibleInfo}\n` +
                  `${clientInfo}\n` +
                  `${createdByInfo}` +
                  `**Criado em:** ${ticket.created_at || 'N/A'}\n` +
                  `${updatedByInfo}` +
                  `**Atualizado em:** ${ticket.updated_at || 'N/A'}\n` +
                  `${additionalInfo}` +
                  `${slaInfo}` +
                  `${urlInfo}\n` +
                  `**Descrição:**\n${ticket.description || 'Sem descrição'}${entitiesText}\n\n` +
                  `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao buscar ticket #${ticket_number}**\n\n` +
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
      desk_name,
      priority_id,
      services_catalogs_item_id,
      catalog_item_name,
      status_id,
      requestor_name,
      requestor_email,
      requestor_telephone,
      responsible_id,
      responsible_name,
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

      let finalDeskId = desk_id;
      
      // Se desk_name foi fornecido, buscar o ID da mesa
      if (desk_name && !desk_id) {
        const deskSearchResponse = await this.api.searchDesks(desk_name);
        
        if (deskSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Erro ao buscar mesa "${desk_name}"**\n\n` +
                      `**Erro:** ${deskSearchResponse.error}\n\n` +
                      `*Verifique se o nome da mesa está correto ou use desk_id diretamente.*`
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
                      `*Verifique se o nome está correto ou use desk_id diretamente.*`
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
                      `*Use desk_id específico ou seja mais específico no desk_name.*`
              }
            ]
          };
        }
        
        finalDeskId = desks[0].id;
      }

      let finalResponsibleId = responsible_id;

      // Se responsible_name foi fornecido, buscar o ID do usuário
      if (responsible_name && !responsible_id) {
        const userSearchResponse = await this.api.searchUsers({
          name: responsible_name,
          active: true,
          type: 'attendant', // Apenas atendentes podem ser responsáveis
          limit: 10
        });

        if (userSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar usuario "${responsible_name}"**\n\n` +
                      `**Erro:** ${userSearchResponse.error}\n\n` +
                      `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`
              }
            ]
          };
        }

        const users = userSearchResponse.data || [];
        if (users.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Usuario "${responsible_name}" nao encontrado**\n\n` +
                      `*Verifique se o nome esta correto ou use responsible_id diretamente.*`
              }
            ]
          };
        }

        if (users.length > 1) {
          let usersList = '**Usuarios encontrados:**\n';
          users.forEach((user, index) => {
            usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplos usuarios encontrados para "${responsible_name}"**\n\n` +
                      `${usersList}\n` +
                      `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
              }
            ]
          };
        }

        finalResponsibleId = users[0].id;
      }

      // Usar valores padrão das variáveis de ambiente se não informados
      finalClientId = finalClientId || process.env.TIFLUX_DEFAULT_CLIENT_ID;
      finalDeskId = finalDeskId || process.env.TIFLUX_DEFAULT_DESK_ID;
      const finalPriorityId = priority_id || process.env.TIFLUX_DEFAULT_PRIORITY_ID;
      let finalCatalogItemId = services_catalogs_item_id || process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID;

      // Se catalog_item_name foi fornecido, buscar o ID do item de catálogo
      if (catalog_item_name && !services_catalogs_item_id && finalDeskId) {
        const catalogSearchResponse = await this.api.searchCatalogItems(finalDeskId, { limit: 200 });

        if (catalogSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar item de catalogo "${catalog_item_name}"**\n\n` +
                      `**Erro:** ${catalogSearchResponse.error}\n\n` +
                      `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
              }
            ]
          };
        }

        const catalogItems = catalogSearchResponse.data || [];
        if (catalogItems.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Nenhum item de catalogo encontrado na mesa ${finalDeskId}**\n\n` +
                      `*Verifique se a mesa possui itens de catalogo configurados.*`
              }
            ]
          };
        }

        // Filtrar por nome (busca parcial case-insensitive)
        const searchTerm = catalog_item_name.toLowerCase();
        const matchingItems = catalogItems.filter(item =>
          item.name.toLowerCase().includes(searchTerm)
        );

        if (matchingItems.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Item de catalogo "${catalog_item_name}" nao encontrado**\n\n` +
                      `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
              }
            ]
          };
        }

        if (matchingItems.length > 1) {
          let itemsList = '**Itens de catalogo encontrados:**\n';
          matchingItems.forEach((item, index) => {
            itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplos itens de catalogo encontrados para "${catalog_item_name}"**\n\n` +
                      `${itemsList}\n` +
                      `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
              }
            ]
          };
        }

        finalCatalogItemId = matchingItems[0].id;
      }
      
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
        responsible_id: finalResponsibleId ? parseInt(finalResponsibleId) : undefined,
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
      ticket_number,
      title,
      description,
      client_id,
      desk_id,
      desk_name,
      stage_id,
      stage_name,
      responsible_id,
      responsible_name,
      followers,
      services_catalogs_item_id,
      catalog_item_name
    } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      let finalDeskId = desk_id;
      let finalStageId = stage_id;
      let finalResponsibleId = responsible_id;

      // Se desk_name foi fornecido, buscar o ID da mesa
      if (desk_name && !desk_id) {
        const deskSearchResponse = await this.api.searchDesks(desk_name);

        if (deskSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar mesa "${desk_name}"**\n\n` +
                      `**Erro:** ${deskSearchResponse.error}\n\n` +
                      `*Verifique se o nome da mesa esta correto ou use desk_id diretamente.*`
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
                text: `**Mesa "${desk_name}" nao encontrada**\n\n` +
                      `*Verifique se o nome esta correto ou use desk_id diretamente.*`
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
                text: `**Multiplas mesas encontradas para "${desk_name}"**\n\n` +
                      `${desksList}\n` +
                      `*Use desk_id especifico ou seja mais especifico no desk_name.*`
              }
            ]
          };
        }

        finalDeskId = desks[0].id;
      }

      // Se stage_name foi fornecido, buscar o ID do estágio
      // Precisa de desk_id ou desk_name para buscar estágios
      if (stage_name && !stage_id) {
        const deskIdForStage = finalDeskId || desk_id;

        if (!deskIdForStage) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro: desk_id ou desk_name obrigatorio para buscar estagio por nome**\n\n` +
                      `*Para usar stage_name, informe tambem desk_id ou desk_name.*`
              }
            ]
          };
        }

        const stageSearchResponse = await this.api.searchStages(deskIdForStage);

        if (stageSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar estagios da mesa ID ${deskIdForStage}**\n\n` +
                      `**Erro:** ${stageSearchResponse.error}\n\n` +
                      `*Verifique se a mesa existe e possui estagios.*`
              }
            ]
          };
        }

        const stages = stageSearchResponse.data || [];
        const matchingStages = stages.filter(s =>
          s.name.toLowerCase().includes(stage_name.toLowerCase())
        );

        if (matchingStages.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Estagio "${stage_name}" nao encontrado na mesa ID ${deskIdForStage}**\n\n` +
                      `*Verifique se o nome esta correto ou use stage_id diretamente.*`
              }
            ]
          };
        }

        if (matchingStages.length > 1) {
          let stagesList = '**Estagios encontrados:**\n';
          matchingStages.forEach((stage, index) => {
            stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplos estagios encontrados para "${stage_name}"**\n\n` +
                      `${stagesList}\n` +
                      `*Use stage_id especifico ou seja mais especifico no stage_name.*`
              }
            ]
          };
        }

        finalStageId = matchingStages[0].id;
      }

      // Se responsible_name foi fornecido, buscar o ID do usuário
      if (responsible_name && !responsible_id) {
        const userSearchResponse = await this.api.searchUsers({
          name: responsible_name,
          active: true,
          type: 'attendant',
          limit: 10
        });

        if (userSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar usuario "${responsible_name}"**\n\n` +
                      `**Erro:** ${userSearchResponse.error}\n\n` +
                      `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`
              }
            ]
          };
        }

        const users = userSearchResponse.data || [];
        if (users.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Usuario "${responsible_name}" nao encontrado**\n\n` +
                      `*Verifique se o nome esta correto ou use responsible_id diretamente.*`
              }
            ]
          };
        }

        if (users.length > 1) {
          let usersList = '**Usuarios encontrados:**\n';
          users.forEach((user, index) => {
            usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplos usuarios encontrados para "${responsible_name}"**\n\n` +
                      `${usersList}\n` +
                      `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
              }
            ]
          };
        }

        finalResponsibleId = users[0].id;
      }

      let finalCatalogItemId = services_catalogs_item_id;

      // Se catalog_item_name foi fornecido, buscar o ID do item de catálogo
      if (catalog_item_name && !services_catalogs_item_id) {
        const deskIdForCatalog = finalDeskId || desk_id;

        if (!deskIdForCatalog) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro: desk_id ou desk_name obrigatorio para buscar item de catalogo por nome**\n\n` +
                      `*Para usar catalog_item_name, informe tambem desk_id ou desk_name.*`
              }
            ]
          };
        }

        const catalogSearchResponse = await this.api.searchCatalogItems(deskIdForCatalog, { limit: 200 });

        if (catalogSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar item de catalogo "${catalog_item_name}"**\n\n` +
                      `**Erro:** ${catalogSearchResponse.error}\n\n` +
                      `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
              }
            ]
          };
        }

        const catalogItems = catalogSearchResponse.data || [];
        if (catalogItems.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Nenhum item de catalogo encontrado na mesa ${deskIdForCatalog}**\n\n` +
                      `*Verifique se a mesa possui itens de catalogo configurados.*`
              }
            ]
          };
        }

        // Filtrar por nome (busca parcial case-insensitive)
        const searchTerm = catalog_item_name.toLowerCase();
        const matchingItems = catalogItems.filter(item =>
          item.name.toLowerCase().includes(searchTerm)
        );

        if (matchingItems.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Item de catalogo "${catalog_item_name}" nao encontrado**\n\n` +
                      `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
              }
            ]
          };
        }

        if (matchingItems.length > 1) {
          let itemsList = '**Itens de catalogo encontrados:**\n';
          matchingItems.forEach((item, index) => {
            itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplos itens de catalogo encontrados para "${catalog_item_name}"**\n\n` +
                      `${itemsList}\n` +
                      `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
              }
            ]
          };
        }

        finalCatalogItemId = matchingItems[0].id;
      }

      // Preparar dados de atualização (apenas campos fornecidos)
      const updateData = {};

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (client_id !== undefined) updateData.client_id = parseInt(client_id);
      if (finalDeskId !== undefined) updateData.desk_id = parseInt(finalDeskId);
      if (finalStageId !== undefined) updateData.stage_id = parseInt(finalStageId);
      if (followers !== undefined) updateData.followers = followers;
      if (finalCatalogItemId !== undefined) updateData.services_catalogs_item_id = parseInt(finalCatalogItemId);

      // Tratamento especial para responsible_id (pode ser null)
      if (finalResponsibleId !== undefined) {
        updateData.responsible_id = finalResponsibleId ? parseInt(finalResponsibleId) : null;
      }

      // Verificar se há campos para atualizar
      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**⚠️ Nenhum campo informado para atualização**\n\n` +
                    `**Ticket ID:** #${ticket_number}\n\n` +
                    `*Informe pelo menos um campo para atualizar: title, description, client_id, desk_id, stage_id, responsible_id, followers*`
            }
          ]
        };
      }

      // Atualizar ticket via API
      const response = await this.api.updateTicket(ticket_number, updateData);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao atualizar ticket #${ticket_number}**\n\n` +
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
      if (desk_id !== undefined) changesText += `• Mesa transferida: ID ${desk_id}\n`;
      if (stage_id !== undefined) changesText += `• Estágio ID: ${stage_id}\n`;
      if (responsible_id !== undefined) {
        changesText += `• Responsável: ${responsible_id ? `ID ${responsible_id}` : 'Removido (não atribuído)'}\n`;
      }
      if (followers !== undefined) changesText += `• Seguidores: ${followers}\n`;
      if (finalCatalogItemId !== undefined) changesText += `• Item de Catálogo ID: ${finalCatalogItemId}\n`;
      
      return {
        content: [
          {
            type: 'text',
            text: `**✅ Ticket #${ticket_number} atualizado com sucesso!**\n\n` +
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
            text: `**❌ Erro interno ao atualizar ticket #${ticket_number}**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para cancelar um ticket específico
   */
  async handleCancelTicket(args) {
    const { ticket_number } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      const response = await this.api.cancelTicket(ticket_number);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao cancelar ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para cancelá-lo.*`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `**✅ Ticket #${ticket_number} cancelado com sucesso!**\n\n` +
                  `**Mensagem:** ${response.data?.message || response.message || 'Ticket cancelado'}\n\n` +
                  `*O ticket foi cancelado e não pode mais receber atualizações.*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao cancelar ticket #${ticket_number}**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e tente novamente.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para fechar um ticket específico
   */
  async handleCloseTicket(args) {
    const { ticket_number } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      const response = await this.api.closeTicket(ticket_number);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao fechar ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para fechá-lo.*`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `**✅ Ticket #${ticket_number} fechado com sucesso!**\n\n` +
                  `**Mensagem:** ${response.data?.message || response.message || 'Ticket fechado'}\n\n` +
                  `*O ticket foi fechado e marcado como resolvido.*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao fechar ticket #${ticket_number}**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e tente novamente.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para criar uma resposta (comunicação com cliente) em um ticket
   */
  async handleCreateTicketAnswer(args) {
    const { ticket_number, text, with_signature, files = [], files_base64 = [] } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    if (!text) {
      throw new Error('text é obrigatório');
    }

    try {
      // Combinar arquivos locais e base64
      const allFiles = [...files, ...files_base64];

      // Validar número total de arquivos
      if (allFiles.length > 10) {
        return {
          content: [
            {
              type: 'text',
              text: `**⚠️ Muitos arquivos**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Arquivos fornecidos:** ${allFiles.length} (${files.length} locais + ${files_base64.length} base64)\n` +
                    `**Limite:** 10 arquivos por resposta\n\n` +
                    `*Remova alguns arquivos e tente novamente.*`
            }
          ]
        };
      }

      // Validar estrutura dos arquivos base64
      if (files_base64.length > 0) {
        for (let i = 0; i < files_base64.length; i++) {
          const file = files_base64[i];

          if (!file || typeof file !== 'object') {
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
                        `O arquivo deve ser um objeto com as propriedades "content" e "filename".\n\n` +
                        `**Exemplo correto:**\n` +
                        `\`\`\`json\n` +
                        `{\n` +
                        `  "content": "base64string...",\n` +
                        `  "filename": "documento.pdf"\n` +
                        `}\n` +
                        `\`\`\`\n\n` +
                        `*Verifique a estrutura do arquivo e tente novamente.*`
                }
              ]
            };
          }

          if (!file.content || typeof file.content !== 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
                        `A propriedade "content" é obrigatória e deve ser uma string em base64.\n\n` +
                        `*Verifique o conteúdo do arquivo e tente novamente.*`
                }
              ]
            };
          }

          if (!file.filename || typeof file.filename !== 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
                        `A propriedade "filename" é obrigatória e deve ser uma string.\n\n` +
                        `*Exemplo: "documento.pdf", "relatorio.xlsx", "imagem.png"*`
                }
              ]
            };
          }

          // Validar tamanho do base64 antes de enviar (aproximado)
          const estimatedSize = Math.ceil((file.content.length * 3) / 4);
          const maxSize = 41943040; // 40MB

          if (estimatedSize > maxSize) {
            return {
              content: [
                {
                  type: 'text',
                  text: `**❌ Arquivo base64 muito grande**\n\n` +
                        `**Arquivo:** ${file.filename}\n` +
                        `**Tamanho estimado:** ${Math.round(estimatedSize / 1024 / 1024)}MB\n` +
                        `**Limite:** 40MB\n\n` +
                        `*Reduza o tamanho do arquivo ou envie em múltiplas respostas.*`
                }
              ]
            };
          }
        }
      }

      // Preparar dados da resposta
      const answerData = {
        name: text, // O campo 'name' na API corresponde ao texto da resposta
        with_signature: with_signature || false
      };

      // Adicionar arquivos se fornecidos
      if (allFiles.length > 0) {
        answerData.files = allFiles;
      }

      // Criar resposta via API
      const response = await this.api.createTicketAnswer(ticket_number, answerData);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao criar resposta no ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para responder.*`
            }
          ]
        };
      }

      const answer = response.data;
      const filesInfo = files && files.length > 0
        ? `\n**Arquivos anexados:** ${files.length} arquivo(s)`
        : '';

      return {
        content: [
          {
            type: 'text',
            text: `**✅ Resposta criada com sucesso no ticket #${ticket_number}!**\n\n` +
                  `**ID da resposta:** ${answer.id}\n` +
                  `**Autor:** ${answer.author}\n` +
                  `**Data/Hora:** ${answer.answer_time}\n` +
                  `**Origem:** ${answer.answer_origin}\n` +
                  `**Com assinatura:** ${answer.signature ? 'Sim' : 'Não'}${filesInfo}\n\n` +
                  `**Conteúdo enviado:**\n${text}\n\n` +
                  `*✅ Resposta enviada via API TiFlux*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao criar resposta no ticket #${ticket_number}**\n\n` +
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
      is_closed,
      date_type,
      start_datetime,
      end_datetime
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
      if (date_type) filters.date_type = date_type;
      if (start_datetime) filters.start_datetime = start_datetime;
      if (end_datetime) filters.end_datetime = end_datetime;

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

  /**
   * Handler para atualizar campos personalizados (entities) de um ticket
   */
  async handleUpdateTicketEntities(args) {
    const { ticket_number, entities } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    if (!entities || !Array.isArray(entities) || entities.length === 0) {
      throw new Error('entities é obrigatório e deve ser um array com pelo menos 1 campo');
    }

    if (entities.length > 50) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Limite excedido**\n\n` +
                  `Você está tentando atualizar ${entities.length} campos, mas o limite é de 50 campos por requisição.\n\n` +
                  `*Divida a atualização em múltiplas requisições.*`
          }
        ]
      };
    }

    try {
      // Validar estrutura de cada entity
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (!entity.entity_field_id) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Erro de validação no campo ${i + 1}**\n\n` +
                      `O campo \`entity_field_id\` é obrigatório.\n\n` +
                      `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" }*`
              }
            ]
          };
        }

        if (entity.value === undefined) {
          return {
            content: [
              {
                type: 'text',
                text: `**❌ Erro de validação no campo ${i + 1}**\n\n` +
                      `O campo \`value\` é obrigatório (use null para limpar).\n\n` +
                      `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" } ou { "entity_field_id": 72, "value": null }*`
              }
            ]
          };
        }
      }

      // Preparar dados para a API
      const updateData = { entities };

      // Atualizar via API
      const response = await this.api.updateTicketEntities(ticket_number, updateData);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao atualizar campos personalizados do ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe, se os entity_field_id são válidos e se você tem permissão para editar.*`
            }
          ]
        };
      }

      // Formatar resposta de sucesso
      const updatedEntities = response.data?.entities || [];
      let entitiesText = '';

      if (updatedEntities.length > 0) {
        entitiesText = '\n\n**Campos atualizados:**\n';
        updatedEntities.forEach(entity => {
          if (entity.entity_fields && entity.entity_fields.length > 0) {
            entity.entity_fields.forEach(field => {
              const wasUpdated = entities.some(e => e.entity_field_id === field.entity_field_id);
              if (wasUpdated) {
                entitiesText += `• ${field.name}: ${field.value || '(vazio)'}\n`;
              }
            });
          }
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: `**✅ Campos personalizados atualizados com sucesso!**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**Campos processados:** ${entities.length}${entitiesText}\n\n` +
                  `*✅ Campos atualizados via API TiFlux*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao atualizar campos personalizados**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para buscar arquivos anexados a um ticket
   */
  async handleGetTicketFiles(args) {
    const { ticket_number } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      const response = await this.api.fetchTicketFiles(ticket_number);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao buscar arquivos do ticket #${ticket_number}**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
            }
          ]
        };
      }

      const files = response.data || [];

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**📎 Arquivos do Ticket #${ticket_number}**\n\n` +
                    `*Nenhum arquivo anexado neste ticket.*\n\n` +
                    `*✅ Dados obtidos da API TiFlux em tempo real*`
            }
          ]
        };
      }

      // Formatar lista de arquivos
      let filesText = `**📎 Arquivos do Ticket #${ticket_number}** (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'})\n\n`;

      files.forEach((file, index) => {
        filesText += `**${index + 1}. ${file.name || 'Sem nome'}**\n`;
        filesText += `   • **ID:** ${file.id}\n`;
        filesText += `   • **Tipo:** ${file.content_type || 'N/A'}\n`;
        filesText += `   • **Tamanho:** ${this.formatFileSize(file.size || 0)}\n`;
        filesText += `   • **URL:** ${file.url || 'N/A'}\n`;
        filesText += `   • **Criado em:** ${file.created_at || 'N/A'}\n`;
        filesText += `   • **Criado por:** ${file.created_by?.name || 'N/A'}\n\n`;
      });

      return {
        content: [
          {
            type: 'text',
            text: filesText + `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
            {
              type: 'text',
              text: `**❌ Erro interno ao buscar arquivos do ticket #${ticket_number}**\n\n` +
                    `**Erro:** ${error.message}\n\n` +
                    `*Verifique sua conexão e configurações da API.*`
            }
          ]
      };
    }
  }

  /**
   * Handler para buscar estágios e SLAs de um ticket
   */
  async handleGetTicketStagesSlas(args) {
    const { ticket_number } = args;

    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    const response = await this.api.makeRequest(`/tickets/${ticket_number}/stages-slas`);

    if (response.error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro ao buscar estágios e SLAs do ticket #${ticket_number}**\n\n` +
                  `**Código:** ${response.status}\n` +
                  `**Mensagem:** ${response.error}\n\n` +
                  `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
          }
        ]
      };
    }

    const data = response.data;

    if (!data) {
      return {
        content: [
          {
            type: 'text',
            text: `**Estágios e SLAs do Ticket #${ticket_number}**\n\n` +
                  `*Nenhum dado disponível para este ticket.*\n\n` +
                  `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `**Estágios e SLAs do Ticket #${ticket_number}**\n\n` +
                `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n` +
                `*✅ Dados obtidos da API TiFlux em tempo real*`
        }
      ]
    };
  }

  /**
   * Formata tamanho de arquivo em formato legível
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = TicketHandlers;
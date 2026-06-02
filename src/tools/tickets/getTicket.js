/**
 * Slice: get_ticket — busca detalhes completos de um ticket pelo numero.
 *
 * Endpoint: GET /tickets/{ticket_number} (via api.fetchTicket).
 * Retorna: status, prioridade, mesa, estagio, catalogo, responsavel,
 * cliente, criado_por, atualizado_por, SLA, URLs, campos personalizados.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'get_ticket',
  description: 'Buscar um ticket específico no TiFlux pelo número. Retorna informações completas incluindo: status (ID e nome), prioridade (ID e nome), mesa (ID e nome), estágio (ID, nome e emoji indicator), catálogo de serviços (área ID/nome, catálogo ID/nome, item ID/nome), responsável (ID, nome e email), cliente (ID, nome e status), criado por (ID e nome), atualizado por (ID e nome), seguidores, tags, datas (criação, atualização, fechamento), horas trabalhadas, SLA (status detalhado), URLs (interna e externa) e campos personalizados opcionais.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser buscado (ex: "123", "456")' },
      show_entities: { type: 'boolean', description: 'Incluir TODOS os campos personalizados vinculados ao ticket na resposta (padrão: false)' },
      include_filled_entity: { type: 'boolean', description: 'Incluir apenas campos personalizados que possuem valores preenchidos (padrão: false)' }
    },
    required: ['ticket_number']
  }
};

const FIELD_TYPES_WITH_OPTIONS = new Set(['single_select', 'checkbox']);

function formatEntityField(field) {
  const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
  let text = `  • ${field.name} (${field.field_type}): ${value}\n`;
  text += `    - entity_field_id: ${field.entity_field_id}\n`;

  if (FIELD_TYPES_WITH_OPTIONS.has(field.field_type)) {
    // Mostrar opcoes ja preenchidas/retornadas pela API
    if (field.options && field.options.length > 0) {
      text += `    - opcoes marcadas:\n`;
      field.options.forEach(opt => {
        text += `      * ID ${opt.entity_field_option_id || opt.id}: ${opt.title || opt.value} (value: ${opt.value})\n`;
      });
    }
    text += `    - _Use list_entity_field_options com entity_field_id=${field.entity_field_id} para ver todas as opcoes disponiveis_\n`;
  }

  return text;
}

function formatTicket(ticketNumber, ticket) {
  // Campos personalizados
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
            entitiesText += formatEntityField(field);
          });
        }
      });
    } else if (entityFields.length > 0) {
      entitiesText = '\n\n**Campos Personalizados (entity_fields):**\n';
      entityFields.forEach(field => {
        entitiesText += formatEntityField(field);
      });
    }
  }

  // Informacoes expandidas por bloco
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

  return `**Ticket #${ticketNumber}**\n\n` +
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
         `*✅ Dados obtidos da API TiFlux em tempo real*`;
}

async function execute(args, { api }) {
  const { ticket_number, show_entities, include_filled_entity } = args;

  requireField(args, 'ticket_number');

  try {
    const options = {};
    if (show_entities) options.show_entities = true;
    if (include_filled_entity) options.include_filled_entity = true;

    const response = await api.fetchTicket(ticket_number, options);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao buscar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
      );
    }

    return textResponse(formatTicket(ticket_number, response.data));
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao buscar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatTicket };

/**
 * Slice: get_ticket — busca detalhes completos de um ticket pelo número.
 *
 * Endpoint: GET /tickets/{ticket_number} (via api.fetchTicket).
 * Retorna: hierarquia (ticket pai / tickets filhos), solicitante, resumo de
 * checklists (com aviso de bloqueio de fechamento), status, prioridade, mesa,
 * estágio, catálogo, responsável, cliente, criado por, SLA, URLs, campos
 * personalizados e demais campos descartados anteriormente pelo formatter.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, truncate } = require('../_shared/format');
const { formatEntityField } = require('../_shared/entityFields');

const schema = {
  name: 'get_ticket',
  description: 'Buscar um ticket específico no TiFlux pelo número. Retorna informações completas incluindo: hierarquia (ticket pai e tickets filhos/desdobramentos), solicitante (quem abriu o ticket), resumo de checklists (com aviso se bloqueiam o fechamento), status (ID e nome), prioridade (ID e nome), mesa (ID e nome), estágio (ID, nome e emoji indicator), catálogo de serviços (área ID/nome, catálogo ID/nome, item ID/nome), responsável (ID, nome e email), cliente (ID, nome e status), seguidores, horas trabalhadas, SLA (status detalhado), equipamento vinculado, feedback/avaliação, URLs (interna e externa) e campos personalizados opcionais.',
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

function formatTicket(ticketNumber, ticket, v) {
  const verbosity = v || 'rich';

  // compact: saida tersa sem flags de baixo valor, sem emojis, descricao truncada
  if (verbosity === 'compact') {
    const status = ticket.status?.name || 'N/A';
    const priority = ticket.priority?.name || 'N/D';
    const desk = ticket.desk?.display_name || ticket.desk?.name || 'N/A';
    const stage = ticket.stage?.name || 'N/A';
    const responsible = ticket.responsible?.name || 'N/A';
    const client = ticket.client?.name || 'N/A';
    const desc = truncate(ticket.description || '', 800);

    // Hierarquia (compact: linha única com números, sem títulos)
    let hierarchyCompact = '';
    const hasParent = ticket.ticket_reference && ticket.ticket_reference.ticket_number;
    const children = (ticket.ticket_children || []).filter(c => c && c.ticket_number);
    if (hasParent || children.length > 0) {
      const parts = [];
      if (hasParent) {
        parts.push(`Pai: #${ticket.ticket_reference.ticket_number}`);
      }
      if (children.length > 0) {
        parts.push(`Filhos: ${children.map(c => `#${c.ticket_number}`).join(', ')}`);
      }
      hierarchyCompact = `\n${parts.join(' | ')}`;
    }

    // Solicitante (compact: nome e email)
    let requestorCompact = '';
    if (ticket.requestor && ticket.requestor.name) {
      const reqParts = [ticket.requestor.name];
      if (ticket.requestor.email) reqParts.push(ticket.requestor.email);
      requestorCompact = `\nSolicitante: ${reqParts.join(' ')}`;
    }

    // Checklists (compact: só quando bloqueia fechamento ou há obrigatórios pendentes)
    let checklistCompact = '';
    const cs = ticket.checklists_summary;
    if (cs && (cs.blocks_close || cs.required_pending > 0)) {
      checklistCompact = `\n⚠️ Checklist: ${cs.required_pending} obrigatório(s) pendente(s)`;
      if (cs.missing_required_checklists && cs.missing_required_checklists.length > 0) {
        checklistCompact += ` — ${cs.missing_required_checklists.join(', ')}`;
      }
      if (cs.blocks_close) {
        checklistCompact += ' (BLOQUEIA FECHAMENTO)';
      }
    }

    // Campos personalizados (compact: apenas nome e valor)
    let entitiesText = '';
    if (ticket.entities && ticket.entities.length > 0) {
      entitiesText = '\n\nCampos personalizados:\n';
      ticket.entities.forEach(entity => {
        if (entity.entity_fields && entity.entity_fields.length > 0) {
          entity.entity_fields.forEach(field => {
            const val = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
            entitiesText += `  ${field.name}: ${val} (id:${field.entity_field_id})\n`;
          });
        }
      });
    }

    let slaCompact = '';
    if (ticket.sla_info?.stage_expiration) {
      slaCompact = `\nSLA expira: ${ticket.sla_info.stage_expiration}`;
    }

    return `Ticket #${ticketNumber}: ${ticket.title || 'N/A'}\n` +
           `Status: ${status} | Prioridade: ${priority} | Mesa: ${desk} (id:${ticket.desk?.id || 'N/A'})\n` +
           `Estagio: ${stage} (id:${ticket.stage?.id || 'N/A'}) | Responsavel: ${responsible}\n` +
           `Cliente: ${client} | Criado: ${ticket.created_at || 'N/A'}` +
           `${hierarchyCompact}` +
           `${requestorCompact}` +
           `${checklistCompact}` +
           `${slaCompact}` +
           (desc ? `\nDescricao: ${desc}` : '') +
           `${entitiesText}`;
  }

  // rich: saida completa
  // Campos personalizados
  let entitiesText = '';
  if (ticket.entities || ticket.entity_fields) {
    const entities = ticket.entities || [];
    const entityFields = ticket.entity_fields || [];

    if (entities.length > 0) {
      // Decisao de design (2026-07-07): quando entities[] esta presente e nao-vazio, ele
      // ja agrupa os campos em menus (entity.entity_fields[]). Nesse caso, entity_fields[]
      // root e ignorado para evitar duplicacao — a API os trata como mutuamente exclusivos
      // (entities populado = entity_fields root vazio, e vice-versa). Validado empiricamente
      // contra GET /tickets/{n}: a API nunca retorna ambos preenchidos simultaneamente.
      entitiesText = '\n\n**Campos Personalizados (entities):**\n';
      entities.forEach(entity => {
        entitiesText += `\n**${entity.name || 'Menu'}** (ID: ${entity.id})\n`;
        if (entity.entity_fields && entity.entity_fields.length > 0) {
          entity.entity_fields.forEach(field => {
            entitiesText += formatEntityField(field);
          });
        }
      });
      // Falha ruidosa > silenciosa: o descarte de entity_fields[] root acima assume um
      // invariante empirico da API (mutuamente exclusivos). Se esse invariante quebrar
      // (nova versao da API, ticket de borda), avisamos em vez de sumir com os dados.
      if (entityFields.length > 0) {
        entitiesText += `\n⚠️ _A API retornou ${entityFields.length} campo(s) em \`entity_fields\` root simultaneamente a \`entities\` — exibidos abaixo por precaucao:_\n`;
        entityFields.forEach(field => {
          entitiesText += formatEntityField(field);
        });
      }
    } else if (entityFields.length > 0) {
      // entity_fields[] root: formato alternativo retornado pela API quando entities[] esta vazio.
      // Campos incluem options[] tipadas e flag required (exibida como sufixo no nome do campo).
      entitiesText = '\n\n**Campos Personalizados (entity_fields):**\n';
      entityFields.forEach(field => {
        entitiesText += formatEntityField(field);
      });
    }
  }

  // --- Bloco A: Hierarquia (pai/filho) ---
  let hierarchyInfo = '';
  const hasParent = ticket.ticket_reference && ticket.ticket_reference.ticket_number;
  const children = (ticket.ticket_children || []).filter(c => c && c.ticket_number);
  if (hasParent || children.length > 0) {
    hierarchyInfo = `\n**Hierarquia:**\n`;
    if (hasParent) {
      const ref = ticket.ticket_reference;
      hierarchyInfo += `  • Ticket pai: #${ref.ticket_number} — ${ref.title || '(sem título)'}\n`;
    }
    if (children.length > 0) {
      hierarchyInfo += `  • Tickets filhos (${children.length}):\n`;
      children.forEach(child => {
        hierarchyInfo += `    - #${child.ticket_number} — ${child.title || '(sem título)'}\n`;
      });
    }
  }

  // Informacoes expandidas por bloco
  let statusInfo = '';
  if (ticket.status) {
    statusInfo = `**Status:** ${ticket.status.name || 'N/A'} (ID: ${ticket.status.id || 'N/A'})\n`;
    statusInfo += `  • Aberto: ${ticket.status.default_open ? 'Sim' : 'Não'}\n`;
    statusInfo += `  • Fechado: ${ticket.is_closed ? 'Sim' : 'Não'}\n`;
    if (ticket.status.default_close) {
      statusInfo += `  • Status padrão de fechamento: Sim\n`;
    }
    if (ticket.status.default_canceled) {
      statusInfo += `  • Status padrão de cancelamento: Sim\n`;
    }
  }

  let priorityInfo = '';
  if (ticket.priority) {
    priorityInfo = `**Prioridade:** ${ticket.priority.name || 'N/A'} (ID: ${ticket.priority.id || 'N/A'})\n`;
    if (ticket.priority.start_time || ticket.priority.end_time) {
      priorityInfo += `  • Janela SLA: ${ticket.priority.start_time || '?'} → ${ticket.priority.end_time || '?'}\n`;
    }
    if (ticket.priority.order !== undefined && ticket.priority.order !== null) {
      priorityInfo += `  • Ordem: ${ticket.priority.order}\n`;
    }
  } else {
    priorityInfo = `**Prioridade:** Não definida\n`;
  }

  let deskInfo = '';
  if (ticket.desk) {
    deskInfo = `**Mesa:** ${ticket.desk.display_name || ticket.desk.name || 'N/A'} (ID: ${ticket.desk.id || 'N/A'})\n`;
    deskInfo += `  • Nome interno: ${ticket.desk.name || 'N/A'}\n`;
    deskInfo += `  • Ativa: ${ticket.desk.active ? 'Sim' : 'Não'}\n`;
    if (ticket.desk.appointment_type) {
      deskInfo += `  • Tipo de apontamento: ${ticket.desk.appointment_type}\n`;
    }
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
    // responsible.gauth_enabled e responsible.last_login_at: NAO expor (decisao consciente —
    // detalhe de autenticacao e dado de sessao sem relacao com o conteudo do ticket)
  } else {
    responsibleInfo = `**Responsável:** Não atribuído\n`;
  }

  // --- Bloco B: Solicitante ---
  let requestorInfo = '';
  if (ticket.requestor && ticket.requestor.name) {
    requestorInfo = `**Solicitante:** ${ticket.requestor.name}\n`;
    if (ticket.requestor.email) {
      requestorInfo += `  • Email: ${ticket.requestor.email}\n`;
    }
    if (ticket.requestor.telephone) {
      requestorInfo += `  • Telefone: ${ticket.requestor.telephone}\n`;
    }
    if (ticket.requestor.ramal) {
      requestorInfo += `  • Ramal: ${ticket.requestor.ramal}\n`;
    }
  }

  let clientInfo = '';
  if (ticket.client) {
    clientInfo = `**Cliente:** ${ticket.client.name || 'N/A'} (ID: ${ticket.client.id || 'N/A'})\n`;
    if (ticket.client.social) {
      clientInfo += `  • Razão social: ${ticket.client.social}\n`;
    }
    if (ticket.client.social_revenue) {
      // A API documenta social_revenue do cliente como filtro "CPF ou CNPJ"
      // (ver list_clients/search_client no README). Rótulo "CPF/CNPJ" — não "CNPJ"
      // isolado, que assumiria pessoa jurídica sem base (pode ser CPF de PF).
      clientInfo += `  • CPF/CNPJ: ${ticket.client.social_revenue}\n`;
    }
    clientInfo += `  • Ativo: ${ticket.client.status ? 'Sim' : 'Não'}\n`;
  }

  let createdByInfo = '';
  if (ticket.created_by_id) {
    createdByInfo = `**Criado por:** `;
    // created_by{} retorna null na amostra Fase 0 — usar created_by_id. Fallback barato
    // para o nome caso algum tenant/tipo de ticket fora da amostra o devolva.
    createdByInfo += ticket.created_by?.name ? `${ticket.created_by.name} (ID ${ticket.created_by_id})` : `ID ${ticket.created_by_id}`;
    if (ticket.created_by_way_of) {
      createdByInfo += ` (via ${ticket.created_by_way_of})`;
    }
    createdByInfo += `\n`;
  }

  let updatedByInfo = '';
  if (ticket.updated_by_id) {
    updatedByInfo = `**Atualizado por:** `;
    // updated_by{} retorna null na amostra Fase 0 — usar updated_by_id. Fallback barato
    // para o nome caso algum tenant/tipo de ticket fora da amostra o devolva.
    updatedByInfo += ticket.updated_by?.name ? `${ticket.updated_by.name} (ID ${ticket.updated_by_id})` : `ID ${ticket.updated_by_id}`;
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
    if (ticket.sla_info.solved_in_time !== null && ticket.sla_info.solved_in_time !== undefined) {
      slaInfo += `  • Resolvido no prazo: ${ticket.sla_info.solved_in_time ? 'Sim' : 'Não'}\n`;
    }
    if (ticket.sla_info.attend_sla_solution !== null && ticket.sla_info.attend_sla_solution !== undefined) {
      slaInfo += `  • SLA atendimento/solução: ${ticket.sla_info.attend_sla_solution ? 'Sim' : 'Não'}\n`;
    }
    if (ticket.sla_info.desactivate_sla_reason) {
      slaInfo += `  • Motivo desativação SLA: ${ticket.sla_info.desactivate_sla_reason}\n`;
    }
  }

  // --- Bloco B: Checklists summary ---
  let checklistInfo = '';
  const cs = ticket.checklists_summary;
  if (cs && cs.total > 0) {
    checklistInfo = `\n**Checklists:** ${cs.total} total`;
    if (cs.pending > 0) checklistInfo += `, ${cs.pending} pendente(s)`;
    if (cs.required_pending > 0) checklistInfo += `, ${cs.required_pending} obrigatório(s) pendente(s)`;
    checklistInfo += `\n`;
    if (cs.blocks_close || cs.required_pending > 0) {
      checklistInfo += `  ⚠️ **Bloqueio de fechamento:** checklists obrigatórios pendentes`;
      if (cs.missing_required_checklists && cs.missing_required_checklists.length > 0) {
        checklistInfo += ` — ${cs.missing_required_checklists.join(', ')}`;
      }
      checklistInfo += `\n`;
    }
  }

  // --- Bloco B: Equipamento ---
  let equipmentInfo = '';
  if (ticket.equipment && ticket.equipment.id !== null && ticket.equipment.id !== undefined) {
    equipmentInfo = `\n**Equipamento:** ${ticket.equipment.name || 'N/A'} (ID: ${ticket.equipment.id})\n`;
    if (ticket.equipment.group_id) {
      equipmentInfo += `  • Grupo ID: ${ticket.equipment.group_id}\n`;
    }
    if (ticket.equipment.user_id) {
      equipmentInfo += `  • Usuário ID: ${ticket.equipment.user_id}\n`;
    }
  }

  // --- Bloco B: Feedback ---
  let feedbackInfo = '';
  if (ticket.feedback) {
    // Shape confirmado contra a API real: { id, comments, rating } — ver api-shapes.md
    // da spec. A escala do rating nao e documentada na Swagger ("Nota da avaliacao do
    // ticket", integer), por isso exibimos o numero cru sem afirmar "/5".
    const fb = ticket.feedback;
    const comments = typeof fb.comments === 'string' ? fb.comments.trim() : '';
    if (fb.rating !== null && fb.rating !== undefined) {
      feedbackInfo = `\n**Feedback/Avaliação:**\n  • Nota: ${fb.rating}\n`;
      if (comments) {
        feedbackInfo += `  • Comentário: ${truncate(comments)}\n`;
      }
    } else if (comments) {
      feedbackInfo = `\n**Feedback/Avaliação:**\n  • Comentário: ${truncate(comments)}\n`;
    } else {
      // Shape inesperado (fora do contrato confirmado) — dump com cap de tamanho para
      // nao perder o dado nem estourar tokens caso venha grande/aninhado.
      feedbackInfo = `\n**Feedback/Avaliação:** ${truncate(JSON.stringify(fb))}\n`;
    }
  }

  let additionalInfo = '';
  if (ticket.followers) {
    additionalInfo += `**Seguidores:** ${ticket.followers}\n`;
  }
  // tags: campo fantasma (null na API real) — removido
  if (ticket.worked_hours) {
    additionalInfo += `**Horas trabalhadas:** ${ticket.worked_hours}\n`;
  }
  // closed_at: campo fantasma (null na API real) — substituído por closed_ticket_total_spent_solving
  if (ticket.closed_ticket_total_spent_solving) {
    additionalInfo += `**Tempo total de resolução:** ${ticket.closed_ticket_total_spent_solving}\n`;
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
  if (ticket.last_answer_type) {
    additionalInfo += `**Última resposta:** ${ticket.last_answer_type}\n`;
  }
  if (ticket.created_with_ai) {
    additionalInfo += `**Criado com IA:** Sim\n`;
  }
  if (ticket.is_duplicating) {
    additionalInfo += `**Duplicação em andamento:** Sim\n`;
  }
  if (ticket.priority_change_reason) {
    additionalInfo += `**Motivo de mudança de prioridade:** ${ticket.priority_change_reason}\n`;
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
         `${requestorInfo ? requestorInfo + '\n' : ''}` +
         `${clientInfo}\n` +
         `${createdByInfo}` +
         `**Criado em:** ${ticket.created_at || 'N/A'}\n` +
         `${updatedByInfo}` +
         `**Atualizado em:** ${ticket.updated_at || 'N/A'}\n` +
         `${additionalInfo}` +
         `${hierarchyInfo}` +
         `${checklistInfo}` +
         `${equipmentInfo}` +
         `${feedbackInfo}` +
         `${slaInfo}` +
         `${urlInfo}\n` +
         `**Descrição:**\n${ticket.description || 'Sem descrição'}${entitiesText}\n\n` +
         `${footer(verbosity)}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, show_entities, include_filled_entity } = args;
  const v = verbosity || 'rich';

  requireField(args, 'ticket_number');

  try {
    const options = {};
    if (show_entities) options.show_entities = true;
    if (include_filled_entity) options.include_filled_entity = true;

    const response = await api.fetchTicket(ticket_number, options);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao buscar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
      );
    }

    return textResponse(formatTicket(ticket_number, response.data, v));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatTicket };

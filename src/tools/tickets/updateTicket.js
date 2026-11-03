/**
 * Slice: update_ticket — atualiza um ticket existente.
 *
 * Endpoint: PUT /tickets/{ticket_number} (via api.updateTicket).
 *
 * Resolve por nome: desk_name, stage_name, priority_name, catalog_item_name (na mesa
 * atual do ticket quando nenhuma mesa-destino e informada), responsible_name e
 * requestor_name. A mesa atual vem de UM `fetchTicket` (so quando necessario).
 * Mesa informada igual a mesa atual NAO e transferencia: o PUT nao leva desk_id.
 *
 * client_id nao vai ao PUT (a API v2 rejeita com 400): serve so de dica para achar
 * o solicitante por nome. Trocar o cliente so e possivel pela interface do TiFlux.
 *
 * Frente 3: mapeia erros 42202 de transferencia (relacionamento de mesa ausente,
 * catalogo exigido) para mensagens amigaveis orientando o operador.
 * Resolvers por nome: updateTicketResolvers.js. Resumo de sucesso: updateTicketSummary.js.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { ValidationError, requireField, parseIntStrict } = require('../_shared/validators');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const {
  resolveStageByName,
  resolveFirstStage,
  resolvePriorityByName,
  resolveCatalogItemByName,
  resolveRequestorByName
} = require('./updateTicketResolvers');
const { buildSuccessText } = require('./updateTicketSummary');

const TRANSFER_ALLOWED_FIELDS = 'desk_id, stage_id, status_id, priority_id, services_catalogs_item_id, responsible_id';

const schema = {
  name: 'update_ticket',
  description: `Atualiza um ticket existente (ticket_number + ao menos 1 campo). Mesa primeiro: nome sem qualificar = desk_name; atendente atribuído = responsible_name/responsible_id.

**Cliente:** trocar o cliente do ticket não é possível pela API; use a interface do TiFlux. client_id aqui só ajuda a achar o solicitante por nome.

**Mesa atual × transferência:** sem desk_id/desk_name, stage_name, priority_name e catalog_item_name são resolvidos na mesa ATUAL do ticket (o MCP lê o ticket antes). Informar a mesa em que o ticket já está NÃO é transferência. Só é transferência quando a mesa final difere da atual. Na transferência só valem: ${TRANSFER_ALLOWED_FIELDS}; title, description, followers e requestor (id ou nome) exigem uma 2ª chamada, e remover o responsável (responsible_id null) também.

**Prioridade:**
- Transferindo de mesa: inclua priority_id ou priority_name (prioridade é escopada por mesa e se perde na transferência; se a mesa-destino exigir prioridade, a transferência falha sem ela). NÃO envie priority_change_reason.
- Na mesa atual: priority_id ou priority_name + priority_change_reason (OBRIGATÓRIO).
- Na transferência, catálogo, prioridade e status voltam ao padrão da mesa de destino quando não informados.

**SLA e ticket pai:** stopped (true pausa o SLA e exige stop_answer como motivo; false retoma, sem motivo) e ticket_reference_number (define o ticket pai; null desvincula).

O resumo mostra o estado final devolvido pela API e avisa quando um campo enviado não foi aplicado.`,
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser atualizado (ex: "123", "456")' },
      title: { type: 'string', description: 'Novo título do ticket (opcional)' },
      description: { type: 'string', description: 'Nova descrição do ticket (opcional). Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      client_id: { type: 'number', description: 'ID do cliente do ticket. NÃO troca o cliente (a API não permite; use a interface do TiFlux). Este campo só ajuda a achar o solicitante por nome (requestor_name) no cliente certo; junto com outros campos é ignorado e o resumo avisa.' },
      desk_id: { type: 'number', description: 'ID da mesa (opcional). Se diferente da mesa atual do ticket, transfere o ticket para outra mesa; se igual, é ignorado (não é transferência). Como estágios e prioridades são escopados por mesa, ao transferir sem informar stage_id/stage_name o MCP resolve automaticamente o 1º estágio da mesa-destino.' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados"). Prefira este campo quando o usuário der um nome sem qualificar a entidade.' },
      stage_id: { type: 'number', description: 'ID do estágio/fase do ticket (opcional)' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática (alternativa ao stage_id). Sem mesa, usa a mesa atual do ticket. Nome exato (sem caixa/acento) vence nomes parecidos.' },
      priority_id: { type: 'number', description: 'ID da prioridade do ticket (opcional). Prioridades são escopadas por mesa — use list_desk_priorities para descobrir IDs válidos na mesa-destino.' },
      priority_name: { type: 'string', description: 'Nome da prioridade para busca automática. Sem mesa, usa a mesa atual do ticket. Fora de transferência exige priority_change_reason (ver regras de prioridade na descrição da tool).' },
      priority_change_reason: { type: 'string', description: 'Motivo da mudança de prioridade (texto livre). OBRIGATÓRIO ao mudar a prioridade fora de transferência de mesa (a API rejeita sem ele); em transferência é ignorado automaticamente (a API rejeita).' },
      status_id: { type: 'number', description: 'ID do status do ticket (opcional). Não há endpoint de listagem de status por mesa na API v2 — informe o ID diretamente (sem status_name).' },
      responsible_id: { type: 'number', description: 'ID do responsável (opcional - use null ou omita para remover responsável). Remover o responsável não funciona junto com transferência de mesa (faça em 2 chamadas).' },
      responsible_name: { type: 'string', description: 'Nome do responsável para busca automática (alternativa ao responsible_id)' },
      requestor_id: { type: 'number', description: 'ID do novo solicitante do ticket (opcional). O solicitante deve pertencer ao mesmo cliente vinculado ao ticket. Conflito com requestor_name: requestor_id tem prioridade.' },
      requestor_name: { type: 'string', description: 'Nome do solicitante para busca automática (alternativa ao requestor_id). Busca em GET /requestors (global) com fallback para GET /clients/{id}/requestors em caso de 403. Multiplos candidatos listam opções para desambiguação; zero → sugerir search_requestor. Conflito com requestor_id: requestor_id vence.' },
      followers: { type: 'string', description: 'E-mails dos seguidores separados por vírgula. ATENÇÃO: o valor enviado SUBSTITUI a lista atual de seguidores — para adicionar sem remover, consulte os seguidores atuais via get_ticket e envie a lista completa (atuais + novos). String vazia "" remove todos os seguidores.' },
      services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo para atualizar mesa com item específico (opcional)' },
      catalog_item_name: { type: 'string', description: 'Nome do item de catálogo para busca automática (alternativa ao services_catalogs_item_id). Sem mesa, usa a mesa atual do ticket.' },
      stopped: { type: 'boolean', description: 'Pausa (true) ou retoma (false) o SLA do ticket. Pausar exige stop_answer; retomar vai sem motivo (se informado, é descartado). A mesa precisa permitir pausa, o ticket não pode estar no 1º estágio nem com o SLA de solução vencido, e a pausa não vai junto com outros campos (faça em chamada separada).' },
      stop_answer: { type: 'string', description: 'Motivo da pausa do SLA (texto livre). Obrigatório com stopped: true; na retomada (false) não é enviado, porque a API recusa; não vale sozinho.' },
      ticket_reference_number: { type: ['number', 'null'], description: 'Número do ticket pai (define o vínculo pai/filho; aceita "#123"). null desvincula do ticket pai.' }
    },
    required: ['ticket_number']
  }
};

/**
 * Tenta mapear um erro 422 / error_code 42202 para uma mensagem amigavel.
 * Retorna string formatada se reconhecido, ou null caso contrario.
 *
 * @param {object} responseError — objeto de erro retornado por api.updateTicket
 * @param {string|number} deskRef — nome ou ID da mesa-destino (para mensagem)
 */
function mapTransferError422(responseError, deskRef) {
  if (!responseError) return null;
  // api.updateTicket sempre retorna error como string (ver tiflux-api.js _handleError);
  // se vier outro tipo, nao da pra casar por substring de forma confiavel — degradar p/ erro generico.
  if (typeof responseError !== 'string') return null;

  const errorText = responseError;

  // Relacionamento de mesa ausente
  if (errorText.includes('desk_id') && errorText.includes('relationship')) {
    const deskLabel = deskRef ? `**${deskRef}**` : 'a mesa-destino';
    return (
      `**Erro: ${deskLabel} não está vinculada à mesa atual do ticket.**\n\n` +
      `Para transferir, configure o relacionamento entre as mesas no TiFlux (Configurações → Mesas → Relacionamentos).\n\n` +
      `*Se você só quer alterar o estágio ou a prioridade na mesa atual (sem transferir), omita \`desk_id\`/\`desk_name\` (ou informe a própria mesa atual).*\n\n` +
      `**Detalhe da API:** ${errorText}`
    );
  }

  // Catalogo exigido pela mesa-destino
  if (errorText.includes('services_catalogs_item_id') && (errorText.includes('requires a services catalog') || errorText.includes('catalog item'))) {
    const deskLabel = deskRef ? `**${deskRef}**` : 'A mesa-destino';
    return (
      `**Erro: ${deskLabel} exige um item de catálogo de serviços.**\n\n` +
      `Informe \`catalog_item_name\` ou \`services_catalogs_item_id\` válido da mesa-destino antes de transferir.\n\n` +
      `**Detalhe da API:** ${errorText}`
    );
  }

  return null;
}

const isNil = (v) => v === undefined || v === null;

// client_id nunca vai ao PUT, mas e dica de busca do solicitante: validado igual p/ erro local claro.
const STRICT_ID_FIELDS = [
  'client_id', 'desk_id', 'stage_id', 'priority_id', 'status_id', 'services_catalogs_item_id', 'responsible_id', 'requestor_id'
];

/** Erro local de combinacoes que a API rejeita na transferencia de mesa (H20/H21). */
function transferConflictError(args, ticketNumber) {
  const unsupported = [];
  ['title', 'description', 'followers', 'requestor_id', 'requestor_name'].forEach(f => {
    if (args[f] !== undefined) unsupported.push(f);
  });

  if (args.responsible_id === null || args.responsible_id === 0) {
    return errorResponse(
      `**Erro: remover o responsável não funciona junto com a transferência de mesa**\n\n` +
      `*Faça em 2 chamadas: primeiro a transferência (sem \`responsible_id: null\`), depois remova o responsável do ticket #${ticketNumber}.*`
    );
  }

  if (unsupported.length > 0) {
    return errorResponse(
      `**Erro: ${unsupported.join(', ')} não pode(m) ir junto com a transferência de mesa**\n\n` +
      `Na transferência a API aceita só: ${TRANSFER_ALLOWED_FIELDS}.\n\n` +
      `*Faça em 2 chamadas: a transferência primeiro, depois ${unsupported.join(', ')} no ticket #${ticketNumber} (agora na mesa nova).*`
    );
  }
  return null;
}

/** Nomes que exigem conhecer a mesa para serem resolvidos. */
function nameFieldsNeedingDesk(args) {
  const fields = [];
  if (args.stage_name && !args.stage_id) fields.push('stage_name');
  if (args.priority_name && !args.priority_id) fields.push('priority_name');
  if (args.catalog_item_name && !args.services_catalogs_item_id) fields.push('catalog_item_name');
  return fields;
}

/** Erro de leitura do ticket (necessario p/ resolver mesa atual). */
function ticketReadError(ticketNumber, ticketResp, fields) {
  if (ticketResp.status === 404) {
    return errorResponse(
      `**Ticket #${ticketNumber} nao encontrado**\n\n` +
      `*Verifique o numero do ticket.*`
    );
  }
  const what = fields.length > 0 ? `resolver ${fields.join('/')} por nome` : 'comparar a mesa informada com a mesa atual';
  return errorResponse(
    `**Erro: nao foi possivel ler o ticket #${ticketNumber} para ${what}; informe o ID**\n\n` +
    `**Erro:** ${ticketResp.error}\n\n` +
    `*Use o ID (stage_id, priority_id, services_catalogs_item_id) para evitar a leitura do ticket.*`
  );
}

/** Mapeia erro da API no PUT para a resposta MCP. */
function updateFailureResponse({ response, ticketNumber, deskRef, clientId, stopFieldsSent }) {
  const friendlyError = mapTransferError422(response.error, deskRef);
  if (friendlyError) {
    return errorResponse(`**❌ Erro ao atualizar ticket #${ticketNumber}**\n\n${friendlyError}`);
  }

  // Requestor not found (422 detail.requestor_id → "requestor not found")
  if (typeof response.error === 'string' &&
      response.error.includes('requestor_id') &&
      response.error.toLowerCase().includes('requestor not found')) {
    const clientRef = clientId ? `client_id=${clientId}` : 'o client_id do ticket';
    return errorResponse(
      `**❌ Erro ao atualizar ticket #${ticketNumber}**\n\n` +
      `**Erro: solicitante não encontrado ou não pertence ao cliente deste ticket.**\n\n` +
      `O \`requestor_id\` informado não existe ou não está vinculado ao cliente do ticket.\n\n` +
      `Use \`search_requestor\` com ${clientRef} para localizar solicitantes válidos.\n\n` +
      `**Detalhe da API:** ${response.error}`
    );
  }

  // 422 em stopped/stop_answer/ticket_reference_number: o detail da API e o que importa
  if (stopFieldsSent && response.status === 422) {
    return errorResponse(
      `**❌ Erro ao atualizar ticket #${ticketNumber}**\n\n` +
      `**Código:** ${response.status}\n` +
      `**Mensagem:** ${response.error}`
    );
  }

  return errorResponse(
    `**❌ Erro ao atualizar ticket #${ticketNumber}**\n\n` +
    `**Código:** ${response.status}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    `*Verifique se o ticket existe e se você tem permissão para editá-lo.*`
  );
}

/** "#123" (formato que o MCP exibe) → "123". Outros valores passam intactos para a validacao estrita. */
function stripHash(value) {
  return typeof value === 'string' ? value.trim().replace(/^#/, '') : value;
}

/**
 * Normaliza o input antes da validacao. Clientes MCP com schema antigo em cache mandam
 * booleanos e null como texto ("false", "null"): sem isso, "false" seria truthy e
 * "null" seria recusado em vez de desvincular.
 */
function normalizeArgs(args) {
  const out = { ...args };
  if (out.ticket_number !== undefined) out.ticket_number = stripHash(out.ticket_number);
  if (out.ticket_reference_number !== undefined) {
    const ref = stripHash(out.ticket_reference_number);
    out.ticket_reference_number = ref === 'null' ? null : ref;
  }
  if (typeof out.stopped === 'string') {
    const v = out.stopped.trim().toLowerCase();
    if (v !== 'true' && v !== 'false') throw new ValidationError('stopped deve ser true (pausar) ou false (retomar)');
    out.stopped = v === 'true';
  }
  return out;
}

/**
 * Regras da API (Validate::UpdateTicket): pausar = stopped true + stop_answer; retomar =
 * stopped false SEM stop_answer (com motivo a API responde "stop_answer without stopped(true)");
 * stop_answer sozinho e recusado.
 */
function validateStopFields(stopped, stopAnswer) {
  const hasAnswer = typeof stopAnswer === 'string' && stopAnswer.trim() !== '';
  if (stopped === true && !hasAnswer) {
    throw new ValidationError('stop_answer (motivo) é obrigatório para pausar o SLA');
  }
  if (stopAnswer !== undefined && (stopped === undefined || stopped === null)) {
    throw new ValidationError('stop_answer só vale junto com stopped: true (pausar o SLA)');
  }
}

async function execute(rawArgs, { api }) {
  const args = normalizeArgs(rawArgs);
  const {
    ticket_number,
    title,
    description,
    client_id,
    desk_id,
    desk_name,
    stage_id,
    stage_name,
    priority_id,
    priority_name,
    priority_change_reason,
    status_id,
    responsible_id,
    responsible_name,
    requestor_id,
    requestor_name,
    followers,
    services_catalogs_item_id,
    catalog_item_name,
    stopped,
    stop_answer,
    ticket_reference_number
  } = args;

  requireField(args, 'ticket_number');
  // ticket_number vai cru ao path do PUT: "1/cancel" ou "../desks/1" mirariam outro endpoint de escrita.
  parseIntStrict(ticket_number, 'ticket_number');
  // Estrito: parseInt('#123') = NaN viraria null no JSON e DESVINCULARIA o ticket pai em silencio.
  if (!isNil(ticket_reference_number)) parseIntStrict(ticket_reference_number, 'ticket_reference_number');
  validateStopFields(stopped, stop_answer);
  // Mesmo padrao nos IDs: "abc" viraria NaN → null no PUT (remove responsavel, "transfere" p/ mesa NaN).
  // null explicito segue o comportamento atual (ex.: responsible_id null remove o responsavel).
  for (const field of STRICT_ID_FIELDS) {
    if (!isNil(args[field])) parseIntStrict(args[field], field);
  }

  try {
    // fetchTicket memoizado: no maximo UMA leitura do ticket por execucao.
    let ticketPromise = null;
    const getTicket = () => {
      if (!ticketPromise) ticketPromise = api.fetchTicket(ticket_number);
      return ticketPromise;
    };

    // Plano: valores e nomes resolvidos, usados no PUT e no resumo.
    const plan = { title, description, followers, stopped, stopAnswer: stop_answer, ticketReference: ticket_reference_number };

    let finalDeskId = desk_id;
    let finalStageId = stage_id;
    let finalPriorityId = priority_id;
    let finalCatalogItemId = services_catalogs_item_id;
    let finalResponsibleId = responsible_id;
    let finalRequestorId = requestor_id !== undefined ? Number.parseInt(requestor_id, 10) : undefined;

    // desk_name → desk_id
    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }
    if (finalDeskId !== undefined) plan.desk = { id: Number.parseInt(finalDeskId, 10), name: desk_name || null };

    // Mesa atual: 1 fetchTicket quando ha mesa informada OU nomes que dependem da mesa.
    const nameFields = nameFieldsNeedingDesk(args);
    let currentDeskId;
    if (finalDeskId !== undefined || nameFields.length > 0) {
      const ticketResp = await getTicket();
      if (ticketResp.error || !ticketResp.data) {
        return ticketReadError(ticket_number, ticketResp, nameFields);
      }
      const deskOfTicket = ticketResp.data.desk;
      currentDeskId = deskOfTicket?.id === undefined ? undefined : Number.parseInt(deskOfTicket.id, 10);
    }

    // Transferencia = mesa final diferente da atual.
    const isDeskTransfer = finalDeskId !== undefined && Number.parseInt(finalDeskId, 10) !== currentDeskId;
    plan.isTransfer = isDeskTransfer;

    if (isDeskTransfer) {
      const conflict = transferConflictError(args, ticket_number);
      if (conflict) return conflict;
    }

    // Mesa em que estagio/prioridade/catalogo por nome sao resolvidos.
    const effectiveDeskId = isDeskTransfer ? Number.parseInt(finalDeskId, 10) : currentDeskId;

    if (effectiveDeskId === undefined && (nameFields.length > 0 || isDeskTransfer)) {
      return errorResponse(
        `**Erro: nao foi possivel identificar a mesa do ticket #${ticket_number}**\n\n` +
        `*Informe desk_id ou desk_name, ou use os IDs (stage_id, priority_id, services_catalogs_item_id).*`
      );
    }

    // Estagio: por nome, ou 1o estagio da mesa-destino em transferencia.
    if (stage_name && !stage_id) {
      const r = await resolveStageByName(api, effectiveDeskId, stage_name);
      if (r.error) return r.error;
      finalStageId = r.stageId;
      plan.stage = { id: r.stageId, name: r.stageName };
    } else if (isDeskTransfer && !stage_id) {
      const r = await resolveFirstStage(api, effectiveDeskId);
      if (r.error) return r.error;
      finalStageId = r.stageId;
      plan.stage = { id: r.stageId, name: r.stageName };
      plan.autoStage = plan.stage;
    } else if (stage_id !== undefined) {
      plan.stage = { id: stage_id, name: null };
    }

    // Prioridade por nome
    if (priority_name && !priority_id) {
      const r = await resolvePriorityByName(api, effectiveDeskId, priority_name);
      if (r.error) return r.error;
      finalPriorityId = r.priorityId;
      plan.priority = { id: r.priorityId, name: r.priorityName };
    } else if (priority_id !== undefined) {
      plan.priority = { id: priority_id, name: null };
    }

    // Responsavel por nome (desambiguacao server-side via mesa quando conhecida)
    if (responsible_name && !responsible_id) {
      const resolved = await resolveResponsibleName(api, responsible_name, {
        deskId: effectiveDeskId !== undefined ? Number.parseInt(effectiveDeskId, 10) : undefined
      });
      if (resolved.error) return resolved.response;
      finalResponsibleId = resolved.userId;
      plan.responsible = { id: resolved.userId, name: (resolved.user && resolved.user.name) || responsible_name };
    } else if (responsible_id !== undefined) {
      plan.responsible = responsible_id ? { id: responsible_id, name: null } : null;
    }

    // Item de catalogo por nome
    if (catalog_item_name && !services_catalogs_item_id) {
      const r = await resolveCatalogItemByName(api, effectiveDeskId, catalog_item_name);
      if (r.error) return r.error;
      finalCatalogItemId = r.itemId;
      plan.catalog = { id: r.itemId, name: r.itemName };
    } else if (services_catalogs_item_id !== undefined) {
      plan.catalog = { id: services_catalogs_item_id, name: null };
    }

    // Solicitante por nome (requestor_id vence). client_id informado serve de dica.
    if (requestor_name && requestor_id === undefined) {
      const r = await resolveRequestorByName({
        api, name: requestor_name, ticketNumber: ticket_number, clientHint: client_id, getTicket
      });
      if (r.error) return r.error;
      finalRequestorId = r.requestorId;
      plan.requestor = { id: r.requestorId, name: r.requestorName };
    } else if (finalRequestorId !== undefined) {
      plan.requestor = { id: finalRequestorId, name: null };
    }

    // priority_change_reason: obrigatorio FORA de transferencia (API 42201), proibido nela (42202).
    if (finalPriorityId !== undefined && !isDeskTransfer &&
        (priority_change_reason === undefined || String(priority_change_reason).trim() === '')) {
      return errorResponse(
        `**Erro: priority_change_reason obrigatório ao alterar a prioridade**\n\n` +
        `*A API v2 exige um motivo (priority_change_reason) ao mudar a prioridade de um ticket fora de uma transferência de mesa.*`
      );
    }

    // Dados de atualizacao (apenas campos fornecidos). client_id NUNCA vai ao PUT (H9).
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = markdownToHtml(description);
    if (isDeskTransfer) updateData.desk_id = Number.parseInt(finalDeskId, 10);
    if (finalStageId !== undefined) updateData.stage_id = Number.parseInt(finalStageId, 10);
    if (finalPriorityId !== undefined) updateData.priority_id = Number.parseInt(finalPriorityId, 10);
    if (finalPriorityId !== undefined && !isDeskTransfer) {
      updateData.priority_change_reason = priority_change_reason;
      plan.priorityReason = priority_change_reason;
    } else if (priority_change_reason !== undefined && isDeskTransfer) {
      // Reason numa transferencia: a API rejeitaria; descartamos e avisamos no resumo.
      plan.priorityReasonDropped = true;
    }
    if (status_id !== undefined) {
      updateData.status_id = Number.parseInt(status_id, 10);
      plan.statusId = status_id;
    }
    if (followers !== undefined) updateData.followers = followers;
    if (finalCatalogItemId !== undefined) updateData.services_catalogs_item_id = Number.parseInt(finalCatalogItemId, 10);
    if (finalResponsibleId !== undefined) {
      updateData.responsible_id = finalResponsibleId ? Number.parseInt(finalResponsibleId, 10) : null;
    }
    if (finalRequestorId !== undefined) updateData.requestor_id = finalRequestorId;
    if (stopped !== undefined) updateData.stopped = stopped;
    // Retomada nao leva motivo: a API recusa stop_answer com stopped false.
    if (stop_answer !== undefined && stopped === false) {
      plan.stopAnswer = undefined;
      plan.stopAnswerDropped = true;
    } else if (stop_answer !== undefined) {
      updateData.stop_answer = stop_answer;
    }
    if (ticket_reference_number !== undefined) {
      updateData.ticket_reference_number = isNil(ticket_reference_number) ? null : Number.parseInt(ticket_reference_number, 10);
      plan.ticketReference = updateData.ticket_reference_number;
    }

    if (Object.keys(updateData).length === 0) {
      if (client_id !== undefined) {
        return errorResponse(
          `**Erro: trocar o cliente do ticket não é possível pela API**\n\n` +
          `**Ticket ID:** #${ticket_number}\n\n` +
          `*Use a interface do TiFlux para trocar o cliente. O campo \`client_id\` aqui só ajuda a achar o solicitante por nome.*`
        );
      }
      return errorResponse(
        `**⚠️ Nenhum campo informado para atualização**\n\n` +
        `**Ticket ID:** #${ticket_number}\n\n` +
        `*Informe pelo menos um campo para atualizar: title, description, desk_id, stage_id, priority_id, priority_name, status_id, responsible_id, requestor_id, requestor_name, followers, stopped, stop_answer, ticket_reference_number*`
      );
    }

    // client_id junto com outros campos: nao vai ao PUT; o resumo avisa que foi ignorado.
    if (client_id !== undefined) plan.clientIdIgnored = true;

    const response = await api.updateTicket(ticket_number, updateData);

    if (response.error) {
      const deskRef = (plan.desk && plan.desk.name) || (finalDeskId ? `ID ${finalDeskId}` : null);
      const stopFieldsSent = stopped !== undefined || stop_answer !== undefined || ticket_reference_number !== undefined;
      return updateFailureResponse({
        response, ticketNumber: ticket_number, deskRef, clientId: client_id, stopFieldsSent
      });
    }

    return textResponse(buildSuccessText(ticket_number, plan, updateData, response.data));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

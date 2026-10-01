/**
 * valorizationResolver.js — Resolucao de IDs de valorizacao por nome.
 *
 * Fica local ao modulo appointments (nao em _shared/) porque so createAppointment
 * consome — regra do CLAUDE.md: promove para _shared apenas com >= 3 slices.
 *
 * Reusa:
 *   - fuzzyMatchItems (_shared/fuzzyMatch.js) — matching aproximado
 *   - api.fetchTicketShifts → array { id, name, reference, client, contract }
 *   - api.fetchTicketServiceTypes → { contract_riders: [...], loose_services: [...] }
 *   - REFERENCE_LABELS (tickets/getTicketShifts.js) — rotulo pt-BR do `reference` do shift,
 *     reusado na linha de ambiguidade em vez de duplicar o mapa
 *
 * Precedencia: *_id vence *_name quando ambos forem passados (mesma convencao
 * de resolveAppointmentFilterIds em appointmentFilters.js).
 *
 * Piso de confianca (spec 2026-09-24, BL-023 + BL-026): estes tres campos
 * determinam faturamento (contrato, servico avulso, deslocamento cobrado ao
 * cliente), entao um match unico de score baixo nao resolve mais em silencio —
 * MIN_VALORIZATION_SCORE (mesmo padrao de MIN_PRIORITY_SCORE em listTickets.js
 * e MIN_MATCH_SCORE em entityFieldResolver.js) + desempate so por nome exato
 * (score 100), via helper unico `pickValorizationMatch`.
 *
 * Cada funcao retorna:
 *   { error: false, <id-key>: number, <item-key>: object }  — sucesso, com o item resolvido
 *   { error: true, response: <mcp-response> }  — falha propagavel pelo caller
 */

const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');
const { errorResponse } = require('../_shared/errors');
const { REFERENCE_LABELS } = require('../tickets/getTicketShifts');

// Score minimo para um candidato contar na resolucao de valorizacao por nome.
// Pela tabela de calculateMatchScore, 70 exige que o termo seja o comeco de
// alguma palavra do nome (ou coisa mais forte) — substring solta no meio (60)
// deixa de resolver.
const MIN_VALORIZATION_SCORE = 70;

/**
 * Decide o candidato entre os matches (score > 0) de um resolver de valorizacao.
 * Regra unica dos 3 resolvers (D2 da spec):
 *   0 acima do minimo → "nao encontrado" (com ate 5 sugestoes abaixo do minimo, se houver)
 *   1 acima do minimo → resolve
 *   2+ acima do minimo → resolve so se houver exatamente 1 com score 100 (nome exato);
 *     senao, ambiguo
 *
 * @param {Array<{item: object, score: number}>} matches - saida de fuzzyMatchItems.matches
 * @returns {{ item: object }
 *   | { reason: 'notfound', candidates: [] }
 *   | { reason: 'lowscore', candidates: Array<{item, score}> }
 *   | { reason: 'ambiguous', candidates: Array<{item, score}> }}
 */
function pickValorizationMatch(matches) {
  const aboveMin = matches.filter(m => m.score >= MIN_VALORIZATION_SCORE);

  if (aboveMin.length === 0) {
    if (matches.length === 0) return { reason: 'notfound', candidates: [] };
    return { reason: 'lowscore', candidates: matches.slice(0, 5) };
  }

  if (aboveMin.length === 1) {
    return { item: aboveMin[0].item };
  }

  const exact = aboveMin.filter(m => m.score === 100);
  if (exact.length === 1) {
    return { item: exact[0].item };
  }

  return { reason: 'ambiguous', candidates: aboveMin };
}

/**
 * Diz se o contexto passado exige filtrar os candidatos de deslocamento antes
 * do fuzzy match (D1 da spec — espelha a regra do POST).
 *
 * @param {{attendanceKind?: number, riderContractId?: number}} ctx
 * @returns {boolean}
 */
function shiftContextFilterActive(ctx) {
  if (!ctx) return false;
  if (ctx.attendanceKind === 1) return true;
  if (ctx.attendanceKind === 2) return ctx.riderContractId !== undefined && ctx.riderContractId !== null;
  return false;
}

/**
 * Filtra um deslocamento pelo contexto do apontamento, espelhando a regra do
 * POST /tickets/{n}/appointments (item 2 do Contexto da spec 2026-09-24):
 *   - attendance_kind=2 + riderContractId conhecido: mantem o mesmo contrato,
 *     OU sem contrato (`All`/`Client`), OU `Shared` (a API nao expoe o grupo do
 *     deslocamento, entao fica como candidato em vez de ser descartado).
 *   - attendance_kind=1: so os sem contrato (`All`/`Client`) — os de contrato
 *     ou de grupo seriam rejeitados pela API.
 *
 * @param {object} shift
 * @param {{attendanceKind?: number, riderContractId?: number}} ctx
 * @returns {boolean}
 */
function shiftMatchesContext(shift, ctx) {
  const reference = shift.reference;

  if (ctx.attendanceKind === 2) {
    if (shift.contract && shift.contract.id === ctx.riderContractId) return true;
    return reference === 'All' || reference === 'Client' || reference === 'Shared';
  }

  if (ctx.attendanceKind === 1) {
    return reference === 'All' || reference === 'Client';
  }

  return true;
}

/** Linha de ambiguidade de deslocamento — abrangencia + contrato (id e nome), quando houver. */
function shiftAmbiguityLine(shift) {
  const label = REFERENCE_LABELS[shift.reference] || shift.reference || '—';
  let line = `• ID ${shift.id} — ${shift.name} · ${label}`;
  if (shift.contract) {
    line += ` · Contrato #${shift.contract.id} "${shift.contract.name}"`;
  }
  return line;
}

/** Frase que explica, em pt-BR, por que o filtro de contexto descartou candidatos. */
function shiftFilterExplanation(ctx) {
  if (ctx.attendanceKind === 1) {
    return 'atendimento avulso (attendance_kind=1) só aceita deslocamentos genéricos ou do cliente — os de contrato/grupo foram descartados';
  }
  if (ctx.attendanceKind === 2 && ctx.riderContractId !== undefined && ctx.riderContractId !== null) {
    return `deslocamentos de outros contratos foram descartados — só valem o contrato #${ctx.riderContractId} do aditivo informado, genéricos, do cliente ou de grupo`;
  }
  return 'deslocamentos de outro contrato foram descartados';
}

/**
 * Resolve shift_name → shift_id escopado ao ticket.
 * Usa fuzzy match sobre a lista de deslocamentos do ticket, filtrada por `ctx`
 * antes do fuzzy quando o contexto permitir (D1 da spec).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string|number} ticketNumber - numero do ticket
 * @param {string} shiftName - nome (ou parte do nome) do deslocamento
 * @param {{attendanceKind?: number, riderContractId?: number}} [ctx] - contexto do apontamento para filtrar candidatos
 * @returns {Promise<{error: boolean, shiftId?: number, shift?: object, response?: object}>}
 */
async function resolveShiftName(api, ticketNumber, shiftName, ctx = {}) {
  const response = await api.fetchTicketShifts(ticketNumber, {});

  if (response.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar deslocamentos do ticket #${ticketNumber}**\n\n` +
        `Não foi possível resolver o nome de deslocamento "${shiftName}".\n` +
        `Use \`get_ticket_shifts\` para listar os deslocamentos disponíveis e informe \`shift_id\` diretamente.`
      )
    };
  }

  const shifts = response.data || [];
  const filterActive = shiftContextFilterActive(ctx);
  const candidates = filterActive ? shifts.filter(s => shiftMatchesContext(s, ctx)) : shifts;

  const { matches } = fuzzyMatchItems(shiftName, candidates, s => s.name || '');
  const pick = pickValorizationMatch(matches);

  if (pick.reason === 'notfound') {
    if (filterActive) {
      return {
        error: true,
        response: errorResponse(
          `**❌ Nenhum deslocamento de "${shiftName}" válido para este contexto**\n\n` +
          `No ticket #${ticketNumber}, ${shiftFilterExplanation(ctx)}.\n` +
          `Use \`get_ticket_shifts\` para listar os deslocamentos disponíveis e informe \`shift_id\` diretamente.`
        )
      };
    }
    return {
      error: true,
      response: errorResponse(
        `**❌ Deslocamento não encontrado: "${shiftName}"**\n\n` +
        `Nenhum deslocamento do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_shifts\` para listar os deslocamentos disponíveis e informe \`shift_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'lowscore') {
    const suggestions = pick.candidates.map(m => `"${m.item.name}"`).join(', ');
    const contextSuffix = filterActive ? ` dentro do contexto (${shiftFilterExplanation(ctx)})` : '';
    return {
      error: true,
      response: errorResponse(
        `**❌ Deslocamento "${shiftName}" sem correspondência confiável**\n\n` +
        `Nenhum candidato teve confiança suficiente${contextSuffix}. Mais próximos: ${suggestions}.\n\n` +
        `Use \`get_ticket_shifts\` para listar os deslocamentos disponíveis e informe \`shift_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'ambiguous') {
    const lista = pick.candidates.map(m => shiftAmbiguityLine(m.item)).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em shift_name: "${shiftName}"**\n\n` +
        `${pick.candidates.length} deslocamentos encontrados. Informe \`shift_id\` diretamente:\n\n${lista}`
      )
    };
  }

  return { error: false, shiftId: pick.item.id, shift: pick.item };
}

/**
 * Resolve loose_service_name → loose_service_id escopado ao ticket.
 * Usa fuzzy match sobre service_types.loose_services[].name.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string|number} ticketNumber - numero do ticket
 * @param {string} serviceDate - data para consulta (YYYY-MM-DD); usada no filtro de vigencia
 * @param {string} looseName - nome (ou parte) do servico avulso
 * @returns {Promise<{error: boolean, looseServiceId?: number, looseService?: object, response?: object}>}
 */
async function resolveLooseServiceName(api, ticketNumber, serviceDate, looseName) {
  const response = await api.fetchTicketServiceTypes(ticketNumber, serviceDate ? { date: serviceDate } : {});

  if (response.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar tipos de serviço do ticket #${ticketNumber}**\n\n` +
        `Não foi possível resolver o serviço avulso "${looseName}".\n` +
        `Use \`get_ticket_service_types\` para listar os serviços disponíveis e informe \`loose_service_id\` diretamente.`
      )
    };
  }

  const looseServices = (response.data && response.data.loose_services) || [];
  const { matches } = fuzzyMatchItems(looseName, looseServices, s => s.name || '');
  const pick = pickValorizationMatch(matches);

  if (pick.reason === 'notfound') {
    return {
      error: true,
      response: errorResponse(
        `**❌ Serviço avulso não encontrado: "${looseName}"**\n\n` +
        `Nenhum serviço avulso do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_service_types\` para listar os serviços disponíveis e informe \`loose_service_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'lowscore') {
    const suggestions = pick.candidates.map(m => `"${m.item.name}"`).join(', ');
    return {
      error: true,
      response: errorResponse(
        `**❌ Serviço avulso "${looseName}" sem correspondência confiável**\n\n` +
        `Nenhum candidato teve confiança suficiente. Mais próximos: ${suggestions}.\n\n` +
        `Use \`get_ticket_service_types\` para listar os serviços disponíveis e informe \`loose_service_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'ambiguous') {
    const lista = pick.candidates.map(m => `• ID ${m.item.id} — ${m.item.name}`).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em loose_service_name: "${looseName}"**\n\n` +
        `${pick.candidates.length} serviços avulsos encontrados. Informe \`loose_service_id\` diretamente:\n\n${lista}`
      )
    };
  }

  return { error: false, looseServiceId: pick.item.id, looseService: pick.item };
}

/** Linha de ambiguidade de contrato — contract.id e vigencia (start_date/cancel_date), quando houver. */
function contractAmbiguityLine(rider) {
  const name = (rider.contract && rider.contract.name) || '—';
  const contractId = rider.contract ? rider.contract.id : '—';
  const vigencia = rider.start_date && rider.cancel_date
    ? ` · vigência ${rider.start_date} a ${rider.cancel_date}`
    : '';
  return `• contract_rider_id ${rider.id} — ${name} · Contrato #${contractId}${vigencia}`;
}

/**
 * Resolve contract_name → contract_rider_id escopado ao ticket.
 * Faz fuzzy match sobre contract_riders[].contract.name e devolve o contract_rider_id
 * (nao o contract.id) — e o que a API de criacao exige.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string|number} ticketNumber - numero do ticket
 * @param {string} serviceDate - data para consulta (YYYY-MM-DD)
 * @param {string} contractName - nome (ou parte) do contrato
 * @returns {Promise<{error: boolean, contractRiderId?: number, contractRider?: object, response?: object}>}
 */
async function resolveContractName(api, ticketNumber, serviceDate, contractName) {
  const response = await api.fetchTicketServiceTypes(ticketNumber, serviceDate ? { date: serviceDate } : {});

  if (response.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar tipos de serviço do ticket #${ticketNumber}**\n\n` +
        `Não foi possível resolver o contrato "${contractName}".\n` +
        `Use \`get_ticket_service_types\` para listar os contratos disponíveis e informe \`contract_rider_id\` diretamente.`
      )
    };
  }

  const contractRiders = (response.data && response.data.contract_riders) || [];
  const { matches } = fuzzyMatchItems(contractName, contractRiders, r => (r.contract && r.contract.name) || '');
  const pick = pickValorizationMatch(matches);

  if (pick.reason === 'notfound') {
    return {
      error: true,
      response: errorResponse(
        `**❌ Contrato não encontrado: "${contractName}"**\n\n` +
        `Nenhum contrato do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_service_types\` para listar os contratos disponíveis e informe \`contract_rider_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'lowscore') {
    const suggestions = pick.candidates.map(m => `"${(m.item.contract && m.item.contract.name) || '—'}"`).join(', ');
    return {
      error: true,
      response: errorResponse(
        `**❌ Contrato "${contractName}" sem correspondência confiável**\n\n` +
        `Nenhum candidato teve confiança suficiente. Mais próximos: ${suggestions}.\n\n` +
        `Use \`get_ticket_service_types\` para listar os contratos disponíveis e informe \`contract_rider_id\` diretamente.`
      )
    };
  }

  if (pick.reason === 'ambiguous') {
    const lista = pick.candidates.map(m => contractAmbiguityLine(m.item)).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em contract_name: "${contractName}"**\n\n` +
        `${pick.candidates.length} contratos encontrados. Informe \`contract_rider_id\` diretamente:\n\n${lista}`
      )
    };
  }

  // Devolve o contract_rider_id (id do aditivo), nao o contract.id
  return { error: false, contractRiderId: pick.item.id, contractRider: pick.item };
}

module.exports = {
  resolveShiftName,
  resolveLooseServiceName,
  resolveContractName,
  pickValorizationMatch,
  MIN_VALORIZATION_SCORE
};

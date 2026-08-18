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
 *
 * Precedencia: *_id vence *_name quando ambos forem passados (mesma convencao
 * de resolveAppointmentFilterIds em appointmentFilters.js).
 *
 * Cada funcao retorna:
 *   { error: false, <id-key>: number }  — sucesso
 *   { error: true, response: <mcp-response> }  — falha propagavel pelo caller
 */

const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');
const { errorResponse } = require('../_shared/errors');

/**
 * Resolve shift_name → shift_id escopado ao ticket.
 * Usa fuzzy match sobre a lista de deslocamentos do ticket.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string|number} ticketNumber - numero do ticket
 * @param {string} shiftName - nome (ou parte do nome) do deslocamento
 * @returns {Promise<{error: boolean, shiftId?: number, response?: object}>}
 */
async function resolveShiftName(api, ticketNumber, shiftName) {
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
  const { matches } = fuzzyMatchItems(shiftName, shifts, s => s.name || '');

  if (matches.length === 0) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Deslocamento não encontrado: "${shiftName}"**\n\n` +
        `Nenhum deslocamento do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_shifts\` para listar os deslocamentos disponíveis e informe \`shift_id\` diretamente.`
      )
    };
  }

  if (matches.length > 1) {
    const lista = matches.map(m => `• ID ${m.item.id} — ${m.item.name}`).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em shift_name: "${shiftName}"**\n\n` +
        `${matches.length} deslocamentos encontrados. Informe \`shift_id\` diretamente:\n\n${lista}`
      )
    };
  }

  return { error: false, shiftId: matches[0].item.id };
}

/**
 * Resolve loose_service_name → loose_service_id escopado ao ticket.
 * Usa fuzzy match sobre service_types.loose_services[].name.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string|number} ticketNumber - numero do ticket
 * @param {string} serviceDate - data para consulta (YYYY-MM-DD); usada no filtro de vigencia
 * @param {string} looseName - nome (ou parte) do servico avulso
 * @returns {Promise<{error: boolean, looseServiceId?: number, response?: object}>}
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

  if (matches.length === 0) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Serviço avulso não encontrado: "${looseName}"**\n\n` +
        `Nenhum serviço avulso do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_service_types\` para listar os serviços disponíveis e informe \`loose_service_id\` diretamente.`
      )
    };
  }

  if (matches.length > 1) {
    const lista = matches.map(m => `• ID ${m.item.id} — ${m.item.name}`).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em loose_service_name: "${looseName}"**\n\n` +
        `${matches.length} serviços avulsos encontrados. Informe \`loose_service_id\` diretamente:\n\n${lista}`
      )
    };
  }

  return { error: false, looseServiceId: matches[0].item.id };
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
 * @returns {Promise<{error: boolean, contractRiderId?: number, response?: object}>}
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

  if (matches.length === 0) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Contrato não encontrado: "${contractName}"**\n\n` +
        `Nenhum contrato do ticket #${ticketNumber} corresponde a esse nome.\n` +
        `Use \`get_ticket_service_types\` para listar os contratos disponíveis e informe \`contract_rider_id\` diretamente.`
      )
    };
  }

  if (matches.length > 1) {
    const lista = matches.map(m => `• contract_rider_id ${m.item.id} — ${m.item.contract && m.item.contract.name}`).join('\n');
    return {
      error: true,
      response: errorResponse(
        `**❌ Ambiguidade em contract_name: "${contractName}"**\n\n` +
        `${matches.length} contratos encontrados. Informe \`contract_rider_id\` diretamente:\n\n${lista}`
      )
    };
  }

  // Devolve o contract_rider_id (id do aditivo), nao o contract.id
  return { error: false, contractRiderId: matches[0].item.id };
}

module.exports = { resolveShiftName, resolveLooseServiceName, resolveContractName };

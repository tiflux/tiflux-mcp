/**
 * requestorResolver.js — Helper compartilhado para resolucao requestor_name -> requestor_id.
 *
 * Diferente de clientResolver e deskResolver: 0 matches NAO e erro fatal —
 * o caller pode querer criar um solicitante novo. Apenas N matches e erro
 * (precisa desambiguar).
 *
 * Cascata de resolucao (graceful degradation por permissao):
 *   1. GET /requestors (global) — funciona para admin / atendente com permissao global.
 *   2. Se 403 e houver clientId: GET /clients/{clientId}/requestors (escopado) —
 *      pode estar acessivel a atendentes com permissao naquele cliente.
 *   3. Se ainda 403 (ou sem clientId): NAO e erro — retorna requestorId: null para
 *      que o caller siga com requestor_name cru (a API resolve/cria o solicitante).
 *
 * Retorno:
 *   { error: false, requestorId: number, requestor: object }  — 1 match (ID resolvido)
 *   { error: false, requestorId: null }                       — 0 matches (fallback para caller)
 *   { error: true,  response: MCPResponse }                   — N matches ou erro de API
 *
 * O shape de `response` e identico ao que errorResponse() produz (com
 * isError: true — a resolucao e pre-condicao da operacao):
 *
 *   const resolved = await resolveRequestorName(api, requestor_name);
 *   if (resolved.error) return resolved.response;
 *   if (resolved.requestorId !== null) {
 *     // usar requestor_id
 *   } else {
 *     // fallback: usar requestor_name cru
 *   }
 */

const { errorResponse } = require('./errors');

/**
 * Resolve um nome de solicitante para requestor_id usando searchRequestors (GET /requestors).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} requestorName - nome (parcial ou exato) do solicitante
 * @param {number|string} [clientId] - cliente do ticket; habilita o fallback escopado em 403
 * @returns {Promise<{error: boolean, requestorId?: number|null, requestor?: object, response?: object}>}
 */
async function resolveRequestorName(api, requestorName, clientId) {
  let userSearchResponse = await api.searchRequestors({
    name: requestorName,
    limit: 10
  });

  // Fallback atendente: /requestors global e admin-only (403). Com clientId, tenta
  // a rota escopada por cliente (clientes ja vem filtrados pela permissao do atendente).
  if (userSearchResponse.status === 403 && clientId) {
    userSearchResponse = await api.searchClientRequestors(clientId, {
      name: requestorName,
      limit: 10
    });
  }

  // Sem permissao para resolver (403 mesmo apos fallback): NAO e erro fatal — o caller
  // segue com requestor_name cru e a API resolve/cria o solicitante no POST /tickets.
  if (userSearchResponse.status === 403) {
    return {
      error: false,
      requestorId: null
    };
  }

  if (userSearchResponse.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar solicitante "${requestorName}"**\n\n` +
        `**Erro:** ${userSearchResponse.error}\n\n` +
        `*Verifique se o nome esta correto ou use requestor_id diretamente.*`
      )
    };
  }

  const requestors = userSearchResponse.data || [];

  // 0 matches: NAO e erro — retorna requestorId: null para que o caller use requestor_name cru
  if (requestors.length === 0) {
    return {
      error: false,
      requestorId: null
    };
  }

  if (requestors.length > 1) {
    let requestorsList = '**Solicitantes encontrados:**\n';
    requestors.forEach((requestor, index) => {
      requestorsList += `${index + 1}. **ID:** ${requestor.id} | **Nome:** ${requestor.name} | **Email:** ${requestor.email || 'N/A'}\n`;
    });

    return {
      error: true,
      response: errorResponse(
        `**⚠️ Múltiplos solicitantes encontrados para "${requestorName}"**\n\n` +
        `${requestorsList}\n` +
        `*Use requestor_id específico ou seja mais específico no requestor_name.*`
      )
    };
  }

  return {
    error: false,
    requestorId: requestors[0].id,
    requestor: requestors[0]
  };
}

module.exports = { resolveRequestorName };

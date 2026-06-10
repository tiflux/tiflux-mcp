/**
 * requestorResolver.js — Helper compartilhado para resolucao requestor_name -> requestor_id.
 *
 * Diferente de clientResolver e deskResolver: 0 matches NAO e erro fatal —
 * o caller pode querer criar um solicitante novo. Apenas N matches e erro
 * (precisa desambiguar).
 *
 * Usa api.searchUsers({ name, type: 'client' }) — solicitante = users de type=client.
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
 * Resolve um nome de solicitante para requestor_id usando searchUsers com type=client.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} requestorName - nome (parcial ou exato) do solicitante
 * @returns {Promise<{error: boolean, requestorId?: number|null, requestor?: object, response?: object}>}
 */
async function resolveRequestorName(api, requestorName) {
  const userSearchResponse = await api.searchUsers({
    name: requestorName,
    type: 'client',
    limit: 10
  });

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

  const users = userSearchResponse.data || [];

  // 0 matches: NAO e erro — retorna requestorId: null para que o caller use requestor_name cru
  if (users.length === 0) {
    return {
      error: false,
      requestorId: null
    };
  }

  if (users.length > 1) {
    let usersList = '**Solicitantes encontrados:**\n';
    users.forEach((user, index) => {
      usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email || 'N/A'}\n`;
    });

    return {
      error: true,
      response: errorResponse(
        `**⚠️ Múltiplos solicitantes encontrados para "${requestorName}"**\n\n` +
        `${usersList}\n` +
        `*Use requestor_id específico ou seja mais específico no requestor_name.*`
      )
    };
  }

  return {
    error: false,
    requestorId: users[0].id,
    requestor: users[0]
  };
}

module.exports = { resolveRequestorName };

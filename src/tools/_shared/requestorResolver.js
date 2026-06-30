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
 * Miolo compartilhado da resolucao de solicitante (por nome OU por e-mail).
 *
 * Cascata: busca global GET /requestors → fallback escopado GET /clients/{id}/requestors
 * em 403 → 0/1/N matches. 0 matches NAO e erro fatal (retorna requestorId: null);
 * N matches e erro (precisa desambiguar).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} filter - { name } ou { email } — o filtro de busca repassado a API
 * @param {number|string} [clientId] - cliente do ticket; habilita o fallback escopado em 403
 * @param {{ term: string, label: string }} desc - termo e rotulo para mensagens de erro
 * @returns {Promise<{error: boolean, requestorId?: number|null, requestor?: object, response?: object}>}
 */
async function resolveRequestor(api, filter, clientId, desc) {
  const searchFilter = { ...filter, limit: 10 };

  let userSearchResponse = await api.searchRequestors(searchFilter);

  // Fallback atendente: /requestors global e admin-only (403). Com clientId, tenta
  // a rota escopada por cliente (clientes ja vem filtrados pela permissao do atendente).
  if (userSearchResponse.status === 403 && clientId) {
    userSearchResponse = await api.searchClientRequestors(clientId, searchFilter);
  }

  // Sem permissao para resolver (403 mesmo apos fallback): NAO e erro fatal — o caller
  // segue com o valor cru e a API resolve/cria o solicitante no POST /tickets.
  if (userSearchResponse.status === 403) {
    return { error: false, requestorId: null };
  }

  if (userSearchResponse.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar solicitante "${desc.term}"** (${desc.label})\n\n` +
        `**Erro:** ${userSearchResponse.error}\n\n` +
        `*Verifique o ${desc.label} informado ou use requestor_id diretamente.*`
      )
    };
  }

  let requestors = userSearchResponse.data || [];

  // Guard de correspondencia exata para e-mail: a API filtra e-mail como busca ampla
  // (mesma semantica de "nome"), entao um unico resultado pode ser substring — "a@b.com"
  // casando so com "aa@b.com". Vincular um ticket por substring ligaria ao solicitante
  // errado e suprimiria o e-mail correto do payload. Para e-mail, so aceitamos match
  // exato (case-insensitive); o restante cai no fluxo de 0-match (valor cru) ou
  // desambiguacao N-match. Match por nome continua parcial (intencional).
  if (filter.email) {
    const target = String(filter.email).trim().toLowerCase();
    requestors = requestors.filter(
      (r) => String(r.email || '').trim().toLowerCase() === target
    );
  }

  // 0 matches: NAO e erro — retorna requestorId: null para que o caller use o valor cru
  if (requestors.length === 0) {
    return { error: false, requestorId: null };
  }

  if (requestors.length > 1) {
    let requestorsList = '**Solicitantes encontrados:**\n';
    requestors.forEach((requestor, index) => {
      requestorsList += `${index + 1}. **ID:** ${requestor.id} | **Nome:** ${requestor.name} | **Email:** ${requestor.email || 'N/A'}\n`;
    });

    return {
      error: true,
      response: errorResponse(
        `**⚠️ Múltiplos solicitantes encontrados para "${desc.term}"** (${desc.label})\n\n` +
        `${requestorsList}\n` +
        `*Use requestor_id específico para desambiguar.*`
      )
    };
  }

  return {
    error: false,
    requestorId: requestors[0].id,
    requestor: requestors[0]
  };
}

/**
 * Resolve um nome de solicitante para requestor_id usando searchRequestors (GET /requestors).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} requestorName - nome (parcial ou exato) do solicitante
 * @param {number|string} [clientId] - cliente do ticket; habilita o fallback escopado em 403
 * @returns {Promise<{error: boolean, requestorId?: number|null, requestor?: object, response?: object}>}
 */
async function resolveRequestorName(api, requestorName, clientId) {
  return resolveRequestor(api, { name: requestorName }, clientId, { term: requestorName, label: 'nome' });
}

/**
 * Resolve um e-mail de solicitante para requestor_id usando searchRequestors (GET /requestors).
 * Mesma semantica de retorno de resolveRequestorName.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} requestorEmail - e-mail (exato) do solicitante
 * @param {number|string} [clientId] - cliente do ticket; habilita o fallback escopado em 403
 * @returns {Promise<{error: boolean, requestorId?: number|null, requestor?: object, response?: object}>}
 */
async function resolveRequestorEmail(api, requestorEmail, clientId) {
  return resolveRequestor(api, { email: requestorEmail }, clientId, { term: requestorEmail, label: 'e-mail' });
}

module.exports = { resolveRequestorName, resolveRequestorEmail };

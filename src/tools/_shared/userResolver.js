/**
 * userResolver.js — Helper compartilhado para resolucao responsible_name -> responsible_id.
 *
 * Encapsula o bloco duplicado nos slices createTicket, updateTicket e listTickets.
 *
 * Caminho PRIMARIO: api.searchTechnicalUsers() — GET /technical-users.
 * Nao exige permissao de gerenciamento de usuarios; funciona para admin e atendente comum.
 * Aceita scoping opcional por deskId/clientId para desambiguar via server-side.
 *
 * Caminho FALLBACK: api.smartSearchUsers() — acionado apenas se o primario retornar erro
 * inesperado (404/403), preservando compatibilidade com orgs onde /technical-users
 * ainda nao esteja habilitado.
 *
 * O branching 0/1/N/erro vive em entityResolver.js (compartilhado com deskResolver).
 *
 * Retorno:
 *   { error: false, userId: number, user: object }  — 1 usuario encontrado
 *   { error: true,  response: MCPResponse }          — 0, N ou erro de API
 *
 * O shape de `response` e identico ao que errorResponse() produz (com
 * isError: true — a resolucao e pre-condicao da operacao), entao os
 * slices podem simplesmente fazer:
 *
 *   const resolved = await resolveResponsibleName(api, responsible_name, { deskId, clientId });
 *   if (resolved.error) return resolved.response;
 *   finalResponsibleId = resolved.userId;
 */

const { resolveEntityByName } = require('./entityResolver');

/**
 * Resolve um nome de responsavel para responsible_id.
 *
 * Usa GET /technical-users como caminho primario (rapido, 1 round-trip, funciona
 * para admin e nao-admin). Fallback a smartSearchUsers apenas se primario retornar
 * erro inesperado (404 ou 403).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} name - nome (parcial ou exato) do responsavel
 * @param {object} [scope] - escopo opcional para desambiguacao server-side
 * @param {number} [scope.deskId] - ID da mesa (reduz resultados para atendentes da mesa)
 * @param {number} [scope.clientId] - ID do cliente (reduz resultados para atendentes do cliente)
 * @returns {Promise<{error: boolean, userId?: number, user?: object, response?: object}>}
 */
async function resolveResponsibleName(api, name, { deskId, clientId } = {}) {
  // Caminho primario: GET /technical-users (permissivo, sem admin)
  const primaryFilters = { name, limit: 10 };
  if (deskId != null) primaryFilters.desk_id = deskId;
  if (clientId != null) primaryFilters.client_id = clientId;

  const primaryResponse = await api.searchTechnicalUsers(primaryFilters);

  // Se primario retornou erro inesperado (404/403): acionar fallback
  const primaryFailed =
    primaryResponse.error &&
    (primaryResponse.status === 404 || primaryResponse.status === 403);

  let response;
  if (primaryFailed) {
    // Fallback: GET /users (admin) ou GET /technical-groups/{id}/users (nao-admin)
    response = await api.smartSearchUsers({
      name,
      active: true,
      type: 'attendant',
      limit: 10
    });
  } else {
    response = primaryResponse;
  }

  return resolveEntityByName(response, {
    idKey: 'userId',
    itemKey: 'user',
    idOf: (u) => u.id,
    searchError: (err) =>
      `**Erro ao buscar usuario "${name}"**\n\n` +
      `**Erro:** ${err}\n\n` +
      `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`,
    notFound: (resp) => {
      const truncatedNote = resp._truncated
        ? '\n\n*Nota: a busca foi limitada a um subconjunto de grupos. Tente usar responsible_id diretamente se o usuario nao aparecer.*'
        : '';
      return (
        `**Usuario "${name}" nao encontrado**\n\n` +
        `*Verifique se o nome esta correto ou use responsible_id diretamente.*` +
        truncatedNote
      );
    },
    multiple: (users) => {
      let usersList = '**Usuarios encontrados:**\n';
      users.forEach((user, index) => {
        usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
      });
      return (
        `**Multiplos usuarios encontrados para "${name}"**\n\n` +
        `${usersList}\n` +
        `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
      );
    }
  });
}

module.exports = { resolveResponsibleName };

/**
 * userResolver.js — Helper compartilhado para resolucao responsible_name -> responsible_id.
 *
 * Encapsula o bloco duplicado nos slices createTicket, updateTicket e listTickets.
 *
 * Usa api.smartSearchUsers() — tenta GET /users (admin); em 403, aciona fallback
 * via GET /technical-groups/{id}/users automaticamente.
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
 *   const resolved = await resolveResponsibleName(api, responsible_name);
 *   if (resolved.error) return resolved.response;
 *   finalResponsibleId = resolved.userId;
 */

const { resolveEntityByName } = require('./entityResolver');

/**
 * Resolve um nome de responsavel para responsible_id usando smartSearchUsers.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} name - nome (parcial ou exato) do responsavel
 * @returns {Promise<{error: boolean, userId?: number, user?: object, response?: object}>}
 */
async function resolveResponsibleName(api, name) {
  const response = await api.smartSearchUsers({
    name,
    active: true,
    type: 'attendant', // Apenas atendentes podem ser responsaveis
    limit: 10
  });

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

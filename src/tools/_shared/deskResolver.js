/**
 * deskResolver.js — Helper compartilhado para resolucao desk_name -> desk_id.
 *
 * Encapsula o bloco duplicado nos 5 slices (createTicket, updateTicket,
 * listTickets, searchStage, searchCatalogItem).
 *
 * Usa api.smartSearchDesks() — tenta busca direta; se 0 resultados,
 * aciona fallback fuzzy automaticamente.
 *
 * O branching 0/1/N/erro vive em entityResolver.js (compartilhado com userResolver).
 *
 * Retorno:
 *   { error: false, deskId: number, desk: object }  — 1 mesa encontrada
 *   { error: true,  response: MCPResponse }          — 0, N ou erro de API
 *
 * O shape de `response` e identico ao que errorResponse() produz (com
 * isError: true — a resolucao e pre-condicao da operacao), entao os
 * slices podem simplesmente fazer:
 *
 *   const resolved = await resolveDeskName(api, desk_name);
 *   if (resolved.error) return resolved.response;
 *   finalDeskId = resolved.deskId;
 */

const { resolveEntityByName } = require('./entityResolver');

/**
 * Resolve um nome de mesa para desk_id usando smartSearchDesks.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} deskName - nome (parcial ou exato) da mesa
 * @returns {Promise<{error: boolean, deskId?: number, desk?: object, response?: object}>}
 */
async function resolveDeskName(api, deskName) {
  const response = await api.smartSearchDesks(deskName);

  return resolveEntityByName(response, {
    idKey: 'deskId',
    itemKey: 'desk',
    idOf: (d) => d.id,
    searchError: (err) =>
      `**Erro ao buscar mesa "${deskName}"**\n\n` +
      `**Erro:** ${err}\n\n` +
      `*Verifique se o nome da mesa esta correto ou use desk_id diretamente.*`,
    notFound: () =>
      `**Mesa "${deskName}" nao encontrada**\n\n` +
      `*Verifique se o nome esta correto ou use desk_id diretamente.*`,
    multiple: (desks) => {
      let desksList = '**Mesas encontradas:**\n';
      desks.forEach((desk, index) => {
        desksList += `${index + 1}. **ID:** ${desk.id} | **Nome:** ${desk.name} | **Display:** ${desk.display_name}\n`;
      });
      return (
        `**Multiplas mesas encontradas para "${deskName}"**\n\n` +
        `${desksList}\n` +
        `*Use desk_id especifico ou seja mais especifico no desk_name.*`
      );
    }
  });
}

module.exports = { resolveDeskName };

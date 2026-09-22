/**
 * deskResolver.js — Helper compartilhado para resolucao desk_name -> desk_id.
 *
 * Encapsula o bloco duplicado nos 5 slices (createTicket, updateTicket,
 * listTickets, searchStage, searchCatalogItem).
 *
 * Usa smartSearchDesks(api, deskName) — tenta busca direta; se 0 resultados,
 * aciona fallback fuzzy automaticamente. Fica neste modulo (nao em
 * tiflux-api.js) por ser logica de negocio — busca direta GET /desks,
 * fallback paginado via listAllActiveDesks() + fuzzyMatchItems (guardrail
 * BE-003: tiflux-api.js e so transporte).
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
 * Busca mesas por nome com fallback fuzzy.
 *
 * 1. Tenta busca direta: GET /desks?active=true&name={deskName}
 * 2. Se retornar erro ou pelo menos 1 resultado → devolve como esta.
 * 3. Senao, pagina todas as mesas ativas via api.listAllActiveDesks() e aplica
 *    fuzzyMatchItems contra `name` + `display_name` de cada mesa.
 * 4. Se fuzzy encontrou matches → retorna apenas o grupo de maior score
 *    (top-score winners) como { data: items, status: 200 }.
 *    Senao → devolve o resultado vazio original da busca direta.
 *
 * So usa metodos de transporte de `api` (searchDesks, listAllActiveDesks).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} deskName - nome (parcial ou exato) da mesa
 */
async function smartSearchDesks(api, deskName) {
  const { fuzzyMatchItems } = require('./fuzzyMatch');

  const directResult = await api.searchDesks(deskName);

  // Propaga erro ou retorna direto se ha resultados
  if (directResult.error) return directResult;
  if (directResult.data && directResult.data.length > 0) return directResult;

  // Fallback: buscar TODAS as mesas ativas (paginado) e aplicar fuzzy matching
  const allDesksResult = await api.listAllActiveDesks();

  if (allDesksResult.error) return directResult; // se falhou, devolve o vazio original
  if (!allDesksResult.data || allDesksResult.data.length === 0) return directResult;

  const { matches } = fuzzyMatchItems(
    deskName,
    allDesksResult.data,
    (desk) => `${desk.name || ''} ${desk.display_name || ''}`.trim()
  );

  if (matches.length === 0) return directResult;

  // Devolver apenas o grupo de maior score (evita matches fracos / falsa disambiguacao)
  const topScore = matches[0].score;
  const winners = matches.filter(m => m.score === topScore);
  return { data: winners.map(m => m.item), status: 200 };
}

/**
 * Resolve um nome de mesa para desk_id usando smartSearchDesks.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} deskName - nome (parcial ou exato) da mesa
 * @returns {Promise<{error: boolean, deskId?: number, desk?: object, response?: object}>}
 */
async function resolveDeskName(api, deskName) {
  const response = await smartSearchDesks(api, deskName);

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

module.exports = { resolveDeskName, smartSearchDesks };

/**
 * catalogFilterResolver.js — Resolve catalog_query (texto livre) para lista de item IDs.
 *
 * Recebe um termo de busca, pagina o endpoint GET /desks/{id}/services-catalogs-items
 * com `name=<termo>` (match parcial server-side contra catalogo/area/item) e devolve
 * todos os item.id distintos encontrados.
 *
 * Paginacao: itera paginas de 200 itens ate receber uma pagina com menos de 200 itens.
 * Expansao grande: se itemIds.length > 150, seta `warning` mas envia todos (no silent caps).
 *
 * Retorno:
 *   { error: false, itemIds: number[], areasHit: string[], warning?: string }  — sucesso
 *   { error: true,  response: MCPResponse }                                    — erro de API
 */

const { errorResponse } = require('./errors');

const PAGE_SIZE = 200;
const LARGE_EXPANSION_THRESHOLD = 150;
const MAX_PAGES = 25; // teto de seguranca: 25 × 200 = 5.000 itens; evita loop infinito se a API repetir paginas cheias

/**
 * Resolve catalog_query para lista de item IDs via paginacao completa.
 *
 * @param {object} api       - instancia de TiFluxAPI
 * @param {number} deskId    - ID da mesa (obrigatorio para escopo)
 * @param {string} query     - termo de busca livre (casa catalog/area/item server-side)
 * @returns {Promise<{
 *   error: boolean,
 *   itemIds?: number[],
 *   areasHit?: string[],
 *   warning?: string,
 *   response?: object
 * }>}
 */
async function resolveCatalogItemIds(api, deskId, query) {
  const allItems = [];
  let offset = 1;

  while (offset <= MAX_PAGES) {
    const response = await api.searchCatalogItems(deskId, {
      name: query,
      limit: PAGE_SIZE,
      offset
    });

    if (response.error) {
      return {
        error: true,
        response: errorResponse(
          `**❌ Erro ao buscar itens de catálogo para "${query}"**\n\n` +
          `**Erro:** ${response.error}\n\n` +
          `*Verifique se a mesa existe e tem catálogos configurados.*`
        )
      };
    }

    const page = Array.isArray(response.data) ? response.data : [];
    allItems.push(...page);

    // Para quando a pagina vem menor que PAGE_SIZE (ultima pagina ou vazia)
    if (page.length < PAGE_SIZE) break;

    // Incrementa numero de pagina (offset e 1-based page number, conforme API /desks/{id}/services-catalogs-items)
    offset += 1;
  }

  // Coletar IDs e areas distintas
  const itemIds = [...new Set(allItems.map(item => item.id))];
  const areasHit = [...new Set(
    allItems
      .map(item => item.area?.name || item.area_name)
      .filter(Boolean)
  )];

  let warning;
  const hitMaxPages = offset > MAX_PAGES;
  if (hitMaxPages) {
    warning =
      `⚠️ A query "${query}" atingiu o limite de paginação (${MAX_PAGES} páginas × ${PAGE_SIZE} itens). ` +
      `${itemIds.length} itens foram incluídos — pode haver mais. ` +
      `Use services_catalogs_item_ids com IDs específicos para precisão.`;
  } else if (itemIds.length > LARGE_EXPANSION_THRESHOLD) {
    warning =
      `⚠️ A query "${query}" expandiu para ${itemIds.length} itens de catálogo — ` +
      `a consulta pode ser ampla. Todos os itens foram incluídos no filtro. ` +
      `Para maior precisão, use services_catalogs_item_ids com IDs específicos.`;
  }

  return { error: false, itemIds, areasHit, warning };
}

module.exports = { resolveCatalogItemIds };

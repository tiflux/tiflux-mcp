/**
 * cascadePreflight.js — contagem informativa de cascata para deletes de catalogo e area.
 *
 * ATENCAO — NAO e um gate. Apesar do nome "preflight", nada aqui bloqueia ou
 * aborta o DELETE: a contagem e coletada antes da chamada destrutiva apenas
 * porque depois dela os registros ja estao inativos e nao seriam mais contaveis.
 * O resultado alimenta somente a mensagem de sucesso (relatorio pos-fato).
 * Nao existe confirmacao/dry_run nas tools de delete deste modulo.
 *
 * Consulta a API antes do DELETE para informar ao usuario a contagem de
 * areas/itens que serao desativados em cascata (soft delete silencioso da API).
 *
 * Teto de paginacao: PREFLIGHT_AREA_LIMIT / PREFLIGHT_ITEM_LIMIT por consulta.
 * Se o real ultrapassar o teto, a mensagem diz "ao menos N" em vez de mentir.
 *
 * Em caso de erro da API na consulta, o delete AINDA prossegue — a mensagem
 * avisa que a contagem nao pode ser apurada (nao bloqueia).
 */

const PREFLIGHT_AREA_LIMIT = 100;
const PREFLIGHT_ITEM_LIMIT = 200;

/**
 * Conta os itens de uma area antes de deleta-la.
 *
 * O endpoint de itens e escopado pela area (nao pelo catalogo), entao o id do
 * catalogo nao participa da contagem — nao recebe-lo evita sugerir o contrario.
 *
 * @param {object} api
 * @param {number|string} areaId
 * @returns {{ itemCount: number, itemsCapped: boolean, error: boolean }}
 */
async function preflightArea(api, areaId) {
  try {
    const r = await api.listServicesCatalogItems(areaId, { limit: PREFLIGHT_ITEM_LIMIT, offset: 1 });
    if (r.error) return { itemCount: 0, itemsCapped: false, error: true };
    const items = r.data || [];
    const total = r.total != null ? r.total : null;
    const itemCount = total != null ? total : items.length;
    const itemsCapped = total == null && items.length >= PREFLIGHT_ITEM_LIMIT;
    return { itemCount, itemsCapped, error: false };
  } catch {
    return { itemCount: 0, itemsCapped: false, error: true };
  }
}

/**
 * Conta areas e itens de um catalogo antes de deleta-lo.
 *
 * @param {object} api
 * @param {number|string} catalogId
 * @returns {{ areaCount: number, areasCapped: boolean, itemCount: number, itemsCapped: boolean, error: boolean }}
 */
async function preflightCatalog(api, catalogId) {
  try {
    const areasResp = await api.listServicesCatalogAreas(catalogId, { limit: PREFLIGHT_AREA_LIMIT, offset: 1 });
    if (areasResp.error) return { areaCount: 0, areasCapped: false, itemCount: 0, itemsCapped: false, error: true };

    const areas = areasResp.data || [];
    const areasTotal = areasResp.total != null ? areasResp.total : null;
    const areaCount = areasTotal != null ? areasTotal : areas.length;
    const areasCapped = areasTotal == null && areas.length >= PREFLIGHT_AREA_LIMIT;

    if (areas.length === 0) {
      return { areaCount: 0, areasCapped: false, itemCount: 0, itemsCapped: false, error: false };
    }

    // Conta itens de cada area retornada (ate o teto), em paralelo:
    // sequencial custaria ate PREFLIGHT_AREA_LIMIT round-trips antes do DELETE.
    const perArea = await Promise.all(areas.map(area => preflightArea(api, area.id)));

    let totalItems = 0;
    let itemsCapped = false;
    for (const pf of perArea) {
      // erro em uma area nao bloqueia — conta 0 nessa area
      if (pf.error) continue;
      totalItems += pf.itemCount;
      if (pf.itemsCapped) itemsCapped = true;
    }

    return { areaCount, areasCapped, itemCount: totalItems, itemsCapped, error: false };
  } catch {
    return { areaCount: 0, areasCapped: false, itemCount: 0, itemsCapped: false, error: true };
  }
}

/**
 * Formata o bloco de cascata para o delete de catalogo.
 *
 * @param {{ areaCount, areasCapped, itemCount, itemsCapped, error }} preflight
 * @returns {string} texto Markdown (vazio se sem cascata ou erro)
 */
function formatCatalogCascade(preflight) {
  if (preflight.error) {
    return `\n*⚠️ Não foi possível apurar a contagem de áreas/itens afetados antes da remoção.*`;
  }
  if (preflight.areaCount === 0) return '';

  const areaLabel = preflight.areasCapped ? `ao menos ${preflight.areaCount}` : `${preflight.areaCount}`;
  const itemLabel = preflight.itemsCapped ? `ao menos ${preflight.itemCount}` : `${preflight.itemCount}`;

  let text = `\n**Cascata aplicada pela API:**\n`;
  text += `- ${areaLabel} área(s) desativada(s)\n`;
  text += `- ${itemLabel} item(ns) desativado(s)\n`;
  text += `\n*Atividades recorrentes que referenciam esses itens também foram desativadas.*`;
  return text;
}

/**
 * Formata o bloco de cascata para o delete de area.
 *
 * @param {{ itemCount, itemsCapped, error }} preflight
 * @returns {string}
 */
function formatAreaCascade(preflight) {
  if (preflight.error) {
    return `\n*⚠️ Não foi possível apurar a contagem de itens afetados antes da remoção.*`;
  }
  if (preflight.itemCount === 0) return '';

  const itemLabel = preflight.itemsCapped ? `ao menos ${preflight.itemCount}` : `${preflight.itemCount}`;
  return `\n**Cascata aplicada pela API:**\n- ${itemLabel} item(ns) desativado(s)`;
}

module.exports = { preflightCatalog, preflightArea, formatCatalogCascade, formatAreaCascade };

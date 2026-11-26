/**
 * Helper local do modulo entities: resolve nomes de mesa por ID e renderiza a
 * tabela de mesas vinculadas a um campo personalizado.
 *
 * Consumidores: get_entity e update_entity (2 slices — por isso fica aqui, nao
 * em _shared/).
 *
 * Estrategia de resolucao:
 *   1. Uma chamada `api.listAllActiveDesks()` → mapa id → nome.
 *   2. IDs fora do mapa (mesa inativa, ou falha da listagem) → `api.getDesk(id)`.
 *      404 = mesa inexistente/de outra organizacao (`unknownIds`).
 *      Em lotes de DESK_LOOKUP_CONCURRENCY e no maximo MAX_DESK_LOOKUPS por chamada
 *      (campo com centenas de mesas + listagem falhando nao vira rajada de GETs/429).
 *      Acima do teto, o ID nao e consultado: sai como "nome indisponivel".
 *      A ordem de `ids` define a prioridade — quem precisa ser validado vem primeiro.
 *   3. Qualquer outra falha nao derruba a tool: a linha sai `#<id> (nome indisponivel)`.
 */

const { appendWithinBudget, RESPONSE_ITEM_BUDGET } = require('../_shared/format');

const DESK_LOOKUP_CONCURRENCY = 5;
const MAX_DESK_LOOKUPS = 50;

function deskLabel(desk) {
  return desk?.display_name || desk?.name || null;
}

/**
 * @param {object} api - TiFluxAPI (usa listAllActiveDesks e getDesk)
 * @param {number[]} ids - IDs de mesa a resolver
 * @returns {Promise<{ names: Map<number, string>, unknownIds: number[] }>}
 *   `names` so contem os IDs resolvidos; `unknownIds` = getDesk respondeu 404.
 */
async function resolveDeskNames(api, ids) {
  const names = new Map();
  const unknownIds = [];
  const wanted = [...new Set((ids || []).map(Number))];
  if (wanted.length === 0) return { names, unknownIds };

  try {
    const response = await api.listAllActiveDesks();
    if (!response?.error) {
      const byId = new Map((response?.data || []).map(desk => [Number(desk.id), deskLabel(desk)]));
      for (const id of wanted) {
        if (byId.get(id)) names.set(id, byId.get(id));
      }
    }
  } catch {
    // segue para o fallback individual
  }

  const missing = wanted.filter(id => !names.has(id)).slice(0, MAX_DESK_LOOKUPS);
  for (let i = 0; i < missing.length; i += DESK_LOOKUP_CONCURRENCY) {
    const batch = missing.slice(i, i + DESK_LOOKUP_CONCURRENCY);
    await Promise.all(batch.map(async (id) => {
      try {
        const response = await api.getDesk(id);
        if (response?.error) {
          if (Number(response.status) === 404) unknownIds.push(id);
          return;
        }
        const label = deskLabel(response?.data);
        if (label) names.set(id, label);
      } catch {
        // nome indisponivel
      }
    }));
  }

  unknownIds.sort((a, b) => a - b);
  return { names, unknownIds };
}

function deskName(names, id) {
  return names.get(Number(id)) || `#${id} (nome indisponivel)`;
}

/**
 * Tabela `| ID | Mesa |` limitada ao RESPONSE_ITEM_BUDGET.
 *
 * @param {number[]} ids
 * @param {Map<number, string>} names
 * @returns {string}
 */
function renderDeskTable(ids, names) {
  const parts = ids.map(id => `| ${id} | ${deskName(names, id)} |\n`);
  const cutLine = `\n✂️ Tabela limitada por tamanho de resposta — ${ids.length} mesas vinculadas no total.\n`;
  const { text, shown, truncated } = appendWithinBudget(parts, { maxChars: RESPONSE_ITEM_BUDGET - cutLine.length });
  // A linha de corte padrao fala em offset/limit (paginacao), que nao existe aqui.
  const body = truncated ? parts.slice(0, shown).join('') + cutLine : text;
  return '| ID | Mesa |\n|---|---|\n' + body;
}

/**
 * Lista curta "Nome (#id), Nome (#id)" para as linhas de diff do update.
 */
function formatDeskList(ids, names) {
  return ids.map(id => (names.has(Number(id)) ? `${names.get(Number(id))} (#${id})` : `#${id}`)).join(', ');
}

module.exports = { DESK_LOOKUP_CONCURRENCY, MAX_DESK_LOOKUPS, resolveDeskNames, deskName, renderDeskTable, formatDeskList };

/**
 * Helpers de matemática/filtros compartilhados entre relatórios comparativos.
 *
 * Extraído de get_tickets_comparison, get_chats_feedback_report e
 * get_tickets_feedback_report (≥3 slices) — CLAUDE.md autoriza extrair para
 * `_shared/` quando há duplicação real. Antes, cada slice mantinha cópia
 * idêntica de capIds/calcDelta/formatDeltaStr.
 */

const MAX_FILTER_IDS = 15;

/**
 * Normaliza um CSV de IDs: dedup, trim, remove vazios e limita a MAX_FILTER_IDS.
 * @param {string} csv - lista de IDs separados por vírgula
 * @returns {string|null} CSV normalizado (máx. 15 ids) ou null se vazio
 */
function capIds(csv) {
  if (!csv) return null;
  const ids = [...new Set(String(csv).split(',').map(s => s.trim()).filter(Boolean))];
  return ids.slice(0, MAX_FILTER_IDS).join(',');
}

/**
 * Calcula Δ (absoluto) e Δ% (relativo, 1 decimal). Coage entradas via Number.
 * anterior=0 && atual>0 → deltaPercent = 'novo'
 * ambos 0 → deltaPercent = 0
 * @param {number|string} current - valor do período atual
 * @param {number|string} previous - valor do período de comparação
 * @returns {{delta:number, deltaPercent:number|'novo'}}
 */
function calcDelta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  const delta = c - p;
  let deltaPercent;
  if (p === 0 && c > 0) {
    deltaPercent = 'novo';
  } else if (p === 0) {
    deltaPercent = 0;
  } else {
    deltaPercent = Number(((delta / p) * 100).toFixed(1));
  }
  return { delta, deltaPercent };
}

/**
 * Formata delta + delta% como "+5 (+33.3%)" (ou "novo" quando aplicável).
 * @param {number} delta
 * @param {number|'novo'} deltaPercent
 * @returns {string}
 */
function formatDeltaStr(delta, deltaPercent) {
  const sign = delta >= 0 ? '+' : '';
  const pctStr = deltaPercent === 'novo' ? 'novo' : `${delta >= 0 ? '+' : ''}${deltaPercent}%`;
  return `${sign}${delta} (${pctStr})`;
}

module.exports = { MAX_FILTER_IDS, capIds, calcDelta, formatDeltaStr };

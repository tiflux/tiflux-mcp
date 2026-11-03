/**
 * Normalizacao de filtros de GET /tickets compartilhada por list_tickets e
 * get_tickets_comparison (Fase 1 da spec 2026-10-06-tickets-correcoes-auditoria).
 *
 * - capFilterIds: dedup + corte em 15 (contrato da API: "maximo 15 itens, sem
 *   duplicados"), com o total para o aviso de corte (H11).
 * - normalizeRequestorEmails: trim + toLowerCase por e-mail do CSV — o TiFlux grava
 *   requestor_email sempre em minusculas e a API compara exato (H13).
 * - clampListLimit: limit em 1..200 antes de montar filtros e paginacao (H12).
 * - resolveStageAcrossDesks: stage_name resolvido em CADA mesa, com a uniao dos ids
 *   (H2) e o match exato unico antes da substring (H48a).
 *
 * Nao e slice (nao exporta schema/execute): helper de dominio de tickets.
 */

const { errorResponse } = require('../_shared/errors');
const { matchByName } = require('../_shared/fuzzyMatch');

// Contrato de GET /tickets (Swagger): os filtros *_ids aceitam no maximo 15 IDs,
// sem duplicados (erro 42201 "cannot have more than 15 items").
const MAX_FILTER_IDS = 15;
const MAX_LIST_LIMIT = 200;

/** Dedup + cap 15 num CSV de IDs. Retorna { ids: string, capped: boolean, total: number }. */
function capFilterIds(csv) {
  const ids = [...new Set(String(csv).split(',').map(s => s.trim()).filter(Boolean))];
  return { ids: ids.slice(0, MAX_FILTER_IDS).join(','), capped: ids.length > MAX_FILTER_IDS, total: ids.length };
}

/**
 * Aplica capFilterIds a cada filtro de `values` ({ desk_ids: '1,2', ... }) e devolve
 * os valores normalizados + um aviso por filtro cortado. `labels` mapeia a chave para
 * o rotulo do aviso ("mesa", "cliente"...). Chaves vazias/ausentes passam intactas.
 */
function capIdFilters(values, labels) {
  const out = {};
  const warnings = [];
  for (const [key, raw] of Object.entries(values)) {
    if (!raw) { out[key] = raw; continue; }
    const { ids, capped, total } = capFilterIds(raw);
    out[key] = ids;
    if (capped) {
      warnings.push(
        `O filtro de ${labels[key] || key} (\`${key}\`) recebeu ${total} IDs, mas a API /tickets aceita no máximo ${MAX_FILTER_IDS} — ` +
        `apenas os primeiros ${MAX_FILTER_IDS} foram aplicados. O resultado pode estar incompleto.`
      );
    }
  }
  return { values: out, warnings };
}

/** ' A@X.com , b@y.com ' → 'a@x.com,b@y.com'. Vazio/ausente → o proprio valor. */
function normalizeRequestorEmails(csv) {
  if (!csv || typeof csv !== 'string') return csv;
  const emails = csv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return emails.length > 0 ? emails.join(',') : undefined;
}

/** limit informado → inteiro em 1..200; ausente/invalido → undefined (padrao da API). */
function clampListLimit(limit) {
  if (limit === undefined || limit === null || limit === '') return undefined;
  const n = Number.parseInt(limit, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, 1), MAX_LIST_LIMIT);
}

function stageFetchError(deskId, error) {
  return errorResponse(
    `**❌ Erro ao buscar estágios da mesa "${deskId}"**\n\n` +
    `**Erro:** ${error}\n\n` +
    `*Verifique se a mesa existe e tem estágios configurados.*`
  );
}

function ambiguousStageError(stageName, deskLabel, matching) {
  const list = matching.map((s, i) => `${i + 1}. **ID:** ${s.id} | **Nome:** ${s.name}`).join('\n');
  return errorResponse(
    `**⚠️ Múltiplos estágios encontrados para "${stageName}" na mesa "${deskLabel}"**\n\n` +
    `**Estágios encontrados:**\n${list}\n\n` +
    `*Use stage_ids específico ou seja mais específico no stage_name.*`
  );
}

function stageNotFoundError(stageName, perDesk) {
  const blocks = perDesk.map(({ deskLabel, stages }) => {
    const names = stages.length > 0 ? stages.map(s => `• ${s.name}`).join('\n') : '(nenhum estágio configurado)';
    return `**Mesa "${deskLabel}":**\n${names}`;
  }).join('\n\n');
  const where = perDesk.length === 1 ? `na mesa "${perDesk[0].deskLabel}"` : `em nenhuma das ${perDesk.length} mesas`;
  return errorResponse(
    `**❌ Estágio "${stageName}" não encontrado ${where}**\n\n` +
    `**Estágios disponíveis:**\n${blocks}\n\n` +
    `*Use stage_ids diretamente ou ajuste o stage_name.*`
  );
}

/**
 * Resolve `stageName` em cada mesa de `deskIds` (GET /desks/{id}/stages, limit 200).
 * Por mesa: exato unico (normalizado) vence a substring; varios candidatos → erro de
 * ambiguidade; nenhum → a mesa entra no aviso. Devolve:
 *   { stageIds: '1,2', warnings: [...] } ou { error: <resposta MCP> }.
 * `deskLabelOf(id)` permite exibir o nome resolvido (desk_name) em vez do id.
 */
async function resolveStageAcrossDesks(api, deskIds, stageName, deskLabelOf = id => String(id)) {
  const responses = await Promise.all(
    deskIds.map(id => api.searchStages(Number.parseInt(id, 10), { limit: MAX_LIST_LIMIT }))
  );

  const stageIds = [];
  const missing = [];
  for (let i = 0; i < deskIds.length; i++) {
    const deskId = deskIds[i];
    const response = responses[i];
    if (response.error) return { error: stageFetchError(deskLabelOf(deskId), response.error) };
    const stages = response.data || [];
    const matching = matchByName(stages, stageName, s => s.name || '');
    if (matching.length > 1) return { error: ambiguousStageError(stageName, deskLabelOf(deskId), matching) };
    if (matching.length === 0) {
      missing.push({ deskLabel: deskLabelOf(deskId), stages });
      continue;
    }
    stageIds.push(String(matching[0].id));
  }

  if (stageIds.length === 0) return { error: stageNotFoundError(stageName, missing) };

  const warnings = missing.map(({ deskLabel }) =>
    `O estágio "${stageName}" não existe na mesa "${deskLabel}": os tickets dessa mesa foram excluídos do resultado (a mesa não tem esse estágio).`
  );
  return { stageIds: [...new Set(stageIds)].join(','), warnings };
}

module.exports = {
  MAX_FILTER_IDS,
  MAX_LIST_LIMIT,
  capFilterIds,
  capIdFilters,
  normalizeRequestorEmails,
  clampListLimit,
  resolveStageAcrossDesks
};

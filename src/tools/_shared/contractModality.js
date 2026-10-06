/**
 * contractModality.js — traducao PT-BR de modalidade, periodicidade e cobranca
 * de contrato.
 *
 * A API devolve varios desses campos ja humanizados, mas em ingles e com duas
 * convencoes de caixa diferentes conforme o endpoint:
 *   - GET /contracts, GET /contracts/{id} e GET /contract-types mandam a
 *     modalidade capitalizada ("Hours", "Shared", "Saas/Product"...).
 *   - GET /contracts/{id}/usage manda a modalidade em snake_case minusculo
 *     ("hours", "shared", "recurrent"...) — chaves DIFERENTES, nao e so
 *     lowercase da mesma string (ex: "Saas/Product" vira "recurrent", nao
 *     "saas/product"; "Per ticket" vira "per_ticket").
 * As duas convencoes convivem no mesmo MODALITY_LABELS (chaves distintas,
 * sem colisao) para que list_contracts/get_contract/list_contract_types e
 * get_contract_usage compartilhem a mesma funcao modalityLabel().
 *
 * Decisao registrada na spec 2026-10-05-contratos-consumo-e-auditoria (B2):
 * os rotulos Free->Livre e Per ticket->Por atendimento (alinhados ao portal)
 * ficaram como decisao em aberto, nao confirmada no ciclo de /implement —
 * mantidos Gratuito/Por ticket por retrocompatibilidade (ver Itens Descobertos
 * na Validacao do checklist.md da spec).
 */

// Traducoes PT-BR sem default silencioso: valor desconhecido cai no valor cru da API.
const MODALITY_LABELS = {
  Free: 'Gratuito',
  Credit: 'Crédito',
  Shared: 'Compartilhado',
  Hours: 'Horas',
  'Saas/Product': 'SaaS/Produto',
  'Per ticket': 'Por ticket',
  'Cumulative Hours': 'Horas cumulativas',
  // snake_case — GET /contracts/{id}/usage (get_contract_usage)
  free: 'Gratuito',
  credit: 'Crédito',
  shared: 'Compartilhado',
  hours: 'Horas',
  recurrent: 'SaaS/Produto',
  per_ticket: 'Por ticket',
  cumulative_hours: 'Horas cumulativas'
};

// Vazio/ausente vira '—' (o blueprint Rails tem `rescue ""` quando a traducao falta).
function modalityLabel(raw) {
  return MODALITY_LABELS[raw] || raw || '—';
}

// `period_name`/`closing_period_name` do aditivo (get_contract) e `billing_name`:
// a API fixa o locale em `en`. Valor desconhecido cai no texto cru (mesma regra
// de modalityLabel).
const PERIOD_LABELS = {
  Monthly: 'Mensal',
  Bimonthly: 'Bimestral',
  Quarterly: 'Trimestral',
  Biannual: 'Semestral',
  Annual: 'Anual'
};

function periodLabel(raw) {
  return PERIOD_LABELS[raw] || raw || '—';
}

const BILLING_LABELS = {
  Antecipated: 'Antecipada',
  Postdate: 'Postecipada'
};

function billingLabel(raw) {
  return BILLING_LABELS[raw] || raw || '—';
}

// `closing_period` de get_contract_usage vem em MESES (numero), nao no nome em
// ingles de period_name — mapa irmao de PERIOD_LABELS, chaveado por numero.
// Desconhecido cai em "N meses" (nunca "—": o numero cru ainda informa algo).
const CLOSING_PERIOD_MONTHS_LABELS = {
  1: 'Mensal',
  2: 'Bimestral',
  3: 'Trimestral',
  6: 'Semestral',
  12: 'Anual'
};

function closingPeriodLabel(months) {
  // Ausente (null/undefined) vira "—" — nunca "null meses"/"undefined meses".
  if (months === null || months === undefined) return '—';
  return CLOSING_PERIOD_MONTHS_LABELS[months] || `${months} meses`;
}

module.exports = {
  MODALITY_LABELS, modalityLabel,
  PERIOD_LABELS, periodLabel,
  BILLING_LABELS, billingLabel,
  CLOSING_PERIOD_MONTHS_LABELS, closingPeriodLabel
};

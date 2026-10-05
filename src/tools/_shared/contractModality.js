/**
 * contractModality.js — traducao PT-BR da modalidade de tipo de contrato.
 *
 * A API devolve a modalidade ja humanizada, mas em ingles ("Hours", "Shared",
 * "Saas/Product"...) em GET /contracts, GET /contracts/{id} e GET /contract-types.
 * Usado por list_contracts, get_contract e list_contract_types para exibirem
 * o mesmo rotulo.
 */

// Traducoes PT-BR sem default silencioso: valor desconhecido cai no valor cru da API.
const MODALITY_LABELS = {
  Free: 'Gratuito',
  Credit: 'Crédito',
  Shared: 'Compartilhado',
  Hours: 'Horas',
  'Saas/Product': 'SaaS/Produto',
  'Per ticket': 'Por ticket',
  'Cumulative Hours': 'Horas cumulativas'
};

// Vazio/ausente vira '—' (o blueprint Rails tem `rescue ""` quando a traducao falta).
function modalityLabel(raw) {
  return MODALITY_LABELS[raw] || raw || '—';
}

module.exports = { MODALITY_LABELS, modalityLabel };

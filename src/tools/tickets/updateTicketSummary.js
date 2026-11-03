/**
 * Resumo de sucesso do slice `update_ticket`.
 *
 * Duas partes:
 *  - "Alterações realizadas": o que foi enviado (a partir do plano montado pelo slice);
 *  - "Estado final": o que a API devolveu (response.data, view :show) — H18. Um campo
 *    enviado que voltou PRESENTE e DIFERENTE vira aviso "a API nao aplicou"; campo
 *    ausente na resposta nao gera aviso (o corpo pode vir parcial).
 */

const { dateTime } = require('../_shared/format');

const label = (name, id) => (name ? `${name} (ID ${id})` : `ID ${id}`);
const has = (v) => v !== undefined;

// ---- "Alterações realizadas" (input) -------------------------------------------------

function responsibleLine(responsible) {
  if (responsible === null) return '• Responsável: Removido (não atribuído)';
  return `• Responsável: ${label(responsible.name, responsible.id)}`;
}

function followersLine(followers) {
  if (followers === '') return '• Seguidores: todos removidos';
  return `• Seguidores (lista substituída): ${followers}`;
}

function referenceLine(ref) {
  if (ref === null) return '• Ticket pai: desvinculado';
  return `• Ticket pai: #${ref}`;
}

/** Cada regra: [aplica?, linha]. Linhas so sao calculadas quando a regra aplica. */
function changesRules(p) {
  return [
    [has(p.title), () => `• Título: ${p.title}`],
    [typeof p.description === 'string', () => `• Descrição: ${p.description.substring(0, 50)}...`],
    [p.isTransfer && p.desk, () => `• Mesa transferida: ${label(p.desk.name, p.desk.id)}`],
    [p.isTransfer && p.autoStage, () => `• Estágio auto-resolvido: ${label(p.autoStage.name, p.autoStage.id)} (1º estágio da mesa-destino)`],
    [p.stage && !p.autoStage, () => `• Estágio: ${label(p.stage.name, p.stage.id)}`],
    [p.priority, () => `• Prioridade: ${label(p.priority.name, p.priority.id)}`],
    [has(p.priorityReason), () => `• Motivo da mudança de prioridade: ${p.priorityReason}`],
    [p.priorityReasonDropped, () => '• ⚠️ priority_change_reason ignorado: a API v2 não permite motivo de mudança de prioridade durante transferência de mesa'],
    [has(p.statusId), () => `• Status ID: ${p.statusId}`],
    [has(p.responsible), () => responsibleLine(p.responsible)],
    [p.requestor, () => `• Solicitante: ${label(p.requestor.name, p.requestor.id)}`],
    [has(p.followers), () => followersLine(p.followers)],
    [p.catalog, () => `• Item de Catálogo: ${label(p.catalog.name, p.catalog.id)}`],
    [has(p.stopped), () => `• SLA: ${p.stopped ? 'pausado' : 'retomado'}`],
    [has(p.stopAnswer), () => `• Motivo da pausa: ${p.stopAnswer}`],
    [p.stopAnswerDropped, () => '• ⚠️ stop_answer não enviado: a API não aceita motivo na retomada do SLA'],
    [has(p.ticketReference), () => referenceLine(p.ticketReference)],
    [p.clientIdIgnored, () => '• ⚠️ client_id ignorado: trocar o cliente do ticket não é possível pela API (use a interface do TiFlux); ele só serve de dica para achar o solicitante por nome (requestor_name)']
  ];
}

function changesLines(p) {
  return changesRules(p).filter(([applies]) => applies).map(([, line]) => line());
}

// ---- "Estado final" (response.data) ---------------------------------------------------

// [chave da resposta, rotulo, chave do id enviado no PUT]
const REF_FIELDS = [
  ['desk', 'Mesa', 'desk_id'],
  ['stage', 'Estágio', 'stage_id'],
  ['status', 'Status', 'status_id'],
  ['priority', 'Prioridade', 'priority_id'],
  ['responsible', 'Responsável', 'responsible_id'],
  ['requestor', 'Solicitante', 'requestor_id']
];

function refDisplay(value) {
  if (!value || typeof value !== 'object') return '—';
  const name = value.name || value.display_name || null;
  const hasId = value.id !== undefined && value.id !== null;
  if (name && hasId) return label(name, value.id);
  if (hasId) return `ID ${value.id}`;
  return name || '—';
}

/** Aviso quando o id enviado difere do que a API devolveu (ou voltou vazio). */
function notAppliedWarning(title, sentId, value) {
  if (sentId === undefined || sentId === null) return null;
  const returnedId = value && typeof value === 'object' ? value.id : null;
  if (String(returnedId) === String(sentId)) return null;
  const current = returnedId === null || returnedId === undefined ? 'vazio' : `ID ${returnedId}`;
  return `⚠️ a API não aplicou ${title.toLowerCase()} (enviado ID ${sentId}, atual ${current})`;
}

function finalStateLines(data, sent) {
  const state = [];
  const warnings = [];
  if (!data || typeof data !== 'object') return { state, warnings };

  for (const [key, title, sentKey] of REF_FIELDS) {
    if (!(key in data)) continue;
    state.push(`• ${title}: ${refDisplay(data[key])}`);
    const warning = notAppliedWarning(title, sent[sentKey], data[key]);
    if (warning) warnings.push(warning);
  }

  if (sent.responsible_id === null && data.responsible) {
    warnings.push('⚠️ a API não aplicou responsável (pedido para remover, mas o ticket continua com responsável)');
  }
  if (data.services_catalog && typeof data.services_catalog === 'object') {
    const { item_name: itemName, id: itemId } = data.services_catalog;
    state.push(`• Item de catálogo: ${itemName || 'ID ' + itemId}`);
  }
  slaAndTitleLines(data, sent, state, warnings);
  return { state, warnings };
}

/** SLA pausado/em andamento (quando a resposta traz `stopped`) e aviso de titulo nao aplicado. */
function slaAndTitleLines(data, sent, state, warnings) {
  if (typeof data.stopped === 'boolean') {
    state.push(`• SLA: ${data.stopped ? 'pausado' : 'em andamento'}`);
    if (typeof sent.stopped === 'boolean' && data.stopped !== sent.stopped) {
      warnings.push(`⚠️ a API não aplicou ${sent.stopped ? 'a pausa' : 'a retomada'} do SLA`);
    }
  }
  if (has(sent.title) && typeof data.title === 'string' && data.title !== sent.title) {
    warnings.push('⚠️ a API não aplicou título');
  }
}

/** Aviso H19: transferencia sem priority/catalogo/status explicitos volta ao padrao da mesa-destino. */
function transferDefaultsWarning(p, sent) {
  if (!p.isTransfer) return null;
  const missing = [];
  if (sent.priority_id === undefined) missing.push('prioridade');
  if (sent.services_catalogs_item_id === undefined) missing.push('item de catálogo');
  if (sent.status_id === undefined) missing.push('status');
  if (missing.length === 0) return null;
  if (missing.length === 1) {
    return `⚠️ Na transferência de mesa, ${missing[0]} volta ao padrão da mesa de destino quando não informado.`;
  }
  const list = `${missing.slice(0, -1).join(', ')} e ${missing.at(-1)}`;
  return `⚠️ Na transferência de mesa, ${list} voltam ao padrão da mesa de destino quando não informados.`;
}

/**
 * Monta o texto de sucesso.
 * @param {string} ticketNumber
 * @param {object} p    plano (valores/nomes resolvidos)
 * @param {object} sent updateData enviado a API
 * @param {object|null} data response.data
 */
function buildSuccessText(ticketNumber, plan, sent, data) {
  // Mesa transferida: nome real devolvido pela API, em vez do texto digitado ou "ID n".
  const p = plan.isTransfer && plan.desk && data?.desk?.name && String(data.desk.id) === String(plan.desk.id)
    ? { ...plan, desk: { ...plan.desk, name: data.desk.name } }
    : plan;
  const { state, warnings } = finalStateLines(data, sent);
  const defaults = transferDefaultsWarning(p, sent);
  if (defaults) warnings.push(defaults);

  const sections = [
    `**✅ Ticket #${ticketNumber} atualizado com sucesso!**`,
    `**Alterações realizadas:**\n${changesLines(p).join('\n')}`
  ];
  if (state.length > 0) sections.push(`**Estado final do ticket:**\n${state.join('\n')}`);
  if (warnings.length > 0) sections.push(warnings.join('\n'));
  if (data?.updated_at) sections.push(`**Atualizado em:** ${dateTime(data.updated_at)}`);
  sections.push('*✅ Ticket atualizado via API TiFlux*');
  return sections.join('\n\n');
}

module.exports = { buildSuccessText };

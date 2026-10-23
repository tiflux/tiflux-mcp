/**
 * Slice: get_contract_history — historico de aditivos de um contrato ou de um
 * grupo de contrato.
 *
 * Endpoints: GET /contracts/{id}/histories (via api.getContractHistories) ou
 * GET /contract-groups/{id}/histories (via api.getContractGroupHistories).
 * Exatamente um de `contract_id` / `contract_group_id` (o `kind` de
 * list_contracts diz qual usar).
 *
 * Por que existe: get_contract/get_contract_group/list_contracts so recebem o
 * ULTIMO aditivo. O historico grava, a cada evento de aditivo, numero, versao,
 * inicio e valor — e a unica fonte do valor de aditivos anteriores.
 *
 * A tool pagina tudo (limit 200, ate MAX_PAGES paginas) para o resumo por
 * aditivo sair completo. O resumo e apresentacao dos eventos da API, nao regra
 * de dominio (BE-003): percorre os eventos em ordem cronologica agrupados por
 * `rider_number` + `release`; status 0/1/3/4 gravam o snapshot mais recente,
 * status 2 marca o aditivo como excluido, e um evento posterior com o mesmo
 * numero reabre o aditivo (o numero pode ser reusado).
 *
 * Enum de `status` (nao documentado por completo na Swagger): 0 aditivo
 * criado, 1 aditivo alterado, 2 aditivo excluido (sem valor), 3 contrato
 * criado, 4 aditivo editado (edicao via API). Desconhecido → "Status N".
 *
 * O historico NAO traz fim de vigencia, duracao nem campos da modalidade — a
 * tool nao infere nada disso; o rodape aponta get_contract/get_contract_group.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse, extractApiErrorCode, errorResponse } = require('../_shared/errors');
const { footer, currencyBRL, truncate, appendWithinBudget, dateTime, RESPONSE_ITEM_BUDGET } = require('../_shared/format');
const { parseIntStrict } = require('../_shared/validators');
const { escapeCell } = require('../_shared/markdown');
const {
  contractsLicenseErrorResponse, contractApiErrorResponse, contractsAccessDeniedResponse,
  requirePositiveIdField, discountCell, contractNotFoundHint, GROUP_NOT_FOUND_HINT
} = require('../_shared/contractShared');

const PAGE_SIZE = 200;
const MAX_PAGES = 5;
const EVENTS_LIMIT_DEFAULT = 20;
const EVENTS_LIMIT_MIN = 1;
const EVENTS_LIMIT_MAX = 200;
const DESCRIPTION_MAX = 300;
// Teto proprio do resumo "Aditivos registrados": com centenas de aditivos a
// tabela sozinha estouraria RESPONSE_ITEM_BUDGET e a linha do tempo sumiria.
const SUMMARY_BUDGET = 15000;

const STATUS_LABELS = {
  0: 'Aditivo criado',
  1: 'Aditivo alterado',
  2: 'Aditivo excluído',
  3: 'Contrato criado',
  4: 'Aditivo editado'
};
const SNAPSHOT_STATUSES = new Set([0, 1, 3, 4]);
const DELETED_STATUS = 2;

// `discount_type` no historico e numerico (enum do model: 0 currency, 1 percentage).
const DISCOUNT_TYPES = { 0: 'currency', 1: 'percentage' };

const schema = {
  name: 'get_contract_history',
  description: 'Buscar o histórico de aditivos de um contrato individual (contract_id) OU de um grupo de contrato (contract_group_id) — informe exatamente um dos dois (o campo "· grupo" de list_contracts indica qual). Use quando precisar do valor ou do início de aditivos ANTERIORES ao atual (get_contract/get_contract_group só trazem o último aditivo). A tool lê todo o histórico (até 1000 eventos mais recentes) e devolve: (1) resumo "Aditivos registrados" — uma linha por número/versão de aditivo com início, valor, desconto, situação (registrado ou excluído; um número reusado depois de excluído volta a "registrado") e data/autor do último evento — com teto próprio: com centenas de aditivos, os de maior número/versão ficam de fora com aviso "+N aditivos não exibidos no resumo"; (2) linha do tempo "Eventos", do mais recente para o mais antigo, com data, tipo (Aditivo criado, Aditivo alterado, Aditivo excluído, Contrato criado, Aditivo editado), número/versão, início, valor, descrição e autor, limitada por events_limit. Ressalvas: o histórico não traz fim de vigência, duração nem franquia/hora excedente dos aditivos (para o aditivo atual use get_contract ou get_contract_group); eventos gravados pela API têm o prefixo "[API] " na descrição; aditivos anteriores ao início do registro de histórico podem não ter evento; sem a permissão "Visualizar valores dos tickets" os valores vêm "--". Um contrato que é MEMBRO de grupo responde 404 com contract_id — use contract_group_id. Requer permissão "Visualizar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: {
        type: 'number',
        description: 'ID do contrato individual (linha de list_contracts sem "· grupo"). Inteiro positivo. Informe este OU contract_group_id.'
      },
      contract_group_id: {
        type: 'number',
        description: 'ID do grupo de contrato (linha "· grupo" de list_contracts). Inteiro positivo. Informe este OU contract_id.'
      },
      events_limit: {
        type: 'number',
        description: 'Quantos eventos mostrar na linha do tempo (1-200, padrão 20; acima de 200 é corrigido para 200). Não afeta o resumo de aditivos, que considera todos os eventos lidos.'
      }
    },
    required: []
  }
};

function resolveTarget(args) {
  const hasContract = args.contract_id !== undefined && args.contract_id !== null;
  const hasGroup = args.contract_group_id !== undefined && args.contract_group_id !== null;
  if (hasContract === hasGroup) {
    throw new Error('Informe exatamente um entre contract_id e contract_group_id');
  }
  if (hasContract) {
    const id = requirePositiveIdField(args, 'contract_id');
    return { id, isGroup: false, label: `contrato #${id}`, method: 'getContractHistories' };
  }
  const id = requirePositiveIdField(args, 'contract_group_id');
  return { id, isGroup: true, label: `grupo de contrato #${id}`, method: 'getContractGroupHistories' };
}

function resolveEventsLimit(value) {
  if (value === undefined || value === null) return EVENTS_LIMIT_DEFAULT;
  const n = parseIntStrict(value, 'events_limit');
  if (n < EVENTS_LIMIT_MIN) throw new Error('events_limit deve ser um número inteiro entre 1 e 200');
  return Math.min(n, EVENTS_LIMIT_MAX);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || `Status ${status ?? '—'}`;
}

function historyDiscount(ev) {
  const type = DISCOUNT_TYPES[ev.discount_type] ?? ev.discount_type;
  return discountCell(type, ev.discount_value);
}

/** Ordem cronologica crescente (created_at, depois id) — a API devolve decrescente. */
function chronological(a, b) {
  const ta = new Date(a.created_at).getTime() || 0;
  const tb = new Date(b.created_at).getTime() || 0;
  if (ta !== tb) return ta - tb;
  return (a.id || 0) - (b.id || 0);
}

/**
 * Resumo por aditivo (`rider_number` + `release`), seguindo os eventos em
 * ordem cronologica. Ordenado por numero e versao.
 */
function summarizeRiders(events) {
  const riders = new Map();
  for (const ev of [...events].sort(chronological)) {
    if (ev.rider_number === null || ev.rider_number === undefined) continue;
    const key = `${ev.rider_number}|${ev.release ?? 0}`;
    const entry = riders.get(key) || { rider_number: ev.rider_number, release: ev.release ?? 0, snapshot: null, excluded: false };
    if (SNAPSHOT_STATUSES.has(ev.status)) {
      entry.snapshot = ev;
      entry.excluded = false;
    } else if (ev.status === DELETED_STATUS) {
      entry.excluded = true;
    }
    entry.lastEvent = ev;
    riders.set(key, entry);
  }
  return [...riders.values()].sort((a, b) => (a.rider_number - b.rider_number) || (a.release - b.release));
}

function riderValue(entry) {
  const value = entry.snapshot?.value;
  return value === null || value === undefined ? '—' : currencyBRL(value);
}

function summaryRowRich(entry) {
  const snap = entry.snapshot || {};
  const situacao = entry.excluded ? 'excluído' : 'registrado';
  const last = entry.lastEvent;
  const author = escapeCell(last.updated_by?.name?.trim() || '—');
  const discount = entry.snapshot ? historyDiscount(snap) : '—';
  return `| ${entry.rider_number} | ${entry.release} | ${escapeCell(snap.start_date || '—')} | ${riderValue(entry)} | ${discount} | ${situacao} | ${dateTime(last.created_at)} | ${author} |\n`;
}

function summaryRowCompact(entry) {
  const situacao = entry.excluded ? 'excluído' : 'registrado';
  return `nº ${entry.rider_number} v${entry.release} · ${entry.snapshot?.start_date || '—'} · ${riderValue(entry)} · ${situacao}\n`;
}

function eventLine(ev) {
  const parts = [`${dateTime(ev.created_at)} · **${statusLabel(ev.status)}**`];
  if (ev.rider_number !== null && ev.rider_number !== undefined) parts.push(`nº ${ev.rider_number} v${ev.release ?? 0}`);
  if (ev.start_date) parts.push(`início ${ev.start_date}`);
  if (ev.value !== null && ev.value !== undefined) parts.push(`valor ${currencyBRL(ev.value)}`);
  if (ev.discount_value !== null && ev.discount_value !== undefined) parts.push(`desconto ${historyDiscount(ev)}`);
  if (ev.description) parts.push(truncate(ev.description, DESCRIPTION_MAX));
  const author = ev.updated_by?.name?.trim();
  if (author) parts.push(`por ${author}`);
  return `- ${parts.join(' · ')}\n`;
}

const CAVEATS =
  '> ℹ️ *O histórico é uma trilha de eventos, não o cadastro: não traz fim de vigência, duração nem campos da ' +
  'modalidade (franquia, hora excedente) — para o aditivo atual use `get_contract` (ou `get_contract_group`). ' +
  'Eventos gravados pela API têm o prefixo "[API] " na descrição. Aditivos anteriores ao início do registro de ' +
  'histórico podem não ter evento. Sem a permissão "Visualizar valores dos tickets", os valores vêm "--".*\n';

function scanNotice({ total, read, maybeTruncated }) {
  if (total === undefined) {
    if (!maybeTruncated) return '';
    return `\n> ⚠️ *Leitura interrompida no limite de ${read} eventos (a API não informou o total): o histórico pode ter ` +
      'mais eventos e o resumo considera só os mais recentes.*\n';
  }
  if (total <= read) return '';
  return `\n> ⚠️ *O histórico tem ${total} eventos; o resumo considera os ${read} eventos mais recentes.*\n`;
}

/** Linhas do resumo dentro de SUMMARY_BUDGET + aviso dos aditivos omitidos (os de maior número/versão). */
function summaryRowsWithinBudget(riders, renderRow) {
  const rows = riders.map(renderRow);
  const { shown } = appendWithinBudget(rows, { maxChars: SUMMARY_BUDGET });
  const omitted = rows.length - shown;
  const notice = omitted > 0
    ? `\n_+${omitted} aditivos não exibidos no resumo (os de maior número/versão) — os eventos mais recentes deles ` +
      'aparecem na linha do tempo (events_limit até 200); para o aditivo atual use get_contract ou get_contract_group._\n'
    : '';
  return `${rows.slice(0, shown).join('')}${notice}`;
}

function omittedReason(cutByBudget) {
  return cutByBudget
    ? 'resposta limitada pelo tamanho; reduza events_limit'
    : 'aumente events_limit (até 200) para ver mais';
}

/**
 * @param {{ events: object[], total?: number, maybeTruncated?: boolean }} history
 * @param {{ label: string, eventsLimit?: number }} opts
 * @param {string} [verbosity]
 */
function formatContractHistory(history, { label, eventsLimit = EVENTS_LIMIT_DEFAULT }, verbosity) {
  const v = verbosity || 'rich';
  const events = history.events || [];
  if (events.length === 0) {
    return `Nenhum evento registrado no histórico do ${label}.`;
  }

  const riders = summarizeRiders(events);
  const totalLabel = history.total !== undefined ? history.total : events.length;
  const notice = scanNotice({ total: history.total, read: events.length, maybeTruncated: history.maybeTruncated });

  if (v === 'compact') {
    const body = riders.length > 0 ? summaryRowsWithinBudget(riders, summaryRowCompact) : '(nenhum aditivo identificado nos eventos)\n';
    return `**Histórico — ${label}** · ${totalLabel} eventos\nAditivos:\n${body}${notice}`.trimEnd();
  }

  const header = `## Histórico de aditivos — ${label}\n\n**Eventos registrados:** ${totalLabel}\n${notice}\n`;
  const summary = riders.length > 0
    ? `### Aditivos registrados (${riders.length})\n\n` +
      '| Nº | Versão | Início | Valor | Desconto | Situação | Último evento | Autor |\n' +
      '|---|---|---|---|---|---|---|---|\n' +
      summaryRowsWithinBudget(riders, summaryRowRich)
    : '### Aditivos registrados (0)\n\n_Nenhum aditivo identificado nos eventos._\n';

  const ordered = [...events].sort(chronological).reverse();
  const wanted = ordered.slice(0, eventsLimit);
  const lines = wanted.map(eventLine);
  const eventsHeader = `\n### Eventos (do mais recente para o mais antigo)\n\n`;
  const tail = `\n${CAVEATS}\n${footer(v)}`;
  // Reserva para o aviso de corte (+N eventos), calculado sobre o pior caso.
  const longestReason = Math.max(omittedReason(true).length, omittedReason(false).length);
  const omittedReserve = `\n_+${ordered.length} eventos não exibidos — ._\n`.length + longestReason;
  const budget = RESPONSE_ITEM_BUDGET - header.length - summary.length - eventsHeader.length - tail.length - omittedReserve;
  const fit = appendWithinBudget(lines, { maxChars: Math.max(budget, 0) });
  const shown = fit.shown;
  const omitted = ordered.length - shown;
  const omittedLine = omitted > 0 ? `\n_+${omitted} eventos não exibidos — ${omittedReason(shown < wanted.length)}._\n` : '';

  return `${header}${summary}${eventsHeader}${lines.slice(0, shown).join('')}${omittedLine}${tail}`;
}

function historyErrorResponse(response, target) {
  const errorCode = extractApiErrorCode(response);

  if (errorCode === 40401 || response.status === 404) {
    const title = target.isGroup
      ? `Grupo de contrato #${target.id} não encontrado`
      : `Contrato #${target.id} não encontrado`;
    const hint = target.isGroup ? GROUP_NOT_FOUND_HINT : contractNotFoundHint(target.id, 'use `get_contract_history` com `contract_group_id`');
    return contractApiErrorResponse(title, response, hint);
  }

  if (errorCode === 40304) return contractsLicenseErrorResponse();

  if (errorCode === 40301 || response.status === 403) {
    return contractsAccessDeniedResponse(`Acesso negado ao histórico do ${target.label}`, response, errorCode);
  }

  return apiFailureResponse(
    `**❌ Erro ao buscar o histórico do ${target.label}**`,
    response,
    '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
  );
}

/**
 * Le todas as paginas (ate MAX_PAGES). Para quando o total conhecido foi
 * alcancado ou quando a pagina vem incompleta.
 *
 * Sem total conhecido, parar no teto com a ultima pagina cheia marca
 * `maybeTruncated` (pode haver mais eventos).
 *
 * @returns {Promise<{ events?: object[], total?: number, maybeTruncated?: boolean, errorResponse?: object, badPayload?: boolean }>}
 */
async function fetchAllEvents(api, target) {
  const events = [];
  let total;
  let maybeTruncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await api[target.method](target.id, { offset: page, limit: PAGE_SIZE });
    if (response.error) return { errorResponse: historyErrorResponse(response, target) };
    if (!Array.isArray(response.data)) return { badPayload: true };
    if (response.total !== undefined) total = response.total;
    events.push(...response.data);
    const reachedTotal = total !== undefined && page * PAGE_SIZE >= total;
    if (response.data.length < PAGE_SIZE || reachedTotal) break;
    if (page === MAX_PAGES && total === undefined) maybeTruncated = true;
  }
  return { events, total, maybeTruncated };
}

async function execute(args, { api, verbosity }) {
  const target = resolveTarget(args || {});
  const eventsLimit = resolveEventsLimit(args.events_limit);

  try {
    const result = await fetchAllEvents(api, target);
    if (result.errorResponse) return result.errorResponse;
    if (result.badPayload) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar o histórico do ${target.label}**\n\n` +
        'A API retornou sucesso mas sem a lista de eventos.\n\n' +
        `*Verifique se o ${target.label} existe.*`
      );
    }
    return textResponse(formatContractHistory(result, { label: target.label, eventsLimit }, verbosity));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao buscar o histórico do ${target.label}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractHistory, summarizeRiders };

/**
 * Lançamentos de valorização do ticket (aba "Valorização" do portal):
 * formatter + execute compartilhados por list_ticket_extra_values e
 * list_ticket_internal_costs.
 *
 * Os 2 endpoints (`/tickets/{n}/extra-values` e `/tickets/{n}/internal-costs`)
 * devolvem o mesmo shape — `id, date, description, extra_expense{id,name}|null,
 * quantity, unitary_value, total_value, user{id,name}, files[], created_at,
 * updated_at` — e os extras acrescentam `billed`. A pergunta de negócio é oposta
 * (cobrado do cliente × gasto da operação), por isso são 2 tools; o que varia
 * entre elas entra como `config`.
 *
 * Regras de exibição:
 *   - `unitary_value`/`total_value` chegam como "--" quando o usuário não tem a
 *     permissão "Visualizar valores dos tickets" (exceto nos lançamentos que ele
 *     mesmo criou). Vira "oculto (sem permissão)" — nunca R$ 0,00 — e fica fora
 *     da soma, com nota de quantos ficaram de fora; com algum mascarado o rótulo
 *     ganha "(só valores visíveis)" e com todos mascarados não há soma. Valor em
 *     branco conta como mascarado.
 *   - Soma das linhas visíveis (com sinal: o servidor não valida valor negativo).
 *     "Total do ticket" só quando a página 1 cobre tudo (X-Total-Items <= linhas
 *     mostradas); senão "Soma desta página". Com corte pelo teto de resposta, a
 *     soma é recalculada sobre as linhas mostradas.
 *   - `showBilled` (só extras): coluna Faturado + soma faturado × a faturar.
 *   - Arquivos: rich até 5 por lançamento (+N), links assinados válidos por 72 h;
 *     compact só a contagem.
 *
 * Módulo local da entidade (2 consumidores; `_shared/` exige >= 3), no mesmo
 * espírito de `createdByWayOf.js`.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { requireField, parseIntStrict } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');
const { escapeCell, formatFileSize } = require('../_shared/markdown');
const {
  footer, pagination, truncate, money, dateOnly, row, appendWithinBudget,
  cutCountLabel, listVerbosity, RESPONSE_ITEM_BUDGET
} = require('../_shared/format');

const MASKED_LABEL = 'oculto (sem permissão)';
const MANUAL_ENTRY_LABEL = 'Inserido manualmente';
const MAX_FILES_RICH = 5;
const SAFE_URL = /^https?:\/\/\S+$/i;
const DESCRIPTION_MAX_RICH = 500;
const DESCRIPTION_MAX_COMPACT = 120;
const UNIT = 'lançamentos';
// Folga para o rodapé de soma, cuja versão final (recalculada sobre as linhas
// mostradas) pode diferir em alguns caracteres da estimativa.
const SUMMARY_SLACK = 200;

const PERMISSION_HINT =
  '*Para ver os lançamentos é preciso a permissão **Visualizar e abrir tickets** ' +
  '(ou **Visualizar tickets em que eu não sou o responsável**, se o ticket não for seu) e licença de Tickets. ' +
  'Usuário-cliente não tem acesso a valores extras nem a custos internos.*';

const VALIDATION_HINT =
  '*A API v2 rejeitou o parâmetro `ticket_number`. Verifique se é um número inteiro maior que 0.*';

/** Valor em centavos, ou null quando mascarado ("--"), ausente, em branco ou não numérico. */
function toCents(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function centsToString(cents) {
  return (cents / 100).toFixed(2);
}

function displayValue(value, v) {
  if (toCents(value) === null) return v === 'compact' ? 'oculto' : MASKED_LABEL;
  return money(value, v);
}

function itemLabel(entry) {
  const name = entry.extra_expense && entry.extra_expense.name;
  return name || MANUAL_ENTRY_LABEL;
}

function userLabel(entry) {
  return (entry.user && entry.user.name) || '—';
}

/** Descrição truncada (texto livre do atendente); o escape fica com quem renderiza. */
function description(entry, max) {
  return truncate(entry.description || '', max);
}

function filesOf(entry) {
  return Array.isArray(entry.files) ? entry.files : [];
}

function fileLine(file) {
  const name = escapeCell(file.file_name || 'arquivo');
  const size = Number.isFinite(Number(file.size)) && file.size !== null ? ` (${formatFileSize(Number(file.size))})` : '';
  // file.url vem da API: só entra se for http(s) sem espaço/quebra (mesma regra de
  // getTicketAnswer), para não carregar sintaxe Markdown para o cliente IA.
  const url = typeof file.url === 'string' && SAFE_URL.test(file.url) ? ` — ${file.url}` : '';
  return `   - ${name}${size}${url}\n`;
}

function renderRichEntry(entry, index, config) {
  let text = `**${index + 1}. ${dateOnly(entry.date)} · ${escapeCell(itemLabel(entry))}**\n`;
  const desc = description(entry, DESCRIPTION_MAX_RICH);
  if (desc) text += `• **Descrição:** ${escapeCell(desc)}\n`;
  const quantity = entry.quantity ?? '—';
  text += `• **Quantidade:** ${quantity} | **Valor unitário:** ${displayValue(entry.unitary_value)} | ` +
    `**Valor total:** ${displayValue(entry.total_value)}\n`;
  if (config.showBilled) text += `• **Faturado:** ${entry.billed === true ? 'Sim' : 'Não'}\n`;
  text += `• **Criado por:** ${escapeCell(userLabel(entry))}\n`;
  const files = filesOf(entry);
  if (files.length > 0) {
    text += `• **Arquivos (${files.length}):**\n`;
    files.slice(0, MAX_FILES_RICH).forEach(file => { text += fileLine(file); });
    const extra = files.length - MAX_FILES_RICH;
    if (extra > 0) text += `   - +${extra} arquivo${extra === 1 ? '' : 's'}\n`;
  }
  return `${text}\n`;
}

function renderCompactEntry(entry, config) {
  const cells = [
    dateOnly(entry.date),
    itemLabel(entry),
    entry.quantity ?? '—',
    displayValue(entry.unitary_value, 'compact'),
    displayValue(entry.total_value, 'compact'),
    userLabel(entry),
    filesOf(entry).length
  ];
  if (config.showBilled) cells.push(entry.billed === true ? 'sim' : 'não');
  cells.push(description(entry, DESCRIPTION_MAX_COMPACT) || '—');
  return `${row(cells)}\n`;
}

function compactHeader(config) {
  return config.showBilled
    ? 'data|item|qtd|unit|total|por|arq|fat|descrição\n'
    : 'data|item|qtd|unit|total|por|arq|descrição\n';
}

/**
 * Soma das linhas visíveis (centavos), com a quebra faturado × a faturar e a
 * contagem de mascaradas.
 */
function summarize(entries) {
  let sum = 0;
  let billed = 0;
  let masked = 0;
  entries.forEach(entry => {
    const cents = toCents(entry.total_value);
    if (cents === null) {
      masked++;
      return;
    }
    sum += cents;
    if (entry.billed === true) billed += cents;
  });
  return { sum, billed, unbilled: sum - billed, masked };
}

function summaryText(entries, { isWholeTicket, config, v }) {
  const { sum, billed, unbilled, masked } = summarize(entries);
  const allMasked = masked === entries.length;
  const baseLabel = isWholeTicket ? 'Total do ticket' : 'Soma desta página';
  // Com linhas ocultas a soma não é o total real: o rótulo diz que só cobre os valores visíveis.
  const label = masked > 0 ? `${baseLabel} (só valores visíveis)` : baseLabel;
  const fmt = cents => money(centsToString(cents), v);

  if (v === 'compact') {
    // Tudo oculto: sem soma (seria um R$ 0,00 enganoso), só a contagem.
    if (allMasked) return `\n${masked} sem valor visível — soma indisponível\n`;
    let line = `${label}: ${fmt(sum)}`;
    if (config.showBilled) line += ` · Faturado ${fmt(billed)} · A faturar ${fmt(unbilled)}`;
    if (masked > 0) line += ` · ${masked} sem valor visível fora da soma`;
    return `\n${line}\n`;
  }

  let text = '';
  if (!allMasked) {
    text += `\n**${label}: ${fmt(sum)}**\n`;
    if (config.showBilled) text += `• Faturado ${fmt(billed)} · A faturar ${fmt(unbilled)}\n`;
  } else {
    text += '\n**Soma indisponível: nenhum valor visível**\n';
  }
  if (masked > 0) {
    text += `• *${masked} lançamento(s) sem valor visível fora da soma (sem a permissão **Visualizar valores dos tickets**, ` +
      `só aparecem os valores dos lançamentos que você mesmo criou)*\n`;
  }
  return text;
}

function clampPage(offset, limit) {
  return {
    page: Math.max(1, Number.parseInt(offset, 10) || 1),
    size: Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20))
  };
}

/**
 * Formata a página de lançamentos em Markdown.
 *
 * @param {object} params
 * @param {string|number} params.ticketNumber
 * @param {Array} params.entries - lançamentos da página
 * @param {number} [params.total] - X-Total-Items
 * @param {number} [params.offset]
 * @param {number} [params.limit]
 * @param {object} params.config - { title, emptyLabel, showBilled, contextNote }
 * @param {object} [params.ctx] - { verbosity, verbosityExplicit }
 * @param {number} [params.maxChars=RESPONSE_ITEM_BUDGET]
 * @returns {string}
 */
function formatValueEntries({ ticketNumber, entries, total, offset, limit, config, ctx = {}, maxChars = RESPONSE_ITEM_BUDGET }) {
  const { page, size } = clampPage(offset, limit);
  const { verbosity: v, notice } = listVerbosity(ctx, entries.length);
  const compact = v === 'compact';
  const title = compact ? `${config.title} — Ticket #${ticketNumber}` : `${config.emoji} ${config.title} — Ticket #${ticketNumber}`;

  if (entries.length === 0) {
    const pageNote = page > 1 ? `\n\n*Página ${page} sem lançamentos — volte para \`offset: 1\`.*` : '';
    return `**${title}**\n\n*Nenhum ${config.emptyLabel} lançado no ticket #${ticketNumber}.*${pageNote}`;
  }

  const totalNum = Number.parseInt(total, 10);
  const knownTotal = !Number.isNaN(totalNum);
  const countLabel = knownTotal && totalNum !== entries.length ? `${entries.length} de ${totalNum}` : `${entries.length}`;
  const context = compact ? '' : `*${config.contextNote}*\n\n`;
  const head = `**${title} (${countLabel})**\n\n${context}${compact ? compactHeader(config) : ''}`;
  const cutHead = shown => `**${title} (${cutCountLabel(shown, total, entries.length)})**\n\n${context}${compact ? compactHeader(config) : ''}`;

  const parts = entries.map((entry, i) => (compact ? renderCompactEntry(entry, config) : renderRichEntry(entry, i, config)));
  const FILES_NOTE = '\n*Links de arquivos válidos por 72 h.*\n';
  const anyFiles = list => !compact && list.some(entry => filesOf(entry).length > 0);
  // Reserva pelo pior caso (todas as linhas); a nota final só sai se alguma linha mostrada tiver arquivo.
  const filesNoteReserve = anyFiles(entries) ? FILES_NOTE : '';
  const paginationText = pagination({ offset: page, limit: size, count: entries.length, total, unit: UNIT }, v);
  const footerStr = footer(v);
  const footerBlock = footerStr ? '\n' + footerStr : '';
  const tail = footerBlock + notice;

  const estimatedSummary = summaryText(entries, { isWholeTicket: false, config, v });
  const reserved = Math.max(head.length, cutHead(entries.length).length) + estimatedSummary.length + SUMMARY_SLACK +
    filesNoteReserve.length + paginationText.length + tail.length;
  const fit = appendWithinBudget(parts, { maxChars: maxChars - reserved, offset: page, limit: size, unit: UNIT, verbosity: v, total });

  const shownEntries = entries.slice(0, fit.shown);
  const isWholeTicket = !fit.truncated && page === 1 && knownTotal && totalNum <= shownEntries.length;
  const summary = summaryText(shownEntries, { isWholeTicket, config, v });
  const filesNote = anyFiles(shownEntries) ? FILES_NOTE : '';

  return `${fit.truncated ? cutHead(fit.shown) : head}${fit.text}${summary}${filesNote}${fit.truncated ? '' : paginationText}${tail}`;
}

/**
 * Cria o `execute` de um slice de lançamentos.
 *
 * @param {object} config
 * @param {function(object, (string|number), object): Promise<object>} config.fetch -
 *   `(api, ticketNumber, { offset, limit }) => api.<método>(...)`; a chamada literal fica no
 *   slice (o `swagger_analyze.py coverage` liga endpoint → slice por `api.<método>(`)
 * @param {string} config.resourceLabel - rótulo nas mensagens de erro
 * @param {string} config.title / emoji / emptyLabel / contextNote
 * @param {boolean} config.showBilled
 * @returns {function(object, object): Promise<object>}
 */
/**
 * ticket_number vai interpolado no path (/tickets/{n}/extra-values): só dígitos e > 0,
 * validado antes da API (mesma regra de createClientAnswer).
 */
function parseTicketNumber(value) {
  const message = 'ticket_number deve ser um número inteiro positivo (ex: 6167)';
  let parsed;
  try {
    parsed = parseIntStrict(value, 'ticket_number');
  } catch {
    throw new Error(message);
  }
  if (parsed <= 0) throw new Error(message);
  return parsed;
}

function buildValueEntriesExecute(config) {
  return async function execute(args, ctx = {}) {
    requireField(args, 'ticket_number');
    const ticket_number = parseTicketNumber(args.ticket_number);
    const { offset = 1, limit = 20 } = args;

    try {
      const response = await config.fetch(ctx.api, ticket_number, { offset, limit });

      if (response.error) {
        return ticketSubresourceErrorResponse(response, ticket_number, {
          resourceLabel: config.resourceLabel,
          validationHint: VALIDATION_HINT,
          permissionHint: PERMISSION_HINT
        });
      }

      const entries = Array.isArray(response.data) ? response.data : [];
      return textResponse(formatValueEntries({
        ticketNumber: ticket_number,
        entries,
        total: response.total,
        offset,
        limit,
        config,
        ctx
      }));
    } catch (error) {
      return internalErrorResponse(
        `**❌ Erro interno ao buscar ${config.resourceLabel} do ticket #${ticket_number}**`,
        error
      );
    }
  };
}

module.exports = {
  formatValueEntries,
  buildValueEntriesExecute,
  MASKED_LABEL,
  MANUAL_ENTRY_LABEL,
  PERMISSION_HINT
};

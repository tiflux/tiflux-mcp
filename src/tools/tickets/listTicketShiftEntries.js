/**
 * Slice: list_ticket_shift_entries — deslocamentos e caronas LANÇADOS em um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/shift-entries (via api.fetchTicketShiftEntries).
 * Um item por apontamento: `appointment_id, date, kind, value, billed, guarantee,
 * shift{id,name}|null, contract{id,name}|null, contract_group{id,name}|null,
 * owner_ticket{ticket_number}|null, carona_tickets[], user{id,name}`.
 *
 * Irmão de list_ticket_internal_costs, mas com formatter próprio (o shape não é o de
 * ./ticketValueEntries.js). Regras de exibição:
 *   - Totais do ticket inteiro vêm dos headers `x-total-loose-value` e
 *     `x-total-contract-value` (sem garantia, sem caronas). Nunca são recalculados
 *     pela página. Os dois `--` (sem a permissão "Visualizar valores dos tickets") viram
 *     "valores ocultos (sem permissão)"; um só header, ou um valor não numérico, mostra o
 *     que veio e marca o resto como "indisponível" (anomalia do upstream, não permissão).
 *   - `carona_tickets` é do ticket, não do lançamento: vem igual em todo item
 *     não-carona. Sai uma única vez, no cabeçalho.
 *   - `date` segue o formato de data do locale (`I18n date.formats.default`): `11/03/2025`
 *     em pt, `2025-03-11` em en (o exemplo da Swagger e a org de teste). É exibida crua —
 *     `dateOnly` leria 11/03 como 3 de novembro.
 *   - `kind`: `loose` (avulso), `contract` (contrato ou grupo de contratos),
 *     `carona` (aproveita o deslocamento de outro ticket, sem custo próprio) ou
 *     `null` quando o cadastro do deslocamento foi apagado.
 *   - `billed` só existe em avulso; `value` "--" vira "oculto (sem permissão)",
 *     nunca R$ 0,00.
 */

const { textResponse } = require('../_shared/response');
const { toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');
const { escapeCell } = require('../_shared/markdown');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const {
  footer, pagination, money, row, appendWithinBudget, cutCountLabel, listVerbosity, RESPONSE_ITEM_BUDGET
} = require('../_shared/format');
const { MASKED_LABEL, PERMISSION_HINT, parseTicketNumber, toCents, clampPage } = require('./ticketValueEntries');

const RESOURCE_LABEL = 'deslocamentos lançados';
const TITLE = 'Deslocamentos lançados';
const UNIT = 'lançamentos';
const MAX_CARONA_TICKETS_RICH = 10;
const MASKED_TOTALS_LABEL = 'valores ocultos (sem permissão)';
const COMPACT_HEADER = 'data|tipo|deslocamento|contrato|valor|fat|garantia|por|apont\n';
const CONTEXT_NOTE =
  '*Deslocamentos e caronas lançados nos apontamentos do ticket. Para os deslocamentos disponíveis ' +
  '(cadastro) ao valorizar um apontamento, use `get_ticket_shifts`.*\n\n';

const VALIDATION_HINT =
  '*A API v2 rejeitou um parâmetro. Verifique `ticket_number` (inteiro maior que 0), `offset` (a partir de 1) ' +
  'e `limit` (de 1 a 200).*';

const KIND_LABELS = {
  loose: { rich: 'Avulso', compact: 'avulso' },
  contract: { rich: 'Contrato', compact: 'contrato' },
  group: { rich: 'Grupo de contratos', compact: 'grupo' },
  carona: { rich: 'Carona', compact: 'carona' },
  removed: { rich: 'Deslocamento removido', compact: 'removido' }
};

function nameOf(ref) {
  return ref?.name || null;
}

/** Chave de rótulo: `contract` com grupo preenchido vira `group`; `kind` nulo/desconhecido vira `removed`. */
function kindKey(entry) {
  if (entry.kind === 'contract' && nameOf(entry.contract_group)) return 'group';
  return Object.hasOwn(KIND_LABELS, entry.kind ?? '') ? entry.kind : 'removed';
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Valor gravado no lançamento: sem valor → "—"; mascarado ("--") → oculto; senão dinheiro. */
function displayValue(value, v) {
  if (isBlank(value)) return '—';
  if (toCents(value) === null) return v === 'compact' ? 'oculto' : MASKED_LABEL;
  return money(value, v);
}

/** Faturado só existe em avulso; nos demais (e com null) é "—", nunca "Não". */
function billedLabel(entry, v) {
  if (entry.kind !== 'loose' || typeof entry.billed !== 'boolean') return '—';
  if (v === 'compact') return entry.billed ? 'sim' : 'não';
  return entry.billed ? 'Sim' : 'Não';
}

function contractLabel(entry) {
  return nameOf(entry.contract) || nameOf(entry.contract_group);
}

function userLabel(entry) {
  return nameOf(entry.user) || '—';
}

function ownerTicketLabel(entry) {
  const number = entry.owner_ticket?.ticket_number;
  return number ? `ticket #${escapeCell(number)}` : null;
}

function appointmentLabel(entry) {
  return entry.appointment_id ? `#${escapeCell(entry.appointment_id)}` : '—';
}

function renderRichEntry(entry, index) {
  const key = kindKey(entry);
  const shiftName = nameOf(entry.shift);
  const shiftSuffix = shiftName ? ' · ' + escapeCell(shiftName) : '';
  let text = `**${index + 1}. ${escapeCell(entry.date || '—')} · ${KIND_LABELS[key].rich}${shiftSuffix}**\n`;

  if (key === 'carona') {
    const owner = ownerTicketLabel(entry);
    text += owner
      ? `• Pega carona no ${owner}, sem custo próprio\n`
      : '• Carona sem custo próprio (ticket dono removido)\n';
  } else {
    text += `• **Valor:** ${displayValue(entry.value)}`;
    if (key === 'loose') text += ` | **Faturado:** ${billedLabel(entry)}`;
    text += '\n';
    const contract = contractLabel(entry);
    if (contract) text += `• **${key === 'group' ? 'Grupo de contratos' : 'Contrato'}:** ${escapeCell(contract)}\n`;
    if (entry.guarantee === true) text += '• **Em garantia** (fora dos totais)\n';
  }

  text += `• **Lançado por:** ${escapeCell(userLabel(entry))} | **Apontamento:** ${appointmentLabel(entry)}\n`;
  return `${text}\n`;
}

function renderCompactEntry(entry) {
  const key = kindKey(entry);
  const owner = ownerTicketLabel(entry);
  const shiftCell = key === 'carona'
    ? `carona do ${owner || 'ticket dono removido'}`
    : nameOf(entry.shift);
  return `${row([
    entry.date,
    KIND_LABELS[key].compact,
    shiftCell,
    contractLabel(entry),
    key === 'carona' ? 'sem custo' : displayValue(entry.value, 'compact'),
    billedLabel(entry, 'compact'),
    entry.guarantee === true ? 'sim' : 'não',
    userLabel(entry),
    entry.appointment_id
  ])}\n`;
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

function isMasked(value) {
  return typeof value === 'string' && value.trim() === '--';
}

/** Um total: numérico → dinheiro; `--` → oculto; ausente ou não numérico → indisponível. */
function totalValue(value, v) {
  if (isMasked(value)) return v === 'compact' ? 'oculto' : MASKED_LABEL;
  if (isBlank(value) || toCents(value) === null) return 'indisponível';
  return money(value, v);
}

/**
 * Linha de totais do ticket inteiro, lida dos headers (nunca recalculada pela página).
 * Headers ausentes → sem linha; os dois `--` → valores ocultos (sem permissão); só um
 * header ou valor não numérico → mostra o que veio e marca o resto como indisponível.
 */
function totalsLine(headers, v) {
  const loose = headerValue(headers, 'x-total-loose-value');
  const contract = headerValue(headers, 'x-total-contract-value');
  if (isBlank(loose) && isBlank(contract)) return '';

  const compact = v === 'compact';
  const label = compact ? 'Totais do ticket' : '**Totais do ticket:**';
  if (isMasked(loose) && isMasked(contract)) return `${label} ${MASKED_TOTALS_LABEL}\n`;
  return `${label} Avulsos ${totalValue(loose, v)} · Contrato/grupo ${totalValue(contract, v)} (sem garantia)\n`;
}

/** `carona_tickets` é do ticket: lido uma vez, do primeiro item que o traz preenchido. */
function caronaTicketsOf(entries) {
  const holder = entries.find(entry => Array.isArray(entry.carona_tickets) && entry.carona_tickets.some(isObject));
  return holder ? holder.carona_tickets.filter(isObject) : [];
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function caronaTicketLabel(ticket) {
  const count = Number.parseInt(ticket.appointments, 10);
  const suffix = Number.isNaN(count) ? '' : ' (' + plural(count, 'apontamento') + ')';
  return `#${escapeCell(ticket.ticket_number)}${suffix}`;
}

function caronasLine(entries, v) {
  const tickets = caronaTicketsOf(entries);
  if (tickets.length === 0) return '';
  if (v === 'compact') return `Caronas neste deslocamento: ${plural(tickets.length, 'ticket')}\n`;

  const shown = tickets.slice(0, MAX_CARONA_TICKETS_RICH).map(caronaTicketLabel);
  const extra = tickets.length - MAX_CARONA_TICKETS_RICH;
  const more = extra > 0 ? ` +${extra}` : '';
  return `**Caronas neste deslocamento:** ${shown.join(', ')}${more}\n`;
}

/**
 * Formata a página de deslocamentos lançados em Markdown.
 *
 * @param {object} params
 * @param {string|number} params.ticketNumber
 * @param {Array} params.entries - lançamentos da página
 * @param {object} [params.headers] - headers da resposta (totais do ticket)
 * @param {number} [params.total] - X-Total-Items
 * @param {number} [params.offset]
 * @param {number} [params.limit]
 * @param {object} [params.ctx] - { verbosity, verbosityExplicit }
 * @param {number} [params.maxChars=RESPONSE_ITEM_BUDGET]
 * @returns {string}
 */
function formatShiftEntries({ ticketNumber, entries, headers, total, offset, limit, ctx = {}, maxChars = RESPONSE_ITEM_BUDGET }) {
  const { page, size } = clampPage(offset, limit);
  const { verbosity: v, notice } = listVerbosity(ctx, entries.length);
  const compact = v === 'compact';
  const title = compact ? `${TITLE} — Ticket #${ticketNumber}` : `🚗 ${TITLE} — Ticket #${ticketNumber}`;

  if (entries.length === 0) {
    const pageNote = page > 1 ? `\n\n*Página ${page} sem lançamentos — volte para \`offset: 1\`.*` : '';
    return `**${title}**\n\n*Nenhum deslocamento lançado no ticket #${ticketNumber}.*${pageNote}`;
  }

  const totalNum = Number.parseInt(total, 10);
  const countLabel = !Number.isNaN(totalNum) && totalNum !== entries.length
    ? `${entries.length} de ${totalNum}`
    : `${entries.length}`;
  const summary = `${totalsLine(headers, v)}${caronasLine(entries, v)}`;
  const body = `${compact ? '' : CONTEXT_NOTE}${summary}${summary ? '\n' : ''}${compact ? COMPACT_HEADER : ''}`;
  const head = `**${title} (${countLabel})**\n\n${body}`;
  const cutHead = shown => `**${title} (${cutCountLabel(shown, total, entries.length)})**\n\n${body}`;

  const parts = entries.map((entry, i) => (compact ? renderCompactEntry(entry) : renderRichEntry(entry, i)));
  const paginationText = pagination({ offset: page, limit: size, count: entries.length, total, unit: UNIT }, v);
  const footerStr = footer(v);
  const tail = (footerStr ? '\n' + footerStr : '') + notice;

  const reserved = Math.max(head.length, cutHead(entries.length).length) + paginationText.length + tail.length;
  const fit = appendWithinBudget(parts, { maxChars: maxChars - reserved, offset: page, limit: size, unit: UNIT, verbosity: v, total });

  return `${fit.truncated ? cutHead(fit.shown) : head}${fit.text}${fit.truncated ? '' : paginationText}${tail}`;
}

const schema = {
  name: 'list_ticket_shift_entries',
  description:
    'Listar os deslocamentos e as caronas LANÇADOS em um ticket (aba "Valorização" do portal), um item por apontamento: ' +
    'data, tipo (avulso, contrato, grupo de contratos ou carona), deslocamento, contrato/grupo, valor gravado no lançamento ' +
    '(não o preço atual do cadastro), faturado (só em avulso), garantia, quem lançou e o apontamento. O cabeçalho traz os ' +
    'totais do ticket inteiro (avulsos × contrato/grupo, sem os apontamentos em garantia e sem caronas) e os tickets que ' +
    'pegaram carona neste ticket. Carona aproveita o deslocamento de outro ticket e não tem custo próprio. Sem a permissão ' +
    '"Visualizar valores dos tickets" os valores e os totais aparecem ocultos, exceto nos apontamentos do próprio usuário. ' +
    'Para os deslocamentos DISPONÍVEIS (cadastro) ao valorizar um apontamento, use `get_ticket_shifts`. Somente leitura.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket (ex: "6167")'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
const execute = withValidationResponse(`Erro ao buscar ${RESOURCE_LABEL} do ticket`, async function execute(args, ctx = {}) {
  requireField(args, 'ticket_number');
  const ticket_number = parseTicketNumber(args.ticket_number);
  const { offset = 1, limit = 20 } = args;

  try {
    const response = await ctx.api.fetchTicketShiftEntries(ticket_number, { offset, limit });

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, {
        resourceLabel: RESOURCE_LABEL,
        validationHint: VALIDATION_HINT,
        permissionHint: PERMISSION_HINT
      });
    }

    return textResponse(formatShiftEntries({
      ticketNumber: ticket_number,
      // Item nulo/não-objeto no upstream é descartado: não derruba os lançamentos válidos.
      entries: Array.isArray(response.data) ? response.data.filter(isObject) : [],
      headers: response.headers,
      total: response.total,
      offset,
      limit,
      ctx
    }));
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar ${RESOURCE_LABEL} do ticket #${ticket_number}`, error);
  }
});

module.exports = { name: schema.name, schema, execute, format: formatShiftEntries };

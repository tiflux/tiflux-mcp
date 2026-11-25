/**
 * Slice: get_ticket_histories — lista o historico de eventos (timeline) de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/histories?offset&limit&history_of&type_id_attr&operation
 * (via api.getTicketHistories).
 * Filtros opcionais: history_of, type_id_attr, operation (so valido com history_of=1).
 *
 * Sem history_of (padrao, H31): busca estagios (0) E apontamentos (1) — so as
 * paginas de 200 que cobrem offset*limit, ate COMBINED_MAX_PAGES por fonte, com
 * aviso se cortar —, junta por data decrescente e pagina localmente com
 * offset/limit exatos. Falha em uma fonte devolve a outra com aviso.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber, parseIntStrict, ValidationError } = require('../_shared/validators');
const { footer, pagination, renderWithinBudget, cutCountLabel, dateTime } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'get_ticket_histories',
  description: 'Listar o histórico de eventos (timeline) de um ticket, com diff de campos alterados e, nos apontamentos, os detalhes (data, duração, deslocamento, contrato, usuário, tipo de atendimento). Datas do diff em horário de Brasília (no formato compact, ISO curto com offset -03:00; hora do dia como HH:MM). Sem history_of (padrão), traz estágios E apontamentos juntos, do mais recente ao mais antigo, paginados pelo MCP (até 1.000 eventos por fonte, com aviso se cortar). history_of: 0 = só estágios, 1 = só apontamentos. operation e type_id_attr só valem com history_of=1. A API v2 ainda NÃO expõe no histórico: respostas, anexos, checklist, comunicação interna, SLA nem edições de campo sem troca de estágio — use list_ticket_answers, get_ticket_files, get_ticket_checklists, list_internal_communications e get_ticket_stages_slas.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket para buscar o histórico'
      },
      ...paginationSchemaProperties(),
      history_of: {
        type: 'integer',
        enum: [0, 1],
        description: 'Área do histórico (opcional): 0 = só estágios, 1 = só apontamentos. Omitido = estágios e apontamentos juntos, do mais recente ao mais antigo'
      },
      type_id_attr: {
        type: 'integer',
        minimum: 1,
        description: 'ID do apontamento (só com history_of=1): filtra o histórico daquele apontamento. Com history_of=0 ou sem history_of é ignorado (com aviso)'
      },
      operation: {
        type: 'string',
        enum: ['created', 'updated', 'deleted'],
        description: 'Filtrar por tipo de operação — somente válido quando history_of=1 (apontamentos)'
      }
    },
    required: ['ticket_number']
  }
};

// O Swagger nao garante valores escalares em old_values/new_values; sem isto,
// um objeto viraria "[object Object]" no diff.
// Always-on: limite de ~200 chars para evitar blowup em objetos aninhados profundos.
const DIFF_VALUE_MAX = 200;
// Data-hora ISO com fuso (Z ou ±hh:mm): a API grava o diff a partir de
// saved_changes, entao qualquer coluna de data pode aparecer (changed_first_stage_at
// sai "...Z", as demais "...000Z") — detecta pelo VALOR, nao pelo nome do campo.
// Dividida em 2 regex (inicio data-hora + sufixo de fuso) so por causa do teto de
// complexidade de regex do lint; equivale a
// /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.
const ISO_DATETIME_HEAD_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/;
const ISO_ZONE_TAIL_RE = /^(?:Z|[+-]\d{2}:?\d{2})$/;

function isIsoWithZone(str) {
  const head = ISO_DATETIME_HEAD_RE.exec(str);
  return head !== null && ISO_ZONE_TAIL_RE.test(str.slice(head[0].length));
}
// Hora do dia de apontamento (init_time/end_time) nao passa por aqui: a coluna e
// string "HH:MM" ja no fuso da organizacao, como o usuario digitou, e sai crua.

function formatDiffValue(value, verbosity) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && isIsoWithZone(value)) return dateTime(value, verbosity);
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > DIFF_VALUE_MAX ? str.substring(0, DIFF_VALUE_MAX) + '...' : str;
}

// Chaves de appointment_details ja normalizadas pela API (H30). Chave fora do mapa sai como veio.
const APPOINTMENT_DETAIL_LABELS = {
  date: 'Data',
  duration: 'Duração',
  shift: 'Deslocamento',
  contract: 'Contrato',
  loose_service: 'Serviço avulso',
  user: 'Usuário',
  attendance_type: 'Tipo de atendimento',
  // Pre-apontamento ("Pre-appointment was created") traz so a hora de inicio/fim.
  start_time: 'Início',
  end_time: 'Fim'
};

function detailValue(value, verbosity) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.name) return String(value.name);
  return formatDiffValue(value, verbosity);
}

/** Linhas de um objeto de detalhes (appointment_details/action_details); vazio → ''. */
function detailsSection(title, details, labels, verbosity) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '';
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (entries.length === 0) return '';
  const lines = entries.map(([key, value]) => `      • **${labels[key] || key}:** ${detailValue(value, verbosity)}\n`);
  return `\n   ${title}\n${lines.join('')}`.replace(/\n$/, '');
}

const SOURCE_LABELS = { 0: 'estágio', 1: 'apontamento' };

function formatHistoryEvent(event, index, verbosity) {
  const eventId = event.id || 'N/A';
  const action = event.action || 'ação não informada';
  const userName = event.user?.name || 'Usuário não informado';
  const createdAt = event._created_at ? dateTime(event._created_at, verbosity) : 'Data não informada';
  const eventType = event._type || '';
  const eventOp = event._operation || '';

  let typeInfo = '';
  if (eventType || eventOp) {
    const opSuffix = eventOp ? `, op: ${eventOp}` : '';
    typeInfo = ` (tipo: ${eventType}${opSuffix})`;
  }
  const sourceTag = SOURCE_LABELS[event._source] ? ` · ${SOURCE_LABELS[event._source]}` : '';

  let diffSection = '';
  if (event.changes && Array.isArray(event.changes.fields) && event.changes.fields.length > 0) {
    diffSection = '\n   📝 **Alterações:**\n';
    event.changes.fields.forEach(field => {
      const oldVal = formatDiffValue(event.changes.old_values?.[field], verbosity);
      const newVal = formatDiffValue(event.changes.new_values?.[field], verbosity);
      diffSection += `      • **${field}:** \`${oldVal}\` → \`${newVal}\`\n`;
    });
  }
  const appointmentSection = detailsSection('🕒 **Apontamento:**', event.appointment_details, APPOINTMENT_DETAIL_LABELS, verbosity);
  const actionSection = detailsSection('ℹ️ **Detalhes:**', event.action_details, {}, verbosity);
  const extra = appointmentSection + actionSection;
  const extraBlock = extra ? extra + '\n' : '';

  return `**${index + 1}. Evento #${eventId}**${typeInfo}${sourceTag}\n` +
    `   👤 **Usuário:** ${userName}\n` +
    `   📅 **Data:** ${createdAt}\n` +
    `   🔔 **Ação:** ${action}${diffSection}${extraBlock}\n`;
}

function formatHistoriesList(ticketNumber, events, offset, limit, verbosity, { total, notes = [], scopeLabel = '' } = {}) {
  const notesText = notes.length > 0 ? notes.map(n => '> ⚠️ ' + n).join('\n') + '\n\n' : '';
  const scope = scopeLabel ? ` — ${scopeLabel}` : '';
  const countText = (total !== undefined && total !== null && total !== events.length) ? `${events.length} de ${total} eventos` : `${events.length} eventos`;
  const head = `**📋 Histórico do Ticket #${ticketNumber}**${scope} (${countText})\n\n${notesText}`;
  const truncatedHead = (shown) => `**📋 Histórico do Ticket #${ticketNumber}**${scope} (${cutCountLabel(shown, total ?? null, events.length, 'eventos')})\n\n${notesText}`;

  // Espelha o clamp da camada de API (offset >= 1, limit 1..200): a heuristica
  // de "tem proxima pagina" so funciona comparando contra o limit efetivamente enviado.
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  // verbosity e opcional (testes legados passam so 2 args); default 'rich'
  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: events.length, total, unit: 'eventos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  // Teto por item (F3): corta entre eventos, com offset/limit exatos para continuar.
  return renderWithinBudget({
    head,
    truncatedHead,
    parts: events.map((event, index) => formatHistoryEvent(event, index, v)),
    pagination: paginationInfo,
    tail: `${sep}${footerStr}`,
    offset: currentOffset,
    limit: currentLimit,
    unit: 'eventos',
    verbosity: v
  });
}

// Modo combinado (H31): teto de paginas de 200 por fonte. 5 × 200 = 1.000 eventos.
const COMBINED_PAGE_SIZE = 200;
const COMBINED_MAX_PAGES = 5;
const API_GAPS_NOTE = 'O histórico da API v2 traz só estágios e apontamentos. Respostas, anexos, checklist, comunicação interna, SLA e edições de campo sem troca de estágio ficam de fora: use list_ticket_answers, get_ticket_files, get_ticket_checklists, list_internal_communications e get_ticket_stages_slas.';
const SOURCES = [{ historyOf: 0, label: 'estágios' }, { historyOf: 1, label: 'apontamentos' }];

function historyErrorResponse(ticketNumber, response) {
  return errorResponse(
    `**❌ Erro ao buscar histórico do ticket**\n\n` +
    `**Ticket:** #${ticketNumber}\n` +
    `**Código:** ${response.status}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    `*Verifique se o ticket existe e se você tem permissão para visualizar o histórico.*`
  );
}

/**
 * Busca de uma fonte so as paginas que cobrem os `needed` eventos mais recentes
 * (a API ordena cada fonte por created_at desc), ate COMBINED_MAX_PAGES. A 1a pagina
 * vem sozinha (traz o total); as demais saem em paralelo, para o modo combinado nao
 * somar latencias sequenciais contra o Timeout de 30s da Lambda.
 * Erro da API → { error: response }. `total`: da API, ou exato quando a fonte acabou.
 */
async function fetchSource(api, ticketNumber, historyOf, needed) {
  const fetchPage = (page) => api.getTicketHistories(ticketNumber, { offset: page, limit: COMBINED_PAGE_SIZE, history_of: historyOf });
  const pagesNeeded = Math.min(COMBINED_MAX_PAGES, Math.max(1, Math.ceil(needed / COMBINED_PAGE_SIZE)));
  const first = await fetchPage(1);
  if (first.error) return { error: first };
  const total = first.total;
  const pages = [first];
  const firstFull = Array.isArray(first.data) && first.data.length >= COMBINED_PAGE_SIZE;
  const lastPage = total === undefined ? pagesNeeded : Math.min(pagesNeeded, Math.ceil(total / COMBINED_PAGE_SIZE));
  if (firstFull && lastPage > 1) {
    const rest = await Promise.all(Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2)));
    const failed = rest.find(r => r.error);
    if (failed) return { error: failed };
    pages.push(...rest);
  }
  const events = [];
  let lastFull = false;
  for (const response of pages) {
    const data = Array.isArray(response.data) ? response.data : [];
    data.forEach(event => events.push({ ...event, _source: historyOf }));
    lastFull = data.length >= COMBINED_PAGE_SIZE;
    if (!lastFull) break;
  }
  const hasMore = total === undefined ? lastFull : total > events.length;
  return { events, total: total ?? (hasMore ? undefined : events.length), cut: hasMore && events.length < needed };
}

function eventTime(event) {
  const t = new Date(event._created_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Avisos por fonte (falha parcial ou corte). Devolve as fontes que responderam. */
function collectSourceNotes(results, notes) {
  const ok = [];
  results.forEach((result, i) => {
    const { historyOf, label } = SOURCES[i];
    const other = SOURCES[1 - i];
    if (result.error) {
      notes.push(`Falha ao buscar o histórico de ${label} (código ${result.error.status}: ${result.error.error}); mostrando só ${other.label}. Para tentar de novo só essa parte, use history_of=${historyOf}.`);
      return;
    }
    ok.push(result);
    if (result.cut) {
      const of = result.total !== undefined ? ` de ${result.total}` : '';
      notes.push(`Histórico de ${label} cortado nos ${result.events.length}${of} mais recentes (limite de ${COMBINED_MAX_PAGES * COMBINED_PAGE_SIZE} por fonte); para o restante, consulte com history_of=${historyOf} e offset.`);
    }
  });
  return ok;
}

async function executeCombined(api, ticketNumber, { offset, limit, verbosity, notes }) {
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));
  // So o necessario para a pagina pedida: cada fonte ja vem em ordem decrescente,
  // entao os offset*limit mais recentes de cada uma bastam para a pagina exata.
  const needed = currentOffset * currentLimit;
  const results = await Promise.all(SOURCES.map(({ historyOf }) => fetchSource(api, ticketNumber, historyOf, needed)));
  // Erro nas duas fontes: prevalece o de estagios. Erro em uma: devolve a outra com aviso.
  if (results.every(r => r.error)) return historyErrorResponse(ticketNumber, results[0].error);
  const ok = collectSourceNotes(results, notes);

  // sort estavel: empate de data mantem a ordem de chegada (estagios antes de apontamentos).
  const merged = ok.flatMap(r => r.events).sort((a, b) => eventTime(b) - eventTime(a));
  const total = ok.every(r => r.total !== undefined) ? ok.reduce((sum, r) => sum + r.total, 0) : undefined;
  const page = merged.slice((currentOffset - 1) * currentLimit, needed);

  if (page.length === 0) {
    const notesText = notes.length > 0 ? notes.map(n => '> ⚠️ ' + n).join('\n') + '\n\n' : '';
    let where = 'não há eventos de estágio nem de apontamento';
    if (merged.length > 0) {
      where = total === undefined
        ? `a página ${currentOffset} está além dos ${merged.length} eventos buscados`
        : `a página ${currentOffset} está além do total (${total} eventos)`;
    }
    return textResponse(
      `**📋 Nenhum evento encontrado no histórico**\n\n` +
      `**Ticket:** #${ticketNumber}\n\n` +
      notesText +
      `*${where[0].toUpperCase()}${where.slice(1)}.*\n\n` +
      `${API_GAPS_NOTE}`
    );
  }

  notes.push(API_GAPS_NOTE);
  const scopeLabel = ok.length === SOURCES.length ? 'estágios e apontamentos, mais recente primeiro' : `só ${SOURCES[results.findIndex(r => !r.error)].label}, mais recente primeiro`;
  return textResponse(formatHistoriesList(ticketNumber, page, currentOffset, currentLimit, verbosity, { total, notes, scopeLabel }));
}

/** history_of: undefined/null (modo combinado), 0 ou 1. */
function parseHistoryOf(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (n === 0 || n === 1) return n;
  throw new ValidationError('history_of deve ser 0 (estágios) ou 1 (apontamentos)', {
    hint: 'Omita history_of para ver estágios e apontamentos juntos, ou informe 0 ou 1.'
  });
}

/** type_id_attr: inteiro >= 1; so vale com history_of=1 (fora disso, ignorado com aviso). */
function resolveTypeIdAttr(value, historyOf, notes) {
  if (value === undefined || value === null || value === '') return undefined;
  const hint = 'type_id_attr é o ID do apontamento (inteiro ≥ 1), usado só com history_of=1.';
  const parsed = parseIntStrict(value, 'type_id_attr', { hint });
  if (parsed < 1) throw new ValidationError('type_id_attr deve ser um ID de apontamento (inteiro ≥ 1)', { hint });
  if (historyOf !== 1) {
    notes.push('type_id_attr ignorado: ele filtra o histórico de UM apontamento e só vale com history_of=1.');
    return undefined;
  }
  return parsed;
}

async function execute(args, { api, verbosity }) {
  // Sem compact automatico aqui: o bloco de cada evento nao varia com a verbosidade
  // (so rodape e paginacao), entao o aviso "formato compacto aplicado" seria falso.
  // O teto de ~40k (renderWithinBudget) continua valendo.
  const { offset = 1, limit = 20, operation } = args;

  const ticket_number = requireTicketNumber(args);
  const history_of = parseHistoryOf(args.history_of);
  const notes = [];
  const type_id_attr = resolveTypeIdAttr(args.type_id_attr, history_of, notes);

  try {
    if (history_of === undefined) {
      if (operation) notes.push('operation ignorado: só vale com history_of=1 (apontamentos).');
      return await executeCombined(api, ticket_number, { offset, limit, verbosity, notes });
    }

    const response = await api.getTicketHistories(ticket_number, {
      offset,
      limit,
      history_of,
      type_id_attr,
      operation
    });

    if (response.error) return historyErrorResponse(ticket_number, response);

    const events = response.data || [];

    if (events.length === 0) {
      return textResponse(
        `**📋 Nenhum evento encontrado no histórico**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Página:** ${offset}\n\n` +
        `*Não há eventos de histórico para este ticket com os filtros informados.*`
      );
    }

    return textResponse(formatHistoriesList(ticket_number, events, offset, limit, verbosity, {
      total: response.total,
      notes,
      scopeLabel: history_of === 0 ? 'estágios' : 'apontamentos'
    }));
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar histórico do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar histórico do ticket', execute), format: formatHistoriesList };

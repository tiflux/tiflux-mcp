/**
 * groupByRender.js — renderizadores do modo agregado de `list_tickets` para as
 * dimensoes (`responsible`, `stage`, `client`, `status`) e para periodo × responsavel
 * (`day,responsible`, `week,responsible`, `month,responsible`).
 *
 * Modulo interno da entidade tickets (so `list_tickets` consome; nao e `_shared/`).
 * O despachante fica em `listTickets.js` (`renderGroupByResponse`), que continua
 * renderizando `day`/`week`/`month`/`desk` com a saida de sempre.
 *
 * Shape dos buckets (GET /tickets?group_by=):
 *   responsible → { period: <nome|null>, responsible_id, count }
 *   client      → { period: <nome>, client_id, count }
 *   stage       → { period: <nome>, stage_id, desk: <mesa>, count }
 *   status      → { period: <nome>, status_id, desk: <mesa>, count }
 *   <periodo>,responsible → { period: <rotulo>, responsible: <nome|null>, responsible_id, count }
 *
 * Regras: a chave de cada grupo e o ID (homonimos ficam em linhas separadas, nunca
 * somados por nome); ordenacao por contagem desc; a API devolve todos os grupos sem
 * paginar, entao a saida INTEIRA (cabecalho + linhas + rodape) e limitada a
 * RESPONSE_ITEM_BUDGET, cortada no limite de uma linha, com uma linha final dizendo
 * quantos grupos e quantos tickets ficaram de fora. Nomes vindos da API sao
 * normalizados (sem quebra de linha/controle) e, nos formatos de linha, o separador
 * `·` dentro de um nome sai escapado (`\·`) para nao forjar entradas.
 */

const { footer, RESPONSE_ITEM_BUDGET, AUTO_COMPACT_NOTICE } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');
const { temporalLabels, isoWeekRangeLabel } = require('../_shared/temporalBuckets');

// Rotulo PT de cada valor de group_by — fonte unica (bloco de filtros aplicados + titulos).
const GROUP_BY_LABELS = {
  day: 'dia',
  week: 'semana',
  month: 'mês',
  desk: 'mesa',
  responsible: 'responsável',
  stage: 'estágio',
  client: 'cliente',
  status: 'status',
  'day,responsible': 'dia × responsável',
  'week,responsible': 'semana × responsável',
  'month,responsible': 'mês × responsável'
};

// Strings exatas aceitas pela API (validacao estrita: "week, responsible" da 422).
const GROUP_BY_VALUES = Object.keys(GROUP_BY_LABELS);

// Dimensoes: campo do ID no bucket, cabecalho da coluna e se o grupo e por mesa.
const DIMENSIONS = {
  responsible: { idKey: 'responsible_id', column: 'Responsável', perDesk: false },
  stage: { idKey: 'stage_id', column: 'Estágio', perDesk: true },
  client: { idKey: 'client_id', column: 'Cliente', perDesk: false },
  status: { idKey: 'status_id', column: 'Status', perDesk: true }
};

const PERIOD_RESPONSIBLE_RE = /^(day|week|month),responsible$/;
const TEMPORAL_UNITS = new Set(['day', 'week', 'month']);
const NO_RESPONSIBLE_LABEL = '(sem responsável)';
// Acima disto a tabela pivot nao cabe (13 semanas de um trimestre e 12 meses de um ano cabem).
const MAX_PIVOT_COLUMNS = 16;
// Espaco reservado, dentro do teto, para a linha de "nao exibidos".
const CUT_LINE_RESERVE = 200;
// Teto da lista de rotulos da linha `Períodos:` (cabe ~460 dias ou ~230 semanas); acima
// disso a lista e abreviada com aviso explicito, para o cabecalho nao comer o orcamento.
const PERIOD_LINE_MAX_CHARS = 6000;
const PERIOD_SEP = ' · ';

function groupByLabel(groupBy) {
  return GROUP_BY_LABELS[groupBy] || groupBy;
}

/** 'dimension' | 'period_responsible' | 'simple' (day/week/month/desk). */
function groupByKind(groupBy) {
  if (DIMENSIONS[groupBy]) return 'dimension';
  if (PERIOD_RESPONSIBLE_RE.test(groupBy)) return 'period_responsible';
  return 'simple';
}

/** O titulo leva o eixo da data (criacao/fechamento)? So nos agrupamentos com periodo. */
function hasDateAxis(groupBy) {
  return TEMPORAL_UNITS.has(groupBy) || PERIOD_RESPONSIBLE_RE.test(groupBy);
}

// Texto vindo da API em uma linha so: quebras de linha e caracteres de controle viram espaco.
function singleLine(value) {
  return String(value).replaceAll(/[\p{Cc}\u2028\u2029]+/gu, ' ').trim();
}

function nameOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = singleLine(value);
  return text === '' ? null : text;
}

// Nome dentro dos formatos de linha (compact e por-linha): escapa o separador ` · `.
function inlineName(value) {
  return String(value).replaceAll('·', String.raw`\·`);
}

// Ordena rotulos em pt-BR; null (ex.: sem responsavel) sempre por ultimo.
function compareLabel(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'pt-BR');
}

function compareId(a, b) {
  return (a ?? 0) - (b ?? 0);
}

function sumCounts(counts) {
  return counts.reduce((sum, n) => sum + n, 0);
}

function partsLength(layout) {
  return layout.parts.reduce((sum, part) => sum + part.length + layout.sep.length, 0);
}

// Tudo que sai sempre, com ou sem corte: cabecalho, linha de total do pivot e rodape.
function fixedLength(layout) {
  return layout.head.length + (layout.afterParts || '').length + layout.tail.length;
}

function layoutLength(layout) {
  return fixedLength(layout) + partsLength(layout);
}

function fitCount(layout, maxChars) {
  let used = 0;
  for (let i = 0; i < layout.parts.length; i++) {
    used += layout.parts[i].length + layout.sep.length;
    if (used > maxChars) return i;
  }
  return layout.parts.length;
}

/**
 * Monta o texto de um layout `{ head, parts, sep, afterParts, cutSep, tail, counts, noun }`
 * respeitando o teto: corta no limite de uma linha e diz quantos grupos/tickets ficaram
 * de fora (exibidos + nao exibidos = soma dos buckets; o total geral vai junto).
 * O teto vale para a saida inteira: cabecalho, linha de total e rodape sao descontados
 * do orcamento das linhas, entao a linha de "nao exibidos" nunca cai no hard cap global.
 */
function assembleWithinBudget(layout, total, maxChars) {
  const { head, parts, sep, afterParts = '', cutSep, tail, counts, noun } = layout;
  if (layoutLength(layout) <= maxChars) {
    return `${head}${parts.join(sep)}${afterParts}${tail}`;
  }
  const shown = fitCount(layout, maxChars - fixedLength(layout) - CUT_LINE_RESERVE);
  const hiddenTickets = sumCounts(counts.slice(shown));
  const cutLine = `${cutSep}… +${parts.length - shown} ${noun} não exibidos, somando ${hiddenTickets} tickets (total geral ${total})`;
  return `${head}${parts.slice(0, shown).join(sep)}${afterParts}${cutLine}${tail}`;
}

/**
 * Rich que estoura o teto sem verbosidade explicita sai em compact (com aviso) antes
 * de cortar; verbosidade explicita e respeitada e so corta.
 */
function renderBudgeted(build, { v, verbosityExplicit, total, maxChars = RESPONSE_ITEM_BUDGET }) {
  const layout = build(v);
  const autoCompact = v !== 'compact' && !verbosityExplicit && layoutLength(layout) > maxChars;
  if (!autoCompact) return assembleWithinBudget(layout, total, maxChars);
  const notice = `\n${AUTO_COMPACT_NOTICE}`;
  return `${assembleWithinBudget(build('compact'), total, maxChars - notice.length)}${notice}`;
}

function richTail(v) {
  const footerStr = footer(v);
  return footerStr ? `\n\n${footerStr}` : '\n';
}

function richHead({ unitLabel, dtSuffix, agg, filtersBlock, assumption }) {
  const filters = filtersBlock ? `${filtersBlock}\n` : '';
  return `${assumption}**📊 Tickets por ${unitLabel}**${dtSuffix} — total: ${agg}\n\n${filters}`;
}

function compactTail(filtersBlock) {
  return filtersBlock ? `\n${filtersBlock}` : '';
}

// ---------------------------------------------------------------------------
// Dimensoes: responsible / stage / client / status
// ---------------------------------------------------------------------------

function dimensionRows(buckets, groupBy) {
  const { idKey, perDesk } = DIMENSIONS[groupBy];
  const rows = buckets.map(b => ({
    name: nameOrNull(b.period),
    id: b[idKey] ?? null,
    desk: perDesk ? nameOrNull(b.desk) : null,
    count: Number(b.count) || 0
  }));
  // Estagio/status sao por mesa: com mais de uma mesa no resultado, agrupa por mesa.
  const multiDesk = perDesk && new Set(rows.map(r => r.desk)).size > 1;
  rows.sort((a, b) =>
    (multiDesk ? compareLabel(a.desk, b.desk) : 0) ||
    b.count - a.count ||
    compareLabel(a.name, b.name) ||
    compareId(a.id, b.id));
  return rows;
}

function dimensionCompactPart(row, perDesk, emptyLabel) {
  const desk = perDesk ? ` [${inlineName(row.desk ?? '—')}]` : '';
  const id = row.id === null ? '' : ` #${row.id}`;
  return `${inlineName(row.name ?? emptyLabel)}${desk}${id}:${row.count}`;
}

function dimensionRichPart(row, perDesk, emptyLabel) {
  const desk = perDesk ? ` ${escapeCell(row.desk ?? '—')} |` : '';
  return `| ${escapeCell(row.name ?? emptyLabel)} |${desk} ${row.id ?? '—'} | ${row.count} |`;
}

/**
 * Contagem por responsavel / estagio / cliente / status.
 * @param {object} p - { buckets, groupBy, unitLabel, agg, filtersBlock, assumption, v, verbosityExplicit }
 * @returns {string}
 */
function renderDimension({ buckets, groupBy, unitLabel, agg, filtersBlock, assumption, v, verbosityExplicit }) {
  const { column, perDesk } = DIMENSIONS[groupBy];
  const emptyLabel = `(sem ${unitLabel})`;
  const rows = dimensionRows(buckets, groupBy);
  const counts = rows.map(r => r.count);

  const build = (mode) => {
    if (mode === 'compact') {
      return {
        head: `Contagem por ${unitLabel} (total ${agg}): `,
        parts: rows.map(r => dimensionCompactPart(r, perDesk, emptyLabel)),
        sep: ' · ',
        cutSep: ' · ',
        tail: compactTail(filtersBlock),
        counts,
        noun: 'grupos'
      };
    }
    const header = perDesk
      ? `| ${column} | Mesa | ID | Quantidade |\n|---|---|---|---|\n`
      : `| ${column} | ID | Quantidade |\n|---|---|---|\n`;
    return {
      head: `${richHead({ unitLabel, dtSuffix: '', agg, filtersBlock, assumption })}${header}`,
      parts: rows.map(r => dimensionRichPart(r, perDesk, emptyLabel)),
      sep: '\n',
      cutSep: '\n\n',
      tail: richTail(mode),
      counts,
      noun: 'grupos'
    };
  };

  return renderBudgeted(build, { v, verbosityExplicit, total: agg });
}

// ---------------------------------------------------------------------------
// Periodo × responsavel
// ---------------------------------------------------------------------------

/**
 * Linhas (uma por responsible_id; sem ID, uma por nome — pessoas distintas nunca sao
 * somadas; sem ID e sem nome = "(sem responsável)") e colunas (periodos) do pivot. Com start/end, as
 * colunas sao a janela inteira (periodo sem ticket = coluna de zeros); periodo que a
 * API devolver fora da janela derivada e preservado no fim. Sem start/end, so os
 * periodos devolvidos.
 */
function responsibleKey(id, name) {
  if (id !== null) return `id:${id}`;
  return name === null ? 'none' : `name:${name}`;
}

function pivotModel(buckets, groupBy, startDatetime, endDatetime) {
  const unit = groupBy.split(',')[0];
  const rowsByKey = new Map();
  const seen = new Set();
  for (const bucket of buckets) {
    const period = singleLine(bucket.period);
    const count = Number(bucket.count) || 0;
    const id = bucket.responsible_id ?? null;
    const name = nameOrNull(bucket.responsible);
    const key = responsibleKey(id, name);
    seen.add(period);
    let row = rowsByKey.get(key);
    if (!row) {
      row = { id, name, total: 0, cells: new Map() };
      rowsByKey.set(key, row);
    }
    row.total += count;
    row.cells.set(period, (row.cells.get(period) || 0) + count);
  }
  const expected = temporalLabels(startDatetime, endDatetime, unit) || [];
  const expectedSet = new Set(expected);
  const extras = [...seen].filter(p => !expectedSet.has(p)).sort((a, b) => a.localeCompare(b));
  const rows = [...rowsByKey.values()].sort((a, b) =>
    b.total - a.total || compareLabel(a.name, b.name) || compareId(a.id, b.id));
  return { unit, periods: [...expected, ...extras], rows };
}

function responsibleLabel(row) {
  const id = row.id === null ? '' : ` #${row.id}`;
  return `${row.name ?? NO_RESPONSIBLE_LABEL}${id}`;
}

// So os periodos com ticket: periodo ausente na linha = 0 (a linha `Períodos:` da a serie).
function nonZeroCells(row, periods) {
  return periods.filter(p => row.cells.get(p)).map(p => `${p}:${row.cells.get(p)}`).join(PERIOD_SEP);
}

/**
 * Lista de rotulos da linha `Períodos:`. Janela com milhares de periodos nao cabe no
 * teto: lista ate PERIOD_LINE_MAX_CHARS e diz quantos ficaram de fora e qual e o ultimo
 * (as linhas por responsavel seguem trazendo todo periodo com ticket).
 */
function periodLineText(labels) {
  let used = 0;
  let shown = 0;
  while (shown < labels.length) {
    used += labels[shown].length + PERIOD_SEP.length;
    if (used > PERIOD_LINE_MAX_CHARS) break;
    shown++;
  }
  if (shown === labels.length) return labels.join(PERIOD_SEP);
  const omitted = `… +${labels.length - shown} períodos omitidos da lista (até ${labels.at(-1)})`;
  return [...labels.slice(0, shown), omitted].join(PERIOD_SEP);
}

// Granularidade maior sugerida quando a janela tem colunas demais para a tabela.
const COARSER_HINT = {
  day: 'use `group_by="week,responsible"` ou `"month,responsible"`, ou uma janela menor',
  week: 'use `group_by="month,responsible"` ou uma janela menor',
  month: 'use uma janela menor'
};

function pivotTableLayout({ model, header, v }) {
  const { periods, rows } = model;
  const columnTotals = periods.map(p => sumCounts(rows.map(r => r.cells.get(p) || 0)));
  const grandTotal = sumCounts(rows.map(r => r.total));
  const periodHeaders = periods.map(p => escapeCell(model.unit === 'week' ? isoWeekRangeLabel(p) : p));
  const divider = '---|'.repeat(periods.length + 1);
  const cellsOf = (row) => periods.map(p => row.cells.get(p) || 0).join(' | ');
  return {
    head: `${header}| Responsável | ${periodHeaders.join(' | ')} | Total |\n|---|${divider}\n`,
    parts: rows.map(r => `| ${escapeCell(responsibleLabel(r))} | ${cellsOf(r)} | ${r.total} |`),
    sep: '\n',
    afterParts: `\n| **Total** | ${columnTotals.join(' | ')} | ${grandTotal} |`,
    cutSep: '\n\n',
    tail: richTail(v),
    counts: rows.map(r => r.total),
    noun: 'responsáveis'
  };
}

function pivotLinesLayout({ model, header, unitLabel, agg, filtersBlock, mode }) {
  const { unit, periods, rows } = model;
  const periodLine = periodLineText(periods.map(p => (unit === 'week' ? isoWeekRangeLabel(p) : p)));
  const counts = rows.map(r => r.total);
  if (mode === 'compact') {
    return {
      head: `Contagem por ${unitLabel} (total ${agg}):\nPeríodos: ${periodLine}\n`,
      parts: rows.map(r => `${inlineName(responsibleLabel(r))} (total ${r.total}): ${nonZeroCells(r, periods)}`),
      sep: '\n',
      cutSep: '\n',
      tail: compactTail(filtersBlock),
      counts,
      noun: 'responsáveis'
    };
  }
  const notice = `⚠️ ${periods.length} períodos na janela (mais de ${MAX_PIVOT_COLUMNS}): sem tabela — cada linha traz só os períodos com ticket (período ausente = 0). Para a tabela pessoa × período, ${COARSER_HINT[unit]}.\n\n`;
  return {
    head: `${header}${notice}**Períodos:** ${periodLine}\n\n`,
    parts: rows.map(r => `- **${inlineName(responsibleLabel(r))}** (total ${r.total}): ${nonZeroCells(r, periods)}`),
    sep: '\n',
    cutSep: '\n',
    tail: richTail(mode),
    counts,
    noun: 'responsáveis'
  };
}

/**
 * Contagem por periodo × responsavel: pivot (linha = responsavel, coluna = periodo) no
 * rich com ate MAX_PIVOT_COLUMNS colunas; acima disso e no compact, linha `Períodos:` +
 * uma linha por responsavel so com os periodos nao-zero.
 * @param {object} p - { buckets, groupBy, unitLabel, dtSuffix, agg, filtersBlock, assumption,
 *   startDatetime, endDatetime, v, verbosityExplicit }
 * @returns {string}
 */
function renderPeriodResponsible({ buckets, groupBy, unitLabel, dtSuffix, agg, filtersBlock, assumption, startDatetime, endDatetime, v, verbosityExplicit }) {
  const model = pivotModel(buckets, groupBy, startDatetime, endDatetime);
  const header = richHead({ unitLabel, dtSuffix, agg, filtersBlock, assumption });

  const build = (mode) => {
    if (mode !== 'compact' && model.periods.length <= MAX_PIVOT_COLUMNS) {
      return pivotTableLayout({ model, header, v: mode });
    }
    return pivotLinesLayout({ model, header, unitLabel, agg, filtersBlock, mode });
  };

  return renderBudgeted(build, { v, verbosityExplicit, total: agg });
}

module.exports = {
  GROUP_BY_LABELS,
  GROUP_BY_VALUES,
  MAX_PIVOT_COLUMNS,
  groupByLabel,
  groupByKind,
  hasDateAxis,
  renderDimension,
  renderPeriodResponsible
};

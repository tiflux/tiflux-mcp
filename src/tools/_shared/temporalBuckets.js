/**
 * temporalBuckets.js — Zero-fill de buckets temporais (day/week/month) devolvidos
 * por GET /tickets?group_by=.
 *
 * A API omite período sem ticket (não devolve `{ period, count: 0 }`) — ver
 * `.docs/specs/2026-10-01-correcoes-dado-silencioso/README.md`. Sem zero-fill,
 * um buraco no meio da série é indistinguível de "não retornado" e, na
 * comparação de dois períodos (`get_tickets_comparison`), desalinha todas as
 * linhas seguintes por posição ordinal (BL-015).
 *
 * Fuso dos rótulos da janela: o **mesmo offset em que o usuário escreveu o
 * `start_datetime`** (não um fuso fixo). `-03:00` → calendário de Brasília (o
 * fuso em que a API agrupa — `Organization.time_zone`); `Z` ou data pura
 * (`YYYY-MM-DD`, que a API e o JS leem como UTC) → calendário UTC. Motivo
 * (revisão do PR #102): converter um limite "meia-noite UTC" para Brasília
 * jogava o início da janela na noite anterior (31/12 21h) e criava um
 * bucket-fantasma (`2025-12:0`) fora do range pedido — em
 * `get_tickets_comparison` isso deslocava por posição todos os Δ seguintes.
 * Bucket real que a API devolver fora da janela derivada (ex.: ticket de
 * 31/12 22h BRT com limite `...Z`) continua preservado no fim (regra "extras").
 *
 * Extraído de `src/tools/tickets/listTickets.js` (único consumidor até então;
 * `get_tickets_comparison` é o segundo, o que justifica a extração — regra do
 * CLAUDE.md: helper compartilhado só quando ≥3 (aqui, duplicação real entre
 * 2 consumidores da mesma regra de janela já motivou a extração por exigir
 * suportar `week` e `fillEmpty`, que só fazem sentido num lugar só).
 */

// Dia em ms — usado para iterar a janela em granularidade de dia (base de
// day e week) sem mutação de Date em condição de loop (mantém o fim do loop
// invariante-livre; datas inválidas produzem NaN e o loop simplesmente não roda).
const DAY_MS = 24 * 60 * 60 * 1000;

// Tetos de segurança contra tabela enorme (período sem fim explícito/absurdo):
// 'day' cobre pouco mais de 1 ano: igual ao código pré-existente.
const MAX_DAY_SPAN = 365;
// 'week': ~54 semanas (um ano ISO pode ter 53) — iterado em granularidade de
// dia e deduplicado por rótulo de semana.
const MAX_WEEK_DAY_SPAN = 54 * 7;

const MINUTE_MS = 60 * 1000;

// Offset explícito no fim de um ISO 8601: "Z" ou "±hh:mm" / "±hhmm" / "±hh".
const EXPLICIT_OFFSET_RE = /(?:Z|([+-])(\d{2}):?(\d{2})?)$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Offset (minutos a leste de UTC) em que o instante foi escrito — o "quadro"
 * de calendário que o usuário usou. `Z` e data pura → 0; `±hh:mm` → o próprio
 * offset; data-hora sem offset (o JS lê no fuso do processo) → offset do
 * processo naquele instante, para o rótulo bater com o que foi escrito.
 *
 * @param {string} dateStr
 * @returns {number|null} minutos, ou null se a string não for uma data válida
 */
function writtenOffsetMinutes(dateStr) {
  const str = String(dateStr).trim();
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  if (DATE_ONLY_RE.test(str)) return 0;
  if (str.includes('T') || str.includes(' ')) {
    const m = EXPLICIT_OFFSET_RE.exec(str);
    if (m) {
      if (!m[1]) return 0; // "Z"
      const sign = m[1] === '-' ? -1 : 1;
      return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
    }
  }
  return -parsed.getTimezoneOffset();
}

/**
 * Componentes de calendário (ano, mês 0-based, dia) de um instante num offset
 * fixo. Mês 0-based para espelhar `Date#getUTCMonth()`.
 */
function ymdAtOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * MINUTE_MS);
  return { y: shifted.getUTCFullYear(), m0: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/**
 * Rótulo de semana ISO-8601 (`IYYY-"W"IW`, ano ISO + semana com 2 dígitos),
 * idêntico ao `to_char` da API (ver `ticket.rb:413` na análise da spec).
 * Algoritmo padrão: semana contém a quinta-feira daquela semana; o ano ISO é
 * o ano dessa quinta-feira.
 *
 * @param {number} y - ano (calendário civil)
 * @param {number} m1 - mês 1-based
 * @param {number} d - dia do mês
 * @returns {string} ex.: "2026-W10"
 */
function isoWeekLabel(y, m1, d) {
  const date = new Date(Date.UTC(y, m1 - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // segunda=0 ... domingo=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // quinta-feira da semana
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((date - firstThursday) / (7 * DAY_MS));
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

function monthLabels(startY, startM0, endY, endM0) {
  const expected = [];
  const monthSpan = (endY - startY) * 12 + (endM0 - startM0);
  for (let i = 0; i <= monthSpan; i++) {
    // Date.UTC normaliza overflow de mes (ex: mes 13 → jan do ano seguinte)
    const cur = new Date(Date.UTC(startY, startM0 + i, 1));
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    expected.push(`${y}-${m}`);
  }
  return expected;
}

function dayLabels(startDayUtc, endDayUtc) {
  const expected = [];
  const daySpan = Math.min(Math.floor((endDayUtc - startDayUtc) / DAY_MS), MAX_DAY_SPAN);
  for (let i = 0; i <= daySpan; i++) {
    const cur = new Date(startDayUtc + i * DAY_MS);
    const y = cur.getUTCFullYear();
    const mo = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    expected.push(`${y}-${mo}-${d}`);
  }
  return expected;
}

function weekLabels(startDayUtc, endDayUtc) {
  const expected = [];
  const daySpan = Math.min(Math.floor((endDayUtc - startDayUtc) / DAY_MS), MAX_WEEK_DAY_SPAN);
  let lastLabel = null;
  for (let i = 0; i <= daySpan; i++) {
    const cur = new Date(startDayUtc + i * DAY_MS);
    const label = isoWeekLabel(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate());
    if (label !== lastLabel) {
      expected.push(label);
      lastLabel = label;
    }
  }
  return expected;
}

/**
 * Preenche períodos faltantes num array de buckets temporais com contagem 0.
 * Aplica-se a group_by 'month', 'day' e 'week' quando start/end são informados.
 * 'desk' (e qualquer outro group_by) retorna o array original.
 *
 * @param {Array<{period: string, count: number}>|null|undefined} buckets - buckets da API
 * @param {string} startDateStr - início da janela (ISO 8601)
 * @param {string} endDateStr - fim da janela (ISO 8601)
 * @param {string} groupBy - 'day' | 'week' | 'month' | 'desk'
 * @param {{ fillEmpty?: boolean, offsetFrom?: string }} [options] - `fillEmpty: true`
 *   faz uma lista vazia virar a janela inteira zerada (default: lista vazia volta
 *   crua — comportamento de `list_tickets`, que trata `[]` no diagnóstico de zeros).
 *   `offsetFrom`: string cujo offset escrito define o quadro de calendário (default:
 *   `startDateStr`). `get_tickets_comparison` passa o `start_datetime` do usuário
 *   nos dois lados, porque a janela de comparação automática (`previousPeriod`)
 *   sai sempre em `Z` e precisa ser rotulada no mesmo quadro da janela atual.
 * @returns {Array<{period: string, count: number}>}
 */
/**
 * Rótulos esperados (`YYYY-MM` / `IYYY-Www` / `YYYY-MM-DD`) de uma janela, no
 * quadro de calendário do offset escrito em `offsetFrom` (default: o próprio
 * início). Mesma regra de rótulo/fuso usada pelo zero-fill — exportada para
 * `previousCalendarPeriod` (periodMath) contar quantos períodos a janela tem.
 *
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @param {string} groupBy - 'day' | 'week' | 'month' (outro → null)
 * @param {{ offsetFrom?: string }} [options]
 * @returns {string[]|null} null se groupBy não temporal ou datas inválidas
 */
function temporalLabels(startDateStr, endDateStr, groupBy, options = {}) {
  const { offsetFrom = startDateStr } = options;
  if (!startDateStr || !endDateStr) return null;
  if (groupBy !== 'month' && groupBy !== 'day' && groupBy !== 'week') return null;

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const offsetMinutes = writtenOffsetMinutes(offsetFrom) ?? 0;
  const startYMD = ymdAtOffset(start, offsetMinutes);
  const endYMD = ymdAtOffset(end, offsetMinutes);

  if (groupBy === 'month') {
    return monthLabels(startYMD.y, startYMD.m0, endYMD.y, endYMD.m0);
  }
  const startDayUtc = Date.UTC(startYMD.y, startYMD.m0, startYMD.d);
  const endDayUtc = Date.UTC(endYMD.y, endYMD.m0, endYMD.d);
  return groupBy === 'day' ? dayLabels(startDayUtc, endDayUtc) : weekLabels(startDayUtc, endDayUtc);
}

/**
 * Preenche períodos faltantes num array de buckets temporais com contagem 0.
 * Aplica-se a group_by 'month', 'day' e 'week' quando start/end são informados.
 * 'desk' (e qualquer outro group_by) retorna o array original.
 *
 * @param {Array<{period: string, count: number}>|null|undefined} buckets - buckets da API
 * @param {string} startDateStr - início da janela (ISO 8601)
 * @param {string} endDateStr - fim da janela (ISO 8601)
 * @param {string} groupBy - 'day' | 'week' | 'month' | 'desk'
 * @param {{ fillEmpty?: boolean, offsetFrom?: string }} [options] - `fillEmpty: true`
 *   faz uma lista vazia virar a janela inteira zerada (default: lista vazia volta
 *   crua — comportamento de `list_tickets`, que trata `[]` no diagnóstico de zeros).
 *   `offsetFrom`: string cujo offset escrito define o quadro de calendário (default:
 *   `startDateStr`). `get_tickets_comparison` passa o `start_datetime` do usuário
 *   nos dois lados, para a janela de comparação (automática ou informada) ser
 *   rotulada no mesmo quadro da janela atual.
 * @returns {Array<{period: string, count: number}>}
 */
function zeroFillTemporalBuckets(buckets, startDateStr, endDateStr, groupBy, options = {}) {
  const { fillEmpty = false, offsetFrom = startDateStr } = options;

  if (!buckets) return buckets;
  if (buckets.length === 0 && !fillEmpty) return buckets;

  const expected = temporalLabels(startDateStr, endDateStr, groupBy, { offsetFrom });
  if (!expected) return buckets;

  if (expected.length === 0) return buckets;

  const existingMap = new Map(buckets.map(b => [String(b.period), b.count]));
  const filled = expected.map(period => ({ period, count: existingMap.get(period) ?? 0 }));

  // Nunca descartar bucket que a API devolveu: se algum periodo real cair fora da
  // faixa derivada (ex: rotulo em fuso diferente do usado no calculo), ele e
  // preservado no fim da lista em vez de desaparecer da tabela.
  const expectedSet = new Set(expected);
  const extras = buckets.filter(b => !expectedSet.has(String(b.period)));
  if (extras.length > 0) {
    return [...filled, ...extras.map(b => ({ period: String(b.period), count: b.count }))];
  }

  return filled;
}

module.exports = { zeroFillTemporalBuckets, temporalLabels, isoWeekLabel, writtenOffsetMinutes };

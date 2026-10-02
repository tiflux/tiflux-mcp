/**
 * periodMath.js — Helpers de aritmética de períodos (funções puras, sem I/O).
 *
 * Usadas por get_tickets_comparison para calcular o período de comparação
 * padrão e validar os períodos informados pelo modelo:
 *  - `previousCalendarPeriod` (day/week/month): mesmo número de períodos,
 *    alinhado ao calendário (Fase 4 da spec correcoes-dado-silencioso);
 *  - `previousPeriod` (desk e get_*_feedback_report): mesma duração em ms.
 *
 * Dependências: temporalBuckets (mesma regra de rótulo e de fuso do zero-fill).
 */

const { temporalLabels, writtenOffsetMinutes } = require('./temporalBuckets');

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Calcula o período de comparação padrão: imediatamente anterior ao período
 * informado, com a mesma duração em milissegundos.
 *
 * Regras:
 *  - compare_end   = start − 1 segundo (sem sobreposição)
 *  - duration      = end − start  (em ms)
 *  - compare_start = compare_end − duration
 *
 * Sem snapping de calendário, sem dependência de "hoje".
 *
 * @param {string} startIso - ISO 8601 do início do período principal
 * @param {string} endIso   - ISO 8601 do fim do período principal
 * @returns {{ start: string, end: string }} - datas ISO do período de comparação
 */
function previousPeriod(startIso, endIso) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const durationMs = endMs - startMs;

  const compareEndMs = startMs - 1000; // start − 1s
  const compareStartMs = compareEndMs - durationMs;

  return {
    start: new Date(compareStartMs).toISOString(),
    end: new Date(compareEndMs).toISOString()
  };
}

/**
 * Formata um instante no offset fixo informado, preservando o quadro que o
 * usuário escreveu: offset 0 → sufixo `Z`; demais → `±hh:mm`. Milissegundos só
 * aparecem quando diferentes de zero.
 */
function isoAtOffset(ms, offsetMinutes) {
  const wall = new Date(ms + offsetMinutes * MINUTE_MS).toISOString().replace('.000Z', 'Z');
  if (offsetMinutes === 0) return wall;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${wall.slice(0, -1)}${sign}${hh}:${mm}`;
}

/**
 * Recua `n` meses de calendário o instante "de parede" `wallMs` (UTC fields =
 * relógio no offset escrito), com clamp de fim de mês (31/03 − 1 mês = 28/02).
 */
function minusCalendarMonths(wallMs, n) {
  const wall = new Date(wallMs);
  const y = wall.getUTCFullYear();
  const targetM0 = wall.getUTCMonth() - n;
  const lastDay = new Date(Date.UTC(y, targetM0 + 1, 0)).getUTCDate();
  const day = Math.min(wall.getUTCDate(), lastDay);
  return Date.UTC(
    y, targetM0, day,
    wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds()
  );
}

/**
 * Quantidade de dias/semanas ISO entre dois instantes "de parede", SEM o teto
 * de segurança de `temporalLabels` (MAX_DAY_SPAN / MAX_WEEK_DAY_SPAN). O teto
 * serve para não gerar tabela enorme no zero-fill; usado aqui ele encurtaria a
 * janela anterior (ex.: 2 anos por dia → anterior de só 366 dias, Δ errado).
 * 1970-01-01 é quinta-feira: (dia + 3) / 7 indexa semanas começando na segunda.
 */
function uncappedDayWeekCount(startWallMs, endWallMs, groupBy) {
  const startDay = Math.floor(startWallMs / DAY_MS);
  const endDay = Math.floor(endWallMs / DAY_MS);
  if (groupBy === 'week') return Math.floor((endDay + 3) / 7) - Math.floor((startDay + 3) / 7) + 1;
  return endDay - startDay + 1;
}

/**
 * Período de comparação padrão para group_by temporal (day/week/month): o
 * imediatamente anterior com o MESMO NÚMERO de períodos (N = quantidade de
 * rótulos da janela atual), alinhado ao calendário no fuso em que o usuário
 * escreveu as datas. Corrige o desalinhamento de `previousPeriod` (mesma
 * duração em ms), em que "abr–set" virava "30/09–31/03" e o mês parcial
 * `2025-09` escorregava os pares uma posição.
 *
 * Regras (N = rótulos da janela atual):
 *  - month: compare_start = start − N meses de calendário (clamp de fim de mês);
 *           compare_end   = (end + 1s) − N meses − 1s, limitado a start − 1s
 *           (o +1s evita o rollover/perda do dia 31; mês parcial nas bordas
 *           mantém a mesma duração e o mesmo número de rótulos).
 *  - week:  janela inteira recuada 7·N dias; day: recuada N dias. Dias/semanas
 *           têm duração fixa, então o recuo preserva o dia da semana e o número
 *           de rótulos mesmo com janela começando no meio da semana (com janela
 *           de semanas/dias cheios, compare_end = start − 1s).
 *  - compare_end nunca passa de start − 1s (sem sobreposição).
 *  - A saída preserva o offset escrito em `offsetFrom` (default: start), para o
 *    zero-fill do lado anterior usar o mesmo quadro de calendário.
 *
 * groupBy não temporal ou datas inválidas → cai em `previousPeriod`.
 *
 * @param {string} startIso
 * @param {string} endIso
 * @param {'day'|'week'|'month'|string} groupBy
 * @param {{ offsetFrom?: string }} [options]
 * @returns {{ start: string, end: string }}
 */
function previousCalendarPeriod(startIso, endIso, groupBy, options = {}) {
  const { offsetFrom = startIso } = options;
  const labels = temporalLabels(startIso, endIso, groupBy, { offsetFrom });
  if (!labels || labels.length === 0) return previousPeriod(startIso, endIso);

  const n = labels.length;
  const offsetMinutes = writtenOffsetMinutes(offsetFrom) ?? 0;
  const offsetMs = offsetMinutes * MINUTE_MS;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const latestEndMs = startMs - SECOND_MS;

  let compareStartMs;
  let compareEndMs;
  if (groupBy === 'month') {
    compareStartMs = minusCalendarMonths(startMs + offsetMs, n) - offsetMs;
    // end + 1s recua N meses e volta 1s: "30/09 23:59:59" vira "31/03 23:59:59"
    // (sem rollover nem perda do dia 31) e janela parcial mantém a mesma
    // duração/quantidade de rótulos (01/09–01/10 00:00 → 01/07–01/08 00:00).
    compareEndMs = Math.min(minusCalendarMonths(endMs + offsetMs + SECOND_MS, n) - offsetMs - SECOND_MS, latestEndMs);
  } else {
    const units = uncappedDayWeekCount(startMs + offsetMs, endMs + offsetMs, groupBy);
    const shiftMs = (groupBy === 'week' ? 7 : 1) * units * DAY_MS;
    compareStartMs = startMs - shiftMs;
    compareEndMs = Math.min(endMs - shiftMs, latestEndMs);
  }

  return {
    start: isoAtOffset(compareStartMs, offsetMinutes),
    end: isoAtOffset(compareEndMs, offsetMinutes)
  };
}

/**
 * Valida se um par de datas ISO forma um período válido.
 *
 * Critérios:
 *  - ambas precisam ser parseáveis como Date (não NaN)
 *  - end > start (período não pode ser invertido ou de duração zero)
 *
 * @param {string} startIso - ISO 8601 do início
 * @param {string} endIso   - ISO 8601 do fim
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePeriod(startIso, endIso) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (Number.isNaN(startMs)) {
    return { valid: false, message: `Data inválida: "${startIso}" não é um ISO 8601 válido.` };
  }
  if (Number.isNaN(endMs)) {
    return { valid: false, message: `Data inválida: "${endIso}" não é um ISO 8601 válido.` };
  }
  if (endMs <= startMs) {
    return { valid: false, message: `end_datetime deve ser posterior a start_datetime (end: ${endIso}, start: ${startIso}).` };
  }
  return { valid: true };
}

module.exports = { previousPeriod, previousCalendarPeriod, validatePeriod };

// "HH:MM" com minutos 00–59 (sem flag /g — exec() não guarda lastIndex entre chamadas)
const HHMM_PATTERN = /^(\d+):([0-5]\d)$/;

/**
 * Calcula a duração entre init_time e end_time em minutos.
 * Retorna 0 se qualquer tempo for inválido ou se end <= init.
 * @param {string} initTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @returns {number} duração em minutos (>= 0)
 */
function durationMinutes(initTime, endTime) {
  // Valida ambos antes de calcular — tempo inválido em qualquer extremo → 0
  const initMatch = typeof initTime === 'string' ? HHMM_PATTERN.exec(initTime) : null;
  const endMatch = typeof endTime === 'string' ? HHMM_PATTERN.exec(endTime) : null;
  if (!initMatch || !endMatch) return 0;
  const initMin = Number.parseInt(initMatch[1], 10) * 60 + Number.parseInt(initMatch[2], 10);
  const endMin = Number.parseInt(endMatch[1], 10) * 60 + Number.parseInt(endMatch[2], 10);
  return Math.max(0, endMin - initMin);
}

/**
 * Formata minutos totais como "HH:MM" (ex: 90 → "1:30").
 * @param {number} totalMinutes
 * @returns {string}
 */
function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

module.exports = { durationMinutes, formatMinutes };

/**
 * periodMath.js — Helpers de aritmética de períodos (funções puras, sem I/O).
 *
 * Usadas por get_tickets_comparison para calcular o período de comparação
 * padrão (imediatamente anterior de mesma duração) e validar os períodos
 * informados pelo modelo.
 *
 * Dependências: nenhuma (math puro em ms).
 */

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

module.exports = { previousPeriod, validatePeriod };

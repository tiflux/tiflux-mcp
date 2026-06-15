/**
 * Validators compartilhados entre slices de tools MCP.
 *
 * Filosofia: validar inputs no começo do slice, throw Error com mensagem
 * especifica. Cada slice faz suas proprias checks — helpers aqui so para
 * patterns que aparecem em 3+ slices.
 */

function requireField(args, field, message = null) {
  const value = args && args[field];
  if (value === undefined || value === null || value === '') {
    throw new Error(message || `${field} é obrigatório`);
  }
  return value;
}

/**
 * Coage `value` para inteiro positivo de forma ESTRITA: aceita um number já
 * inteiro (>= 0) ou uma string só-dígitos; rejeita NaN, frações e strings
 * formatadas. Existe para write ops nunca enviarem valor corrompido à API por
 * coerção silenciosa de input externo — `parseInt('+55 11 99999-9999')` daria
 * `55` (truncado, não NaN) e `parseInt('abc')` daria NaN que vira `null` no
 * JSON. Lança Error com mensagem específica do campo.
 */
function parseIntStrict(value, field) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  throw new Error(`${field} deve ser um número inteiro válido`);
}

/** requireField + parseIntStrict num passo só (campo obrigatório e numérico). */
function requireIntField(args, field, message = null) {
  requireField(args, field, message);
  return parseIntStrict(args[field], field);
}

module.exports = { requireField, parseIntStrict, requireIntField };

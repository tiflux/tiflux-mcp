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

module.exports = { requireField };

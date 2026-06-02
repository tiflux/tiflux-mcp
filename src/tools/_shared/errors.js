/**
 * Error response helpers para slices de tools MCP.
 *
 * Cada slice tem sua propria mensagem contextual — este helper nao tenta
 * centralizar o texto do erro, so o shape da resposta MCP.
 *
 * Usage:
 *   return apiErrorResponse(`**❌ Erro ao buscar ticket #${n}**\n\n` +
 *                           `**Código:** ${response.status}\n...`);
 */

const { textResponse } = require('./response');

function apiErrorResponse(text) {
  return textResponse(text);
}

module.exports = { apiErrorResponse };

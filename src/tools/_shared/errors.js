/**
 * Error response helpers para slices de tools MCP.
 *
 * Cada slice tem sua propria mensagem contextual — este helper nao tenta
 * centralizar o texto do erro, so o shape da resposta MCP.
 *
 * `isError: true` e o contrato MCP para "a tool nao conseguiu executar a
 * operacao pedida" (erro da API v2, excecao interna, validacao, resolucao
 * ambigua/ausente). Resultado vazio de uma operacao que funcionou NAO e erro.
 *
 * Usage:
 *   return errorResponse(`**❌ Erro ao buscar ticket #${n}**\n\n` +
 *                        `**Código:** ${response.status}\n...`);
 */

function errorResponse(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// Alias mantido por compatibilidade com usos existentes.
const apiErrorResponse = errorResponse;

module.exports = { errorResponse, apiErrorResponse };

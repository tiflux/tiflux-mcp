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

/**
 * Resposta de erro para excecoes internas (bloco catch).
 * Padroniza o rodape "Erro: <msg> / Verifique sua conexao", recebendo apenas
 * o titulo contextual de cada slice.
 *
 * @param {string} title - titulo em Markdown (ex: "**❌ Erro interno ao remover arquivo do ticket #123**")
 * @param {Error} error - excecao capturada
 */
function internalErrorResponse(title, error) {
  return errorResponse(
    `${title}\n\n` +
    `**Erro:** ${error.message}\n\n` +
    `*Verifique sua conexão e configurações da API.*`
  );
}

/**
 * Resposta de erro para falha vinda da API v2 (`response.error` presente).
 * Padroniza o corpo "Código / Mensagem"; titulo e cauda contextual variam por slice.
 *
 * @param {string} title - titulo em Markdown (ex: "**❌ Erro ao buscar cliente #123**")
 * @param {{status: number|string, error: string}} response - resposta da API com erro
 * @param {string} [tail] - dica contextual em Markdown (ex: "*Verifique se o cliente existe.*")
 */
function apiFailureResponse(title, response, tail = '') {
  return errorResponse(
    `${title}\n\n` +
    `**Código:** ${response.status}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    `${tail}`
  );
}

module.exports = { errorResponse, apiErrorResponse, internalErrorResponse, apiFailureResponse };

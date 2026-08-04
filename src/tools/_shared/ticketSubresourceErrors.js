/**
 * Tratamento de erro compartilhado pelos slices de sub-recurso de ticket
 * (`GET /tickets/{ticket_number}/<sub-recurso>`).
 *
 * Os endpoints de sub-recurso de ticket compartilham exatamente a mesma
 * taxonomia de erro (403 com `error_code` 40301/40304, 404 de ticket
 * inexistente, 422 de parametro invalido e o ramo generico), variando apenas o
 * rotulo do recurso na mensagem. Este helper concentra esse bloco — antes
 * copiado slice a slice — e usa `extractApiErrorCode` para ler o `error_code`
 * do shape REAL do transporte (a string `response.error`), nao de um
 * `response.data` que `TiFluxAPI` nunca popula em erro.
 */

const { errorResponse, extractApiErrorCode } = require('./errors');

/** Usuario sem permissao para a operacao. */
const ERROR_CODE_NO_PERMISSION = 40301;
/** Plano sem licenca ativa do modulo de Tickets. */
const ERROR_CODE_NO_TICKETS_LICENSE = 40304;

/**
 * @param {{error?: string, status?: number|string, data?: object}} response - resposta com erro da API v2
 * @param {string|number} ticketNumber - numero do ticket consultado
 * @param {object} options
 * @param {string} options.resourceLabel - rotulo do sub-recurso (ex: "tipos de atendimento", "estágios/SLAs")
 * @param {string} [options.validationHint] - dica exibida em 422; quando ausente, 422 cai no ramo generico
 * @returns {{content: Array, isError: true}} resposta MCP de erro
 */
function ticketSubresourceErrorResponse(response, ticketNumber, { resourceLabel, validationHint = '' } = {}) {
  const status = response?.status;
  const errorCode = extractApiErrorCode(response);

  if (status === 403 && errorCode === ERROR_CODE_NO_PERMISSION) {
    return errorResponse(
      `**🚫 Sem permissão para acessar ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
      `*Seu usuário não tem permissão para esta operação. Contate o administrador.*`
    );
  }

  if (status === 403 && errorCode === ERROR_CODE_NO_TICKETS_LICENSE) {
    return errorResponse(
      `**🔒 Sem licença de Tickets**\n\n` +
      `*Seu plano TiFlux não possui licença ativa para o módulo de Tickets.*`
    );
  }

  if (status === 404) {
    return errorResponse(
      `**🔍 Ticket #${ticketNumber} não encontrado**\n\n` +
      `*Verifique se o número do ticket está correto.*`
    );
  }

  if (status === 422 && validationHint) {
    return errorResponse(
      `**⚠️ Parâmetro inválido ao buscar ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
      `${validationHint}\n\n` +
      `**Mensagem:** ${response?.error}`
    );
  }

  return errorResponse(
    `**❌ Erro ao buscar ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
    `**Código:** ${status}\n` +
    `**Mensagem:** ${response?.error}\n\n` +
    `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
  );
}

module.exports = {
  ticketSubresourceErrorResponse,
  ERROR_CODE_NO_PERMISSION,
  ERROR_CODE_NO_TICKETS_LICENSE
};

/**
 * Helper de erros das operações de ESCRITA em chat (update/send_message/archive).
 *
 * Centraliza os blocos 403/404/422/genérico que antes eram copiados nos 3 slices
 * (duplicação flagrada pelo SonarQube). NÃO é um slice — não é registrado como tool;
 * o agregador `chats/index.js` lista os slices explicitamente.
 *
 * `label` é o verbo da ação ("atualizar chat", "enviar mensagem", "finalizar chat");
 * `id` aparece quando presente; `notFoundHint`/`validationHint` dão a dica específica
 * de cada slice. O ramo 404 só é exercido por slices que operam sobre um chat existente.
 */

const { errorResponse } = require('../_shared/errors');

function chatWriteApiError(response, { label, id, notFoundHint, validationHint } = {}) {
  const code = response.status;
  const idLine = id !== undefined ? `**ID:** ${id}\n` : '';

  if (code === 404) {
    return errorResponse(
      `**Chat não encontrado**\n\n` +
      `${idLine}\n` +
      `*${notFoundHint}*`
    );
  }
  if (code === 403) {
    return errorResponse(
      `**Sem permissão para ${label}**\n\n` +
      `**Código:** 403\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*Verifique se sua conta tem permissão ou licença para gerenciar chats.*`
    );
  }
  if (code === 422) {
    return errorResponse(
      `**Erro de validação ao ${label}**\n\n` +
      `${idLine}**Código:** 422\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*${validationHint}*`
    );
  }
  return errorResponse(
    `**❌ Erro ao ${label}**\n\n` +
    `${idLine}**Código:** ${code}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    `*Verifique sua conexão e configurações da API.*`
  );
}

module.exports = { chatWriteApiError };

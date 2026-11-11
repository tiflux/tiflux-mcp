/**
 * Helper de erros das operações de ESCRITA em chat (update/send_message/archive/cancel).
 *
 * Centraliza os blocos 403/404/422/genérico que antes eram copiados nos 3 slices
 * (duplicação flagrada pelo SonarQube). NÃO é um slice — não é registrado como tool;
 * o agregador `chats/index.js` lista os slices explicitamente.
 *
 * `label` é o verbo da ação ("atualizar chat", "enviar mensagem", "finalizar chat");
 * `id` aparece quando presente; `notFoundHint`/`validationHint` dão a dica específica
 * de cada slice; `forbiddenHint` (opcional) troca a dica do 403 — sem ele, vale o texto
 * genérico de permissão. O ramo 404 só é exercido por slices que operam sobre um chat existente.
 * `alreadyCanceledHint` (opcional) troca a dica do 422 "já cancelado" (usado pelo cancel_chat).
 */

const { errorResponse, extractApiErrorCode } = require('../_shared/errors');

// H22: 42203 ("This conversation is no longer active") é devolvido quando o
// chat já foi encerrado/cancelado — mensagem específica em vez do validationHint
// genérico do slice (que normalmente orienta sobre OUTRO tipo de erro de campo).
const CHAT_INACTIVE_ERROR_CODE = 42203;
const CHAT_INACTIVE_TEXT = 'no longer active';
const USER_OFFLINE_TEXT = 'User is offline';
// 42202 do PUT /chats/{id}/cancel: detail.archived = ["This conversation has already been canceled"].
// Casa a chave `"archived"` do JSON bruto + o texto (e nao a substring solta no corpo
// inteiro): um 422 de send/update que ecoe conteudo do usuario com "already been
// canceled" nao vira "Chat já cancelado" — no eco, as aspas chegam escapadas (\").
const CHAT_ALREADY_CANCELED_PATTERN = /"archived"\s*:\s*\[[^\]]*already been canceled/;
const DEFAULT_FORBIDDEN_HINT = 'Verifique se sua conta tem permissão ou licença para gerenciar chats.';

function chatWriteApiError(response, { label, id, notFoundHint, validationHint, forbiddenHint, alreadyCanceledHint } = {}) {
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
      `*${forbiddenHint || DEFAULT_FORBIDDEN_HINT}*`
    );
  }
  if (code === 422) {
    const errorText = typeof response.error === 'string' ? response.error : '';
    const errorCode = extractApiErrorCode(response);

    if (CHAT_ALREADY_CANCELED_PATTERN.test(errorText)) {
      const canceledHint = alreadyCanceledHint || `Este chat foi cancelado — não é possível ${label} nele.`;
      return errorResponse(
        `**Chat já cancelado**\n\n` +
        `${idLine}**Código:** 422\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*${canceledHint}*`
      );
    }

    if (errorCode === CHAT_INACTIVE_ERROR_CODE || errorText.includes(CHAT_INACTIVE_TEXT)) {
      return errorResponse(
        `**Chat já encerrado**\n\n` +
        `${idLine}**Código:** 422\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Este chat não está mais ativo — não é possível ${label} nele.*`
      );
    }

    if (errorText.includes(USER_OFFLINE_TEXT)) {
      return errorResponse(
        `**Erro de validação ao ${label}**\n\n` +
        `${idLine}**Código:** 422\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Fique online no chat (status do atendente) antes de operar via API.*`
      );
    }

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

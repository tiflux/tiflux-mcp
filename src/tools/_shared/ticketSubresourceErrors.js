/**
 * Tratamento de erro compartilhado pelos slices de sub-recurso de ticket
 * (`/tickets/{ticket_number}/<sub-recurso>` — leitura e escrita; o verbo exibido
 * nas mensagens vem de `options.action`, default "buscar").
 *
 * Os endpoints de sub-recurso de ticket compartilham exatamente a mesma
 * taxonomia de erro (403 com `error_code` 40301/40304, 404 de ticket
 * inexistente, 422 de parametro invalido e o ramo generico), variando apenas o
 * rotulo do recurso na mensagem. Este helper concentra esse bloco — antes
 * copiado slice a slice — e usa `extractApiErrorCode` para ler o `error_code`
 * do shape REAL do transporte (a string `response.error`), nao de um
 * `response.data` que `TiFluxAPI` nunca popula em erro.
 */

const { errorResponse, extractApiErrorCode, extractApiErrorDetail } = require('./errors');

/** Usuario sem permissao para a operacao. */
const ERROR_CODE_NO_PERMISSION = 40301;
/** Plano sem licenca ativa do modulo de Tickets. */
const ERROR_CODE_NO_TICKETS_LICENSE = 40304;

/** Mensagem da API v2 para ticket inexistente (`detail.error` do 404 40401). */
const TICKET_NOT_FOUND_PATTERN = /Couldn't find (ServiceDesk::)?Ticket\b/i;

/** Dica padrao do 404 de ticket. */
const TICKET_NOT_FOUND_HINT = 'Confira o número do ticket com list_tickets e repita a chamada.';

/**
 * Mensagens do `detail` de um 404 (H22). O transporte expoe `response.detail`
 * (ex.: `{ error: ["field index 999 does not exist"] }`, `{ desk_id: ["Not Found!"] }`).
 * @returns {Array<{field: string, message: string}>} vazio quando nao ha detail
 */
function notFoundDetailEntries(response) {
  const detail = extractApiErrorDetail(response);
  if (!detail) return [];
  return Object.entries(detail).flatMap(([field, msgs]) =>
    [msgs].flat().filter(m => m !== null && m !== undefined && m !== '').map(m => ({ field, message: String(m) }))
  );
}

/**
 * Texto do `detail` de um 404 quando ele aponta OUTRO recurso que nao o ticket
 * (checklist, indice de campo, resposta, arquivo, mesa). `null` quando o 404 e do
 * proprio ticket ou nao traz detail — o chamador mantem a mensagem de ticket.
 * @returns {string|null} ex.: "field index 999 does not exist" ou "desk_id: Not Found!"
 */
function otherResourceNotFoundDetail(response) {
  if (isTicketNotFoundDetail(response)) return null;
  return notFoundDetailText(response);
}

/** Marcador do trecho SQL que o `RecordNotFound` de busca escopada anexa a mensagem (" [WHERE ...]"). */
const SQL_SCOPE_MARKER = '[WHERE ';

/** Teto do texto de `detail` repassado ao cliente (corta mensagem crua longa da API). */
const MAX_DETAIL_LENGTH = 300;

/** Limpa uma mensagem crua da API antes de exibir: tira o trecho SQL e limita o tamanho. */
function sanitizeDetailMessage(message) {
  const sqlAt = message.indexOf(SQL_SCOPE_MARKER);
  const cleaned = (sqlAt === -1 ? message : message.slice(0, sqlAt)).trim();
  return cleaned.length > MAX_DETAIL_LENGTH ? `${cleaned.slice(0, MAX_DETAIL_LENGTH)}…` : cleaned;
}

/**
 * Texto de todas as mensagens do `detail` de um 404 (`campo: msg`; o campo generico
 * `error` sai so com a mensagem). `null` sem detail. Cada mensagem passa por
 * `sanitizeDetailMessage` (sem trecho SQL, tamanho limitado).
 */
function notFoundDetailText(response) {
  const entries = notFoundDetailEntries(response)
    .map(({ field, message }) => ({ field, message: sanitizeDetailMessage(message) }))
    .filter(({ message }) => message !== '');
  if (!entries.length) return null;
  return entries.map(({ field, message }) => (field === 'error' ? message : `${field}: ${message}`)).join('; ');
}

/** O `detail` do 404 diz que o TICKET nao existe ("Couldn't find ServiceDesk::Ticket with ..."). */
function isTicketNotFoundDetail(response) {
  return notFoundDetailEntries(response).some(({ message }) => TICKET_NOT_FOUND_PATTERN.test(message));
}

/**
 * @param {{error?: string, status?: number|string, data?: object}} response - resposta com erro da API v2
 * @param {string|number} ticketNumber - numero do ticket consultado
 * @param {object} options
 * @param {string} options.resourceLabel - rotulo do sub-recurso (ex: "tipos de atendimento", "estágios/SLAs")
 * @param {string} [options.validationHint] - dica exibida em 422; quando ausente, 422 cai no ramo generico
 * @param {string} [options.action='buscar'] - verbo da operacao usado nas mensagens de 422 e generica.
 *   Default "buscar" (leitura); slices de escrita passam "atualizar" para a mensagem nao mentir
 *   sobre o que falhou (um PUT nao "busca" nada).
 * @param {string} [options.permissionHint] - dica extra anexada a mensagem do 403 `40301`
 *   (ex.: quais permissoes liberam o acesso). Ausente, o texto do 40301 nao muda (retrocompativel).
 * @param {string} [options.notFoundHint] - `Como resolver` do 404 cujo `detail` aponta outro recurso
 *   (ex.: checklist/indice inexistente); ausente, o 404 desse tipo sai so com o `Detalhes`.
 * @returns {{content: Array, isError: true}} resposta MCP de erro
 */
function ticketSubresourceErrorResponse(
  response,
  ticketNumber,
  { resourceLabel, validationHint = '', action = 'buscar', permissionHint = '', notFoundHint = '' } = {}
) {
  const status = response?.status;
  const errorCode = extractApiErrorCode(response);

  if (status === 403 && errorCode === ERROR_CODE_NO_PERMISSION) {
    return errorResponse(
      `**🚫 Sem permissão para acessar ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
      `*Seu usuário não tem permissão para esta operação. Contate o administrador.*` +
      (permissionHint ? `\n\n${permissionHint}` : '')
    );
  }

  if (status === 403 && errorCode === ERROR_CODE_NO_TICKETS_LICENSE) {
    return errorResponse(
      `**🔒 Sem licença de Tickets**\n\n` +
      `*Seu plano TiFlux não possui licença ativa para o módulo de Tickets.*`
    );
  }

  if (status === 404) {
    const otherDetail = otherResourceNotFoundDetail(response);
    if (otherDetail) {
      return errorResponse(
        `**🔍 Não encontrado ao ${action} ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
        `**Detalhes:** ${otherDetail}\n\n` +
        (notFoundHint ? `**Como resolver:** ${notFoundHint}\n\n` : '') +
        `*A API apontou como inexistente o item indicado acima. Se a mensagem citar o próprio ticket, confira o número com list_tickets.*`
      );
    }
    return errorResponse(
      `**🔍 Ticket #${ticketNumber} não encontrado**\n\n` +
      `*Verifique se o número do ticket está correto.*\n\n` +
      `**Como resolver:** ${TICKET_NOT_FOUND_HINT}`
    );
  }

  if (status === 422 && validationHint) {
    return errorResponse(
      `**⚠️ Parâmetro inválido ao ${action} ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
      `${validationHint}\n\n` +
      `**Mensagem:** ${response?.error}`
    );
  }

  return errorResponse(
    `**❌ Erro ao ${action} ${resourceLabel} do ticket #${ticketNumber}**\n\n` +
    `**Código:** ${status}\n` +
    `**Mensagem:** ${response?.error}\n\n` +
    `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
  );
}

module.exports = {
  ticketSubresourceErrorResponse,
  otherResourceNotFoundDetail,
  notFoundDetailText,
  isTicketNotFoundDetail,
  TICKET_NOT_FOUND_HINT,
  ERROR_CODE_NO_PERMISSION,
  ERROR_CODE_NO_TICKETS_LICENSE
};

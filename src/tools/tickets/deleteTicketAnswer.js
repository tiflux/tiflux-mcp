/**
 * Slice: delete_ticket_answer — remove uma resposta de um ticket.
 *
 * Endpoint: DELETE /tickets/{ticket_number}/answers/{id} (via api.deleteTicketAnswer).
 * Trata 204 (sucesso sem corpo), 403 (so o autor apaga), 404 (ticket, resposta ou ja apagada).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber, requirePathIdField } = require('../_shared/validators');
const { isTicketNotFoundDetail, notFoundDetailText, TICKET_NOT_FOUND_HINT } = require('../_shared/ticketSubresourceErrors');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const schema = {
  name: 'delete_ticket_answer',
  description: 'Remover uma resposta (comunicação com o cliente) de um ticket no TiFlux. Só quem criou a resposta pode apagá-la; respostas registradas como cliente não podem ser apagadas pela API. Resposta já apagada volta como aviso "já foi apagada".',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket de onde a resposta será removida (ex: "123", "456")'),
      answer_id: { type: 'string', description: 'ID da resposta a ser removida (obtido via list_ticket_answers ou get_ticket_answer)' }
    },
    required: ['ticket_number', 'answer_id']
  }
};

/**
 * Titulo e cauda do erro do DELETE (H33). Regras da API: so o autor apaga a propria
 * resposta (403 "Cannot delete an answer created by another user"); resposta ja
 * apagada → 404 "Answer is already deleted"; ticket inexistente → 404 do ticket.
 */
function deleteAnswerErrorVariant(response, ticketNumber, detail) {
  if (response.status === 403) {
    return {
      title: `**❌ Sem permissão para remover resposta do ticket #${ticketNumber}**`,
      tail: '*Só quem criou a resposta pode apagá-la; respostas de cliente não podem ser apagadas pela API.*'
    };
  }
  if (response.status === 404 && isTicketNotFoundDetail(response)) {
    return { title: `**❌ Ticket #${ticketNumber} não encontrado**`, tail: `**Como resolver:** ${TICKET_NOT_FOUND_HINT}` };
  }
  if (response.status === 404 && detail && /already deleted|was deleted/i.test(detail)) {
    return {
      title: `**ℹ️ A resposta já foi apagada do ticket #${ticketNumber}**`,
      tail: '*Nada a fazer: a resposta já tinha sido removida.*'
    };
  }
  if (response.status === 404) {
    return {
      title: `**❌ Resposta não encontrada no ticket #${ticketNumber}**`,
      tail: '**Como resolver:** Use list_ticket_answers com o ticket_number para ver os IDs das respostas.'
    };
  }
  return {
    title: `**❌ Erro ao remover resposta do ticket #${ticketNumber}**`,
    tail: '*Verifique se o ticket e a resposta existem e se você tem permissão.*',
    withMessage: true
  };
}

async function execute(args, { api }) {
  const ticket_number = requireTicketNumber(args);
  const answer_id = requirePathIdField(args, 'answer_id', { hint: 'Informe answer_id com o ID da resposta. Para achar o ID, use list_ticket_answers com o ticket_number.' });

  try {
    const response = await api.deleteTicketAnswer(ticket_number, answer_id);

    if (response.error) {
      const status = response.status;
      // Ticket inexistente: o titulo ja diz tudo; o detail cru da API nao e repassado.
      const detail = status === 404 && !isTicketNotFoundDetail(response) ? notFoundDetailText(response) : null;
      const variant = deleteAnswerErrorVariant(response, ticket_number, detail);
      const mensagem = variant.withMessage ? `**Mensagem:** ${response.error}\n` : '';
      return errorResponse(
        `${variant.title}\n\n` +
        `**Resposta ID:** ${answer_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        (detail ? `**Detalhes:** ${detail}\n` : '') +
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Resposta removida com sucesso do ticket #${ticket_number}!**\n\n` +
      `**Resposta ID:** ${answer_id}\n\n` +
      `*✅ Resposta removida via API TiFlux*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao remover resposta do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao remover resposta do ticket', execute) };

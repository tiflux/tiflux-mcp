/**
 * Slice: delete_ticket_answer — remove uma resposta de um ticket.
 *
 * Endpoint: DELETE /tickets/{ticket_number}/answers/{id} (via api.deleteTicketAnswer).
 * Trata 204 (sucesso sem corpo), 403, 404.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const schema = {
  name: 'delete_ticket_answer',
  description: 'Remover uma resposta (comunicação com o cliente) de um ticket no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket de onde a resposta será removida (ex: "123", "456")'),
      answer_id: { type: 'string', description: 'ID da resposta a ser removida (obtido via list_ticket_answers ou get_ticket_answer)' }
    },
    required: ['ticket_number', 'answer_id']
  }
};

async function execute(args, { api }) {
  const { ticket_number, answer_id } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'answer_id');

  try {
    const response = await api.deleteTicketAnswer(ticket_number, answer_id);

    if (response.error) {
      const byStatus = {
        403: {
          title: `**❌ Sem permissão para remover resposta do ticket #${ticket_number}**`,
          tail: '*Verifique se você tem permissão para gerenciar respostas neste ticket.*'
        },
        404: {
          title: `**❌ Resposta não encontrada no ticket #${ticket_number}**`,
          tail: '*Verifique se a resposta existe e pertence a este ticket (use list_ticket_answers para listar).*'
        }
      };
      const status = response.status;
      const variant = byStatus[status] || {
        title: `**❌ Erro ao remover resposta do ticket #${ticket_number}**`,
        tail: '*Verifique se o ticket e a resposta existem e se você tem permissão.*'
      };
      const mensagem = byStatus[status] ? '' : `**Mensagem:** ${response.error}\n`;
      return errorResponse(
        `${variant.title}\n\n` +
        `**Resposta ID:** ${answer_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Resposta removida com sucesso do ticket #${ticket_number}!**\n\n` +
      `**Resposta ID:** ${answer_id}\n\n` +
      `*✅ Resposta removida via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover resposta do ticket #${ticket_number}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

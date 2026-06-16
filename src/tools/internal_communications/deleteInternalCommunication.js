/**
 * Slice: delete_internal_communication — remove uma comunicacao interna de um ticket.
 *
 * Endpoint: DELETE /tickets/{ticket_number}/internal_communications/{id} (via api.deleteInternalCommunication).
 * Trata 204 (sucesso sem corpo), 403, 404.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const schema = {
  name: 'delete_internal_communication',
  description: 'Remover uma comunicação interna de um ticket no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket de onde a comunicação interna será removida (ex: "123", "456")'),
      communication_id: { type: 'string', description: 'ID da comunicação interna a ser removida (obtido via list_internal_communications)' }
    },
    required: ['ticket_number', 'communication_id']
  }
};

async function execute(args, { api }) {
  const { ticket_number, communication_id } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'communication_id');

  try {
    const response = await api.deleteInternalCommunication(ticket_number, communication_id);

    if (response.error) {
      const byStatus = {
        403: {
          title: `**❌ Sem permissão para remover comunicação interna do ticket #${ticket_number}**`,
          tail: '*Verifique se você tem permissão para gerenciar comunicações internas neste ticket.*'
        },
        404: {
          title: `**❌ Comunicação interna não encontrada no ticket #${ticket_number}**`,
          tail: '*Verifique se a comunicação existe e pertence a este ticket (use list_internal_communications para listar).*'
        }
      };
      const status = response.status;
      const variant = byStatus[status] || {
        title: `**❌ Erro ao remover comunicação interna do ticket #${ticket_number}**`,
        tail: '*Verifique se o ticket e a comunicação existem e se você tem permissão.*'
      };
      const mensagem = byStatus[status] ? '' : `**Mensagem:** ${response.error}\n`;
      return errorResponse(
        `${variant.title}\n\n` +
        `**Comunicação ID:** ${communication_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Comunicação interna removida com sucesso do ticket #${ticket_number}!**\n\n` +
      `**Comunicação ID:** ${communication_id}\n\n` +
      `*✅ Comunicação interna removida via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover comunicação interna do ticket #${ticket_number}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

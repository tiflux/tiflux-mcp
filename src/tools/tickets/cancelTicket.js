/**
 * Slice: cancel_ticket — cancela um ticket existente no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/cancel (via api.cancelTicket).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'cancel_ticket',
  description: 'Cancelar um ticket específico no TiFlux',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser cancelado (ex: "123", "456")' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const { ticket_number } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.cancelTicket(ticket_number);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao cancelar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para cancelá-lo.*`
      );
    }

    return textResponse(
      `**✅ Ticket #${ticket_number} cancelado com sucesso!**\n\n` +
      `**Mensagem:** ${response.data?.message || response.message || 'Ticket cancelado'}\n\n` +
      `*O ticket foi cancelado e não pode mais receber atualizações.*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao cancelar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e tente novamente.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

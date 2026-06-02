/**
 * Slice: close_ticket — fecha um ticket existente no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/close (via api.closeTicket).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'close_ticket',
  description: 'Fechar um ticket específico no TiFlux',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser fechado (ex: "123", "456")' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const { ticket_number } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.closeTicket(ticket_number);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao fechar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para fechá-lo.*`
      );
    }

    return textResponse(
      `**✅ Ticket #${ticket_number} fechado com sucesso!**\n\n` +
      `**Mensagem:** ${response.data?.message || response.message || 'Ticket fechado'}\n\n` +
      `*O ticket foi fechado e marcado como resolvido.*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao fechar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e tente novamente.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

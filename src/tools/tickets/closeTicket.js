/**
 * Slice: close_ticket — fecha um ticket existente no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/close (via api.closeTicket).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
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
      return errorResponse(
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
    return toolErrorResponse(`Erro ao fechar ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao fechar ticket', execute, schema.name) };

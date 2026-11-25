/**
 * Slice: cancel_ticket — cancela um ticket existente no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/cancel (via api.cancelTicket).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, apiRejectionTail, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber } = require('../_shared/validators');

const schema = {
  name: 'cancel_ticket',
  description:
    'Cancelar um ticket específico no TiFlux. Ticket com apontamento não pode ser cancelado (a API responde 422 "Already has appointments!"); ' +
    'ticket já cancelado também dá 422. Um ticket cancelado pode ser reaberto com reopen_ticket.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser cancelado (ex: "123", "456")' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const ticket_number = requireTicketNumber(args);

  try {
    const response = await api.cancelTicket(ticket_number);

    if (response.error) {
      // 422: o ticket existe e a regra barrou (ex.: "Already has appointments!"); a cauda mostra o `detail` (H54).
      const tail = response.status === 422
        ? apiRejectionTail(response, 'O TiFlux recusou o cancelamento pelos motivos acima.')
        : '*Verifique se o ticket existe e se você tem permissão para cancelá-lo.*';
      // A5: dica acionavel (`Como resolver:`) para as recusas conhecidas; Código/Mensagem intactos.
      return apiFailureResponse(`**❌ Erro ao cancelar ticket #${ticket_number}**`, response, tail, { hints: true });
    }

    return textResponse(
      `**✅ Ticket #${ticket_number} cancelado com sucesso!**\n\n` +
      `**Mensagem:** ${response.data?.message || response.message || 'Ticket cancelado'}\n\n` +
      `*O ticket foi cancelado. Se precisar, ele pode ser reaberto com reopen_ticket.*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao cancelar ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao cancelar ticket', execute) };

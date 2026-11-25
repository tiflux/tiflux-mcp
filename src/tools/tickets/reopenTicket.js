/**
 * Slice: reopen_ticket — reabre um ticket fechado ou cancelado no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/reopen (via api.reopenTicket).
 * O campo disapproval_reason e obrigatorio ao reabrir ticket pendente de revisao
 * (reabertura por reprovacao). Tickets faturados nao podem ser reabertos (422).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber } = require('../_shared/validators');

const schema = {
  name: 'reopen_ticket',
  description: 'Reabrir um ticket fechado ou cancelado; o ticket volta ao 1º estágio da mesa. O campo disapproval_reason é obrigatório ao reabrir um ticket pendente de revisão (reabertura por reprovação) e, nesse caso, é registrado como resposta pública do ticket. Tickets faturados não podem ser reabertos.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket a ser reaberto'
      },
      disapproval_reason: {
        type: 'string',
        description: 'Motivo da reprovação/reabertura (obrigatório para tickets pendentes de revisão)'
      }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const { disapproval_reason } = args;

  const ticket_number = requireTicketNumber(args);

  try {
    const response = await api.reopenTicket(ticket_number, disapproval_reason);

    if (response.error) {
      if (response.status === 422) {
        return errorResponse(
          `**❌ Não é possível reabrir o ticket #${ticket_number}**\n\n` +
          `**Código:** ${response.status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Causas comuns: ticket faturado (não pode ser reaberto) ou falta de ` +
          `disapproval_reason ao reabrir ticket pendente de revisão.*`
        );
      }
      return errorResponse(
        `**❌ Erro ao reabrir ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para reabri-lo.*`
      );
    }

    return textResponse(
      `**✅ Ticket #${ticket_number} reaberto com sucesso!**\n\n` +
      `**Mensagem:** ${response.data?.message || 'Ticket reaberto'}\n\n` +
      `*O ticket foi reaberto e voltou ao 1º estágio da mesa.*` +
      (disapproval_reason
        ? `\n\n*Em ticket pendente de revisão, o motivo informado (disapproval_reason) foi registrado como resposta pública do ticket (em ticket já revisado, a API não usa o motivo).*`
        : '')
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao reabrir ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao reabrir ticket', execute) };

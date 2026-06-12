/**
 * Slice: reopen_ticket — reabre um ticket fechado ou cancelado no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/reopen (via api.reopenTicket).
 * O campo disapproval_reason e obrigatorio ao reabrir ticket pendente de revisao
 * (reabertura por reprovacao). Tickets faturados nao podem ser reabertos (422).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'reopen_ticket',
  description: 'Reabrir um ticket fechado ou cancelado. O campo disapproval_reason é obrigatório ao reabrir um ticket pendente de revisão (reabertura por reprovação). Tickets faturados não podem ser reabertos.',
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
  const { ticket_number, disapproval_reason } = args;

  requireField(args, 'ticket_number');

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
      `*O ticket foi reaberto e está disponível para atendimento novamente.*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao reabrir ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e tente novamente.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

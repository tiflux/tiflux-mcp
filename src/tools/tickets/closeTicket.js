/**
 * Slice: close_ticket — fecha um ticket existente no TiFlux.
 *
 * Endpoint: PUT /tickets/{ticket_number}/close (via api.closeTicket).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, apiRejectionTail, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber } = require('../_shared/validators');

const schema = {
  name: 'close_ticket',
  description:
    'Fechar um ticket específico no TiFlux. Pré-condições da API (a mesa decide quais valem): ' +
    'ao menos um apontamento (a mais comum; registre com create_appointment); o ticket não pode estar no estágio inicial; ' +
    'pode exigir responsável, item de catálogo e campos/checklist obrigatórios preenchidos (confira com get_ticket_checklists); ' +
    'e ao menos uma resposta de atendente (create_ticket_answer; resposta registrada como cliente não conta). ' +
    'Se a API recusar (422), o erro traz os motivos em "Detalhes".',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser fechado (ex: "123", "456")' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const ticket_number = requireTicketNumber(args);

  try {
    const response = await api.closeTicket(ticket_number);

    if (response.error) {
      // 422: o ticket existe e uma pre-condicao barrou; a cauda mostra o `detail` (H26).
      const tail = response.status === 422
        ? apiRejectionTail(response, 'O TiFlux recusou o fechamento pelos motivos acima.')
        : '*Verifique se o ticket existe e se você tem permissão para fechá-lo.*';
      // A5: dica acionavel (`Como resolver:`) para as recusas conhecidas; Código/Mensagem intactos.
      return apiFailureResponse(`**❌ Erro ao fechar ticket #${ticket_number}**`, response, tail, { hints: true });
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
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao fechar ticket', execute) };

/**
 * Slice: get_ticket_shifts — lista os deslocamentos disponíveis para
 * valorização de um apontamento em um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/shifts (via api.fetchTicketShifts).
 * Retorna array simples de { id, name, reference, client, contract } — sem paginação.
 *
 * Irmão de get_ticket_service_types: mesmo padrão de lookup escopado a ticket,
 * mesma taxonomia de erro via ticketSubresourceErrorResponse.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { requireField, parseIntStrict } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');

const RESOURCE_LABEL = 'deslocamentos';

/** Mapeia o enum `reference` da API para rótulo legível em pt-BR. */
const REFERENCE_LABELS = {
  All: 'Genérico (todos os clientes/contratos)',
  Client: 'Exclusivo do cliente',
  Contract: 'Exclusivo do contrato',
  Shared: 'Grupo de contratos'
};

const schema = {
  name: 'get_ticket_shifts',
  description: 'Listar os deslocamentos disponíveis para valorização de um apontamento no ticket. Deslocamento é o componente de valorização que representa o custo de deslocamento (viagem/visita) ao cliente. Útil para descobrir quais deslocamentos podem ser referenciados ao criar um apontamento valorizado. Irmão de get_ticket_service_types.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para listar os deslocamentos disponíveis (ex: "98875", "123")' },
      contract_id: { type: 'number', description: 'ID do contrato (número inteiro positivo) para filtrar deslocamentos vinculados a esse contrato específico (opcional). Omita para retornar todos os deslocamentos aplicáveis ao ticket. Valor não inteiro falha localmente com mensagem clara, sem chamar a API.' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const { ticket_number, contract_id } = args || {};

  requireField(args, 'ticket_number');

  // `contract_id` e opcional; quando presente, e validado localmente ANTES de
  // virar query param — falha clara e imediata em vez de round-trip ate o 422
  // da API v2. Fora do try de proposito: erro de validacao de input nao deve
  // ser mascarado como "erro interno" (mesmo tratamento de requireField).
  const contractId = contract_id === undefined || contract_id === null
    ? undefined
    : parseIntStrict(contract_id, 'contract_id');

  try {
    const filters = {};
    if (contractId !== undefined) filters.contract_id = contractId;

    const response = await api.fetchTicketShifts(ticket_number, filters);

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, {
        resourceLabel: RESOURCE_LABEL,
        validationHint: '*A API v2 rejeitou o parâmetro `ticket_number` ou `contract_id`. Verifique se `ticket_number` é um número maior que 0 e `contract_id` é um número inteiro válido.*'
      });
    }

    const shifts = Array.isArray(response.data) ? response.data : [];

    if (shifts.length === 0) {
      return textResponse(
        `**🚗 Deslocamentos — Ticket #${ticket_number}**\n\n` +
        `*Nenhum deslocamento aplicável encontrado para este ticket.*\n\n` +
        `Possíveis motivos:\n` +
        `• O ticket não possui deslocamentos cadastrados no plano/contrato.\n` +
        `• O filtro por contrato não retornou deslocamentos para este ticket.`
      );
    }

    let text = `**🚗 Deslocamentos — Ticket #${ticket_number}**\n\n`;
    text += `*${shifts.length} deslocamento${shifts.length !== 1 ? 's' : ''} ${shifts.length !== 1 ? 'disponíveis' : 'disponível'}:*\n\n`;

    shifts.forEach(shift => {
      const shiftId = shift.id !== undefined ? shift.id : '—';
      const shiftName = shift.name || '—';
      const referenceLabel = REFERENCE_LABELS[shift.reference] || shift.reference || '—';

      text += `**${shiftName}** (ID: ${shiftId})\n`;
      text += `• **Abrangência:** ${referenceLabel}\n`;

      if (shift.contract) {
        const contractName = shift.contract.name || '—';
        const contractId = shift.contract.id !== undefined ? shift.contract.id : '—';
        text += `• **Contrato:** ${contractName} (ID: ${contractId})\n`;
      }

      if (shift.client) {
        const clientName = shift.client.name || '—';
        const clientId = shift.client.id !== undefined ? shift.client.id : '—';
        text += `• **Cliente:** ${clientName} (ID: ${clientId})\n`;
      }

      text += '\n';
    });

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar deslocamentos do ticket #${ticket_number}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

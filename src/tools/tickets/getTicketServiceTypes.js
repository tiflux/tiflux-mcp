/**
 * Slice: get_ticket_service_types — lista os tipos de atendimento disponíveis
 * para um ticket: contratos/adendos vigentes (contract_riders) e serviços
 * avulsos (loose_services) aplicáveis na data informada.
 *
 * Endpoint: GET /tickets/{ticket_number}/service-types (via api.fetchTicketServiceTypes).
 * Retorna objeto único { contract_riders[], loose_services[] } — sem paginação.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');

const RESOURCE_LABEL = 'tipos de atendimento';

const schema = {
  name: 'get_ticket_service_types',
  description: 'Listar os tipos de atendimento disponíveis para valorização de um apontamento no ticket: contratos/adendos vigentes (contract_riders) e serviços avulsos (loose_services) aplicáveis. Útil para descobrir quais serviços ou contratos podem ser referenciados ao criar um apontamento valorizado. Aceita parâmetro de data opcional (padrão: hoje).',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para listar os tipos de atendimento (ex: "123", "456")' },
      date: { type: 'string', description: 'Data-base para filtrar contratos/adendos vigentes (formato ISO YYYY-MM-DD, ex: "2026-08-04"). Padrão: hoje. Não pode ser uma data futura.' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const { ticket_number, date } = args || {};

  requireField(args, 'ticket_number');

  try {
    const filters = {};
    if (date !== undefined) filters.date = date;

    const response = await api.fetchTicketServiceTypes(ticket_number, filters);

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, {
        resourceLabel: RESOURCE_LABEL,
        validationHint: '*A API v2 rejeitou o parâmetro `date`. Use o formato ISO `YYYY-MM-DD` e uma data que não seja futura.*'
      });
    }

    const data = response.data || {};
    const contractRiders = Array.isArray(data.contract_riders) ? data.contract_riders : [];
    const looseServices = Array.isArray(data.loose_services) ? data.loose_services : [];

    const dateLabel = date ? ` (data-base: ${date})` : '';

    if (contractRiders.length === 0 && looseServices.length === 0) {
      return textResponse(
        `**📋 Tipos de atendimento — Ticket #${ticket_number}**${dateLabel}\n\n` +
        `*Nenhum contrato/adendo ou serviço avulso aplicável encontrado para este ticket na data informada.*\n\n` +
        `Possíveis motivos:\n` +
        `• O ticket não possui contratos vigentes na data consultada.\n` +
        `• Não há serviços avulsos cadastrados para o cliente do ticket.`
      );
    }

    let text = `**📋 Tipos de atendimento — Ticket #${ticket_number}**${dateLabel}\n\n`;

    // Seção: Contratos / Adendos vigentes
    text += `## 📄 Contratos / Adendos vigentes\n\n`;
    if (contractRiders.length === 0) {
      text += `*Nenhum contrato/adendo vigente na data informada.*\n\n`;
    } else {
      contractRiders.forEach(rider => {
        const contractName = rider.contract?.name || '—';
        const riderNumber = rider.rider_number !== undefined ? rider.rider_number : '—';
        const startDate = rider.start_date || '—';
        const cancelDate = rider.cancel_date || '—';
        const riderId = rider.id !== undefined ? rider.id : '—';

        text += `**Contrato:** ${contractName}\n`;
        text += `• **Adendo nº:** ${riderNumber}\n`;
        text += `• **Vigência:** ${startDate} → ${cancelDate}\n`;
        text += `• **ID do adendo:** ${riderId}\n\n`;
      });
    }

    // Seção: Serviços avulsos
    text += `## 🔧 Serviços avulsos\n\n`;
    if (looseServices.length === 0) {
      text += `*Nenhum serviço avulso disponível.*\n\n`;
    } else {
      looseServices.forEach(service => {
        const serviceId = service.id !== undefined ? service.id : '—';
        const serviceName = service.name || '—';
        text += `• **ID:** ${serviceId} — ${serviceName}\n`;
      });
      text += '\n';
    }

    return textResponse(text);
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar tipos de atendimento do ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

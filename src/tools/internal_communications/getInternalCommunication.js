/**
 * Slice: get_internal_communication — retorna uma comunicacao interna especifica.
 *
 * Endpoint: GET /tickets/{ticket_number}/internal_communications/{id}
 *   (via api.getInternalCommunication).
 * Retorna texto completo sem truncar (diferente de list que trunca em 150 chars).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'get_internal_communication',
  description: 'Obter uma comunicação interna específica com texto completo',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket da comunicação interna'
      },
      communication_id: {
        type: 'string',
        description: 'ID da comunicação interna a ser obtida'
      }
    },
    required: ['ticket_number', 'communication_id']
  }
};

async function execute(args, { api }) {
  const { ticket_number, communication_id } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'communication_id');

  try {
    const response = await api.getInternalCommunication(ticket_number, communication_id);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao buscar comunicação interna**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Comunicação ID:** ${communication_id}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket e a comunicação existem e se você tem permissão para visualizar.*`
      );
    }

    const communication = response.data;

    const communicationText = communication.text
      ? communication.text.replace(/<[^>]*>/g, '').trim()
      : 'Conteúdo não disponível';

    return textResponse(
      `**📋 Comunicação Interna #${communication.id}**\n\n` +
      `${communicationText}\n\n` +
      `*✅ Texto completo obtido da API TiFlux*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao buscar comunicação interna**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Comunicação ID:** ${communication_id}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

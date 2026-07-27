/**
 * Slice: delete_client_address — remove um endereço de um cliente.
 *
 * Endpoint: DELETE /clients/{client_id}/addresses/{id} (via api.deleteClientAddress).
 * Resposta de sucesso: 204 sem corpo.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'delete_client_address',
  description: 'Remover um endereço de um cliente no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do endereço a ser removido (obrigatório)'
      }
    },
    required: ['client_id', 'id']
  }
};

async function execute(args, { api }) {
  const { client_id, id } = args;

  requireField(args, 'client_id');
  requireField(args, 'id');

  try {
    const response = await api.deleteClientAddress(client_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao remover endereço #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o endereço existem e se você tem permissão.*'
      );
    }

    return textResponse(
      `**✅ Endereço #${id} removido com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**ID removido:** ${id}\n\n` +
      `*✅ Endereço removido via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao remover endereço #${id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

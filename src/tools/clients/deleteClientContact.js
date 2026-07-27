/**
 * Slice: delete_client_contact — remove um contato de um cliente.
 *
 * Endpoint: DELETE /clients/{client_id}/contacts/{id} (via api.deleteClientContact).
 * Resposta de sucesso: 204 sem corpo.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'delete_client_contact',
  description: 'Remover um contato de um cliente no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do contato a ser removido (obrigatório)'
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
    const response = await api.deleteClientContact(client_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao remover contato #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o contato existem e se você tem permissão.*'
      );
    }

    return textResponse(
      `**✅ Contato #${id} removido com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**ID removido:** ${id}\n\n` +
      `*✅ Contato removido via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao remover contato #${id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

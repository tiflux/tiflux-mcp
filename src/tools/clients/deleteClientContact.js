/**
 * Slice: delete_client_contact — remove um contato de um cliente.
 *
 * Endpoint: DELETE /clients/{client_id}/contacts/{id} (via api.deleteClientContact).
 * Resposta de sucesso: 204 sem corpo.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireField, REQUIRED_FIELD_HINTS } = require('../_shared/validators');

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
  requireField(args, 'id', null, { hint: REQUIRED_FIELD_HINTS.contact_id });

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
    return toolErrorResponse(`Erro ao remover contato #${id} do cliente #${client_id}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao remover contato do cliente', execute) };

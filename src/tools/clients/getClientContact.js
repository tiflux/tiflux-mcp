/**
 * Slice: get_client_contact — retorna detalhe de um contato de um cliente.
 *
 * Endpoint: GET /clients/{client_id}/contacts/{id} (via api.getClientContact).
 * Nota: a API retorna o telefone no campo `telephone`.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'get_client_contact',
  description: 'Obter os detalhes de um contato específico de um cliente no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do contato (obrigatório)'
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
    const response = await api.getClientContact(client_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao buscar contato #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o contato existem e se você tem permissão.*'
      );
    }

    const c = response.data || {};
    let text = `**Contato #${c.id || id} do Cliente #${client_id}**\n\n`;
    text += `**Responsável:** ${c.owner || '—'}\n`;
    text += `**Uso:** ${c.use || '—'}\n`;
    text += `**Telefone:** ${c.telephone || '—'}\n`;
    text += `**E-mail:** ${c.email || '—'}\n`;
    if (c.country) text += `**País:** ${c.country}\n`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar contato #${id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

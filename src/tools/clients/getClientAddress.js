/**
 * Slice: get_client_address — retorna detalhe de um endereço de um cliente.
 *
 * Endpoint: GET /clients/{client_id}/addresses/{id} (via api.getClientAddress).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireField, REQUIRED_FIELD_HINTS } = require('../_shared/validators');

const schema = {
  name: 'get_client_address',
  description: 'Obter os detalhes de um endereço específico de um cliente no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do endereço (obrigatório)'
      }
    },
    required: ['client_id', 'id']
  }
};

async function execute(args, { api }) {
  const { client_id, id } = args;

  requireField(args, 'client_id');
  requireField(args, 'id', null, { hint: REQUIRED_FIELD_HINTS.address_id });

  try {
    const response = await api.getClientAddress(client_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao buscar endereço #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o endereço existem e se você tem permissão.*'
      );
    }

    const a = response.data || {};
    let text = `**Endereço #${a.id || id} do Cliente #${client_id}**\n\n`;
    text += `**Logradouro:** ${a.street || '—'}, ${a.number != null ? a.number : '—'}\n`;
    if (a.complement) text += `**Complemento:** ${a.complement}\n`;
    text += `**Bairro:** ${a.neighborhood || '—'}\n`;
    text += `**Cidade:** ${a.city || '—'}\n`;
    text += `**Estado:** ${a.state || '—'}\n`;
    text += `**CEP:** ${a.cep || '—'}\n`;

    return textResponse(text);
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar endereço #${id} do cliente #${client_id}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar endereço do cliente', execute) };

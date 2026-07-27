/**
 * Slice: create_client_address — cria um endereço para um cliente.
 *
 * Endpoint: POST /clients/{client_id}/addresses (via api.createClientAddress).
 * Body: { address: { cep, city, neighborhood, number, state, street, complement? } }
 * Obrigatórios: cep, city, neighborhood, number, state, street.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_client_address',
  description: 'Criar um novo endereço para um cliente no TiFlux. Campos obrigatórios: cep, city, neighborhood, number, state, street.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      cep: {
        type: 'string',
        description: 'CEP do endereço (obrigatório, ex: "89201-305")'
      },
      city: {
        type: 'string',
        description: 'Cidade (obrigatório)'
      },
      neighborhood: {
        type: 'string',
        description: 'Bairro (obrigatório)'
      },
      number: {
        type: 'number',
        description: 'Número do endereço (obrigatório, inteiro)'
      },
      state: {
        type: 'string',
        description: 'Estado — sigla de 2 letras (obrigatório, ex: "SC")'
      },
      street: {
        type: 'string',
        description: 'Logradouro / nome da rua (obrigatório)'
      },
      complement: {
        type: 'string',
        description: 'Complemento do endereço (opcional, ex: "Sala 3", "Apto 12")'
      }
    },
    required: ['client_id', 'cep', 'city', 'neighborhood', 'number', 'state', 'street']
  }
};

async function execute(args, { api }) {
  const { client_id, cep, city, neighborhood, number, state, street, complement } = args;

  requireField(args, 'client_id');
  requireField(args, 'cep');
  requireField(args, 'city');
  requireField(args, 'neighborhood');
  requireField(args, 'number');
  requireField(args, 'state');
  requireField(args, 'street');

  try {
    const address = { cep, city, neighborhood, number, state, street };
    if (complement !== undefined) address.complement = complement;

    const response = await api.createClientAddress(client_id, { address });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar endereço para o cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, se os campos são válidos e se você tem permissão.*'
      );
    }

    const created = response.data || {};
    return textResponse(
      `**✅ Endereço criado com sucesso!**\n\n` +
      `**ID do endereço:** ${created.id || 'N/A'}\n` +
      `**Cliente:** #${client_id}\n` +
      `**Logradouro:** ${created.street || street}, ${created.number != null ? created.number : number}\n` +
      `**Cidade/Estado:** ${created.city || city} / ${created.state || state}\n` +
      `**CEP:** ${created.cep || cep}\n\n` +
      `*✅ Endereço criado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar endereço para o cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

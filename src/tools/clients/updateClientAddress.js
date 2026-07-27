/**
 * Slice: update_client_address — atualiza parcialmente um endereço de um cliente.
 *
 * Endpoint: PUT /clients/{client_id}/addresses/{id} (via api.updateClientAddress).
 * Todos os campos são opcionais — só envia os campos informados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_client_address',
  description: 'Atualizar parcialmente um endereço de um cliente no TiFlux. Só os campos informados são enviados (atualização parcial).',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do endereço a ser atualizado (obrigatório)'
      },
      cep: {
        type: 'string',
        description: 'CEP do endereço (ex: "89201-305")'
      },
      city: {
        type: 'string',
        description: 'Cidade'
      },
      neighborhood: {
        type: 'string',
        description: 'Bairro'
      },
      number: {
        type: 'number',
        description: 'Número do endereço (inteiro)'
      },
      state: {
        type: 'string',
        description: 'Estado — sigla de 2 letras (ex: "SC")'
      },
      street: {
        type: 'string',
        description: 'Logradouro / nome da rua'
      },
      complement: {
        type: 'string',
        description: 'Complemento do endereço (ex: "Sala 3")'
      }
    },
    required: ['client_id', 'id']
  }
};

const UPDATABLE_FIELDS = ['cep', 'city', 'neighborhood', 'number', 'state', 'street', 'complement'];

async function execute(args, { api }) {
  const { client_id, id } = args;

  requireField(args, 'client_id');
  requireField(args, 'id');

  const address = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) address[field] = args[field];
  }

  if (Object.keys(address).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o endereço #${id} do cliente #${client_id}.\n\n` +
      `*Campos disponíveis: cep, city, neighborhood, number, state, street, complement.*`
    );
  }

  try {
    const response = await api.updateClientAddress(client_id, id, { address });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar endereço #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o endereço existem e se você tem permissão.*'
      );
    }

    const updated = response.data || {};
    const updatedFields = Object.keys(address).join(', ');

    return textResponse(
      `**✅ Endereço #${id} atualizado com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**Campos atualizados:** ${updatedFields}\n` +
      `**Logradouro:** ${updated.street || args.street || '—'}, ${updated.number != null ? updated.number : (args.number != null ? args.number : '—')}\n` +
      `**Cidade/Estado:** ${updated.city || args.city || '—'} / ${updated.state || args.state || '—'}\n\n` +
      `*✅ Endereço atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar endereço #${id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: create_client_contact — cria um contato para um cliente.
 *
 * Endpoint: POST /clients/{client_id}/contacts (via api.createClientContact).
 * Body: { contact: { use, number, owner, email, country? } }
 * Obrigatórios: use, number, owner, email.
 * Nota: o request usa `number` (telefone), mas a resposta da API retorna `telephone`.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_client_contact',
  description: 'Criar um novo contato (telefone/e-mail) para um cliente no TiFlux. Campos obrigatórios: use, number (telefone), owner, email.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      use: {
        type: 'string',
        description: 'Tipo de uso do contato (obrigatório, ex: "Personal", "Commercial")'
      },
      number: {
        type: 'string',
        description: 'Número de telefone (obrigatório, aceita formato BR e internacional, ex: "47999999999")'
      },
      owner: {
        type: 'string',
        description: 'Nome do responsável pelo contato (obrigatório)'
      },
      email: {
        type: 'string',
        description: 'E-mail de contato (obrigatório)'
      },
      country: {
        type: 'string',
        description: 'Código do país (opcional, ex: "BR", "US")'
      }
    },
    required: ['client_id', 'use', 'number', 'owner', 'email']
  }
};

async function execute(args, { api }) {
  const { client_id, use, number, owner, email, country } = args;

  requireField(args, 'client_id');
  requireField(args, 'use');
  requireField(args, 'number');
  requireField(args, 'owner');
  requireField(args, 'email');

  try {
    const contact = { use, number, owner, email };
    if (country !== undefined) contact.country = country;

    const response = await api.createClientContact(client_id, { contact });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar contato para o cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, se o e-mail é válido e se você tem permissão.*'
      );
    }

    const created = response.data || {};
    return textResponse(
      `**✅ Contato criado com sucesso!**\n\n` +
      `**ID do contato:** ${created.id || 'N/A'}\n` +
      `**Cliente:** #${client_id}\n` +
      `**Responsável:** ${created.owner || owner}\n` +
      `**Uso:** ${created.use || use}\n` +
      `**Telefone:** ${created.telephone || number}\n` +
      `**E-mail:** ${created.email || email}\n\n` +
      `*✅ Contato criado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar contato para o cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

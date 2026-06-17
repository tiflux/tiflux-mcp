/**
 * Slice: create_client_user — cria um usuário cliente (portal) para um cliente.
 *
 * Endpoint: POST /clients/{id}/users (via api.createClientUser).
 * Obrigatórios: user.name e user.email.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_client_user',
  description: 'Criar um usuário do portal (cliente) para um cliente no TiFlux. Permite que o usuário acesse o portal de clientes. Campos obrigatórios: name e email do usuário.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o usuário será vinculado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Nome completo do usuário (obrigatório)'
      },
      email: {
        type: 'string',
        description: 'Email do usuário — usado para login no portal (obrigatório)'
      },
      extension: {
        type: 'string',
        description: 'Ramal telefônico do usuário (opcional)'
      },
      authorization_flow: {
        type: 'boolean',
        description: 'Se o usuário precisa de autorização para acessar o portal (opcional)'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do usuário (opcional)'
      },
      country_code: {
        type: 'string',
        description: 'Código do país do telefone (opcional, ex: "55" para Brasil)'
      }
    },
    required: ['client_id', 'name', 'email']
  }
};

async function execute(args, { api }) {
  const { client_id, name, email, extension, authorization_flow, telephone, country_code } = args;

  requireField(args, 'client_id');
  requireField(args, 'name');
  requireField(args, 'email');

  try {
    const user = { name, email };
    if (extension !== undefined) user.extension = extension;
    if (authorization_flow !== undefined) user.authorization_flow = authorization_flow;
    if (telephone !== undefined) user.telephone = telephone;
    if (country_code !== undefined) user.country_code = country_code;

    const response = await api.createClientUser(client_id, user);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar usuário do portal para o cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, se o email já não está em uso e se você tem permissão.*'
      );
    }

    const createdUser = response.data || {};
    return textResponse(
      `**✅ Usuário do portal criado com sucesso!**\n\n` +
      `**ID do usuário:** ${createdUser.id || 'N/A'}\n` +
      `**Nome:** ${createdUser.name || name}\n` +
      `**Email:** ${createdUser.email || email}\n` +
      `**Cliente:** #${client_id}\n\n` +
      `*✅ O usuário pode acessar o portal de clientes com o email informado.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar usuário do portal**\n\n**Cliente:** #${client_id}`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: create_requestor — cria um novo solicitante em um cliente do TiFlux.
 *
 * Endpoint: POST /clients/{client_id}/requestors (via api.createRequestor).
 * Obrigatórios: client_id, name, telephone. Demais campos opcionais — só envia os informados.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

// Campos opcionais do solicitante (alem de name/telephone obrigatorios).
const OPTIONAL_FIELDS = ['email', 'can_open_ticket', 'extension', 'country'];

const schema = {
  name: 'create_requestor',
  description: 'Criar um novo solicitante (requestor) em um cliente do TiFlux. Campos obrigatórios: client_id, name e telephone. Os demais campos são opcionais e só são enviados se informados.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o solicitante será vinculado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Nome do solicitante (obrigatório)'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do solicitante (obrigatório, apenas números)'
      },
      email: {
        type: 'string',
        description: 'Email do solicitante (opcional)'
      },
      can_open_ticket: {
        type: 'boolean',
        description: 'Se o solicitante pode abrir tickets por email (opcional)'
      },
      extension: {
        type: 'string',
        description: 'Ramal do solicitante (opcional)'
      },
      country: {
        type: 'string',
        description: 'País do solicitante (opcional)'
      }
    },
    required: ['client_id', 'name', 'telephone']
  }
};

async function execute(args, { api }) {
  requireField(args, 'client_id');
  requireField(args, 'name');
  requireField(args, 'telephone');

  const { client_id } = args;

  try {
    // Montar body apenas com campos informados
    const body = {
      name: args.name,
      telephone: args.telephone
    };

    for (const field of OPTIONAL_FIELDS) {
      if (args[field] !== undefined) body[field] = args[field];
    }

    const response = await api.createRequestor(client_id, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar solicitante "${args.name}" (cliente #${client_id})**`,
        response,
        '*Verifique os dados informados e suas permissões.*'
      );
    }

    const requestor = response.data || {};
    return textResponse(
      `**✅ Solicitante criado com sucesso!**\n\n` +
      `**ID:** ${requestor.id}\n` +
      `**Nome:** ${requestor.name || args.name}\n` +
      `**Email:** ${requestor.email || args.email || 'N/A'}\n` +
      `**Telefone:** ${requestor.telephone || args.telephone}\n` +
      `**Cliente:** #${client_id}\n` +
      `\n*✅ Solicitante criado via API TiFlux. Use o ID ${requestor.id} no parâmetro requestor_id ao criar tickets.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar solicitante "${args.name}" (cliente #${client_id})**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

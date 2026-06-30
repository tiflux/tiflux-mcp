/**
 * Slice: update_requestor — atualiza um solicitante existente (atualização parcial).
 *
 * Endpoint: PUT /clients/{client_id}/requestors/{id} (via api.updateRequestor).
 * Todos os campos de dados são opcionais — só envia os campos informados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

// Campos atualizaveis do solicitante.
const UPDATABLE_FIELDS = ['name', 'telephone', 'email', 'can_open_ticket', 'extension'];

const schema = {
  name: 'update_requestor',
  description: 'Atualizar um solicitante (requestor) existente no TiFlux. Os campos de dados são opcionais — só os campos informados são enviados (atualização parcial). Use get_requestor para ver o estado atual antes de atualizar.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o solicitante pertence (obrigatório)'
      },
      requestor_id: {
        type: 'number',
        description: 'ID do solicitante a ser atualizado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Nome do solicitante'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do solicitante (apenas números)'
      },
      email: {
        type: 'string',
        description: 'Email do solicitante'
      },
      can_open_ticket: {
        type: 'boolean',
        description: 'Se o solicitante pode abrir tickets por email'
      },
      extension: {
        type: 'string',
        description: 'Ramal do solicitante'
      }
    },
    required: ['client_id', 'requestor_id']
  }
};

async function execute(args, { api }) {
  requireField(args, 'client_id');
  requireField(args, 'requestor_id');

  const { client_id, requestor_id } = args;

  // Montar body apenas com campos informados (exceto ids)
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o solicitante #${requestor_id}.\n\n` +
      `*Use get_requestor para ver os campos disponíveis.*`
    );
  }

  try {
    const response = await api.updateRequestor(client_id, requestor_id, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar solicitante #${requestor_id} (cliente #${client_id})**`,
        response,
        '*Verifique se o solicitante existe e se você tem permissão para editá-lo.*'
      );
    }

    const requestor = response.data || {};
    const updatedFields = Object.keys(body).join(', ');

    return textResponse(
      `**✅ Solicitante #${requestor_id} atualizado com sucesso!**\n\n` +
      `**ID:** ${requestor.id || requestor_id}\n` +
      `**Nome:** ${requestor.name || args.name || 'N/A'}\n` +
      `**Campos atualizados:** ${updatedFields}\n\n` +
      `*✅ Solicitante atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar solicitante #${requestor_id} (cliente #${client_id})**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

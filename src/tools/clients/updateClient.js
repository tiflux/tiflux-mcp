/**
 * Slice: update_client — atualiza um cliente existente no TiFlux (atualização parcial).
 *
 * Endpoint: PUT /clients/{id} (via api.updateClient).
 * Todos os campos são opcionais — só envia os campos informados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { clientWritableFieldSchemas, CLIENT_WRITABLE_FIELDS } = require('../_shared/clientShared');
const { dateTime } = require('../_shared/format');

const schema = {
  name: 'update_client',
  description: 'Atualizar um cliente existente no TiFlux. Todos os campos são opcionais — só os campos informados são enviados (atualização parcial). Use get_client para ver o estado atual antes de atualizar.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente a ser atualizado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Nome fantasia do cliente'
      },
      social: {
        type: 'string',
        description: 'Razão social do cliente'
      },
      ...clientWritableFieldSchemas
    },
    required: ['client_id']
  }
};

// name/social tambem sao atualizaveis, alem dos campos compartilhados.
const UPDATABLE_FIELDS = ['name', 'social', ...CLIENT_WRITABLE_FIELDS];

async function execute(args, { api, verbosity }) {
  requireField(args, 'client_id');

  const { client_id } = args;

  // Montar body apenas com campos informados (exceto client_id)
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o cliente #${client_id}.\n\n` +
      `*Use get_client para ver os campos disponíveis.*`
    );
  }

  try {
    const response = await api.updateClient(client_id, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe e se você tem permissão para editá-lo.*'
      );
    }

    const client = response.data || {};
    const updatedFields = Object.keys(body).join(', ');

    return textResponse(
      `**✅ Cliente #${client_id} atualizado com sucesso!**\n\n` +
      `**ID:** ${client.id || client_id}\n` +
      `**Nome:** ${client.name || args.name || 'N/A'}\n` +
      `**Campos atualizados:** ${updatedFields}\n` +
      // updated_at = ultima alteracao real (API devolve desde 2026-10-06; PUT sem mudanca nao avanca a data)
      (client.updated_at ? `**Atualizado em:** ${dateTime(client.updated_at, verbosity)}\n` : '') +
      `\n` +
      `*✅ Cliente atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: create_client — cria um novo cliente no TiFlux.
 *
 * Endpoint: POST /clients (via api.createClient).
 * Obrigatórios: name, social. Demais campos opcionais — só envia os informados.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { clientWritableFieldSchemas, CLIENT_WRITABLE_FIELDS } = require('../_shared/clientShared');

const schema = {
  name: 'create_client',
  description: 'Criar um novo cliente no TiFlux. Campos obrigatórios: name (nome fantasia) e social (razão social). Os demais campos são opcionais e só são enviados se informados.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome fantasia do cliente (obrigatório)'
      },
      social: {
        type: 'string',
        description: 'Razão social do cliente (obrigatório)'
      },
      ...clientWritableFieldSchemas
    },
    required: ['name', 'social']
  }
};

async function execute(args, { api }) {
  requireField(args, 'name');
  requireField(args, 'social');

  try {
    // Montar body apenas com campos informados
    const body = {
      name: args.name,
      social: args.social
    };

    for (const field of CLIENT_WRITABLE_FIELDS) {
      if (args[field] !== undefined) body[field] = args[field];
    }

    const response = await api.createClient(body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar cliente "${args.name}"**`,
        response,
        '*Verifique os dados informados e suas permissões.*'
      );
    }

    const client = response.data || {};
    return textResponse(
      `**✅ Cliente criado com sucesso!**\n\n` +
      `**ID:** ${client.id}\n` +
      `**Nome:** ${client.name || args.name}\n` +
      `**Razão Social:** ${client.social || args.social}\n` +
      `**Status:** ${client.status ? 'Ativo' : 'Inativo'}\n` +
      (client.social_revenue ? `**CPF/CNPJ:** ${client.social_revenue}\n` : '') +
      `\n*✅ Cliente criado via API TiFlux. Use o ID ${client.id} para criar tickets e vínculos.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar cliente "${args.name}"**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

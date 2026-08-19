/**
 * Slice: create_services_catalog — cria um catálogo de serviços.
 *
 * Endpoint: POST /services-catalogs (via api.createServicesCatalog).
 * Body: wrapper explícito { services_catalog: { name } }.
 *
 * Requer a role service_catalogs_manage ("Gerenciar catálogos de serviço").
 * O nome deve ser único na organização — a unicidade é validada apenas no create.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_services_catalog',
  description:
    'Criar um novo catálogo de serviços na organização. ' +
    'Requer a role **service_catalogs_manage** ("Gerenciar catálogos de serviço"). ' +
    'O nome deve ser único na organização (validado apenas na criação, não na atualização).',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do catálogo (obrigatório, único na organização)'
      }
    },
    required: ['name']
  }
};

async function execute(args, { api }) {
  requireField(args, 'name');

  const { name } = args;

  try {
    const response = await api.createServicesCatalog({ services_catalog: { name } });

    if (response.error) {
      const detail = extractApiErrorDetail(response);
      if (detail && detail.name) {
        const msgs = [detail.name].flat().join(', ');
        return errorResponse(
          `**❌ Erro de validação ao criar catálogo**\n\n` +
          `**Campo \`name\`:** ${msgs}\n\n` +
          `*Verifique se já existe um catálogo com esse nome.*`
        );
      }
      return apiFailureResponse(
        '**❌ Erro ao criar catálogo de serviços**',
        response,
        '*Verifique se você possui a role **service_catalogs_manage** e se o nome já não está em uso.*'
      );
    }

    const catalog = response.data || {};
    return textResponse(
      `**✅ Catálogo de serviços criado com sucesso!**\n\n` +
      `**ID:** ${catalog.id}\n` +
      `**Nome:** ${catalog.name || name}\n\n` +
      `*✅ Catálogo criado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao criar catálogo de serviços**', error);
  }
}

module.exports = { name: schema.name, schema, execute };

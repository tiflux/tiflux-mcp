/**
 * Slice: update_services_catalog — atualiza o nome de um catálogo de serviços.
 *
 * Endpoint: PUT /services-catalogs/{id} (via api.updateServicesCatalog).
 * Body: wrapper explícito { services_catalog: { name } }.
 *
 * Requer a role service_catalogs_manage.
 * ATENÇÃO: a unicidade de nome é validada somente no create — o update aceita
 * nomes duplicados sem retornar erro da API.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_services_catalog',
  description:
    'Atualizar o nome de um catálogo de serviços existente. ' +
    'Requer a role **service_catalogs_manage**. ' +
    'Atenção: a unicidade de nome é validada **somente na criação** — o update ' +
    'aceita nomes duplicados sem retornar erro (comportamento da API v2).',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do catálogo a ser atualizado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Novo nome do catálogo (obrigatório)'
      }
    },
    required: ['id', 'name']
  }
};

async function execute(args, { api }) {
  requireField(args, 'id');
  requireField(args, 'name');

  const { id, name } = args;

  try {
    const response = await api.updateServicesCatalog(id, { services_catalog: { name } });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar catálogo #${id}**`,
        response,
        '*Verifique se o catálogo existe e se você possui a role **service_catalogs_manage**.*'
      );
    }

    const catalog = response.data || {};
    return textResponse(
      `**✅ Catálogo #${id} atualizado com sucesso!**\n\n` +
      `**ID:** ${id}\n` +
      `**Novo nome:** ${catalog.name || name}\n\n` +
      `*✅ Catálogo atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar catálogo #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

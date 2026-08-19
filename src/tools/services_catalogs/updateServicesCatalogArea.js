/**
 * Slice: update_services_catalog_area — atualiza o nome de uma área de catálogo.
 *
 * Endpoint: PUT /services-catalogs/{services_catalog_id}/areas/{id}.
 * Body: wrapper explícito { area: { name } }.
 *
 * Requer a role service_catalogs_manage.
 * A unicidade de nome é validada apenas no create — o update aceita nomes duplicados.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveCatalogContext } = require('./catalogResolver');

const schema = {
  name: 'update_services_catalog_area',
  description:
    'Atualizar o nome de uma área de catálogo de serviços. ' +
    'Informe services_catalog_id (direto) ou services_catalog_name (resolução automática). ' +
    'Requer a role **service_catalogs_manage**.',
  inputSchema: {
    type: 'object',
    properties: {
      services_catalog_id: {
        type: 'number',
        description: 'ID do catálogo pai (tem precedência sobre services_catalog_name)'
      },
      services_catalog_name: {
        type: 'string',
        description: 'Nome do catálogo para resolução automática (alternativa a services_catalog_id)'
      },
      id: {
        type: 'number',
        description: 'ID da área a ser atualizada (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Novo nome da área (obrigatório)'
      }
    },
    required: ['id', 'name']
  }
};

async function execute(args, { api }) {
  requireField(args, 'id');
  requireField(args, 'name');

  const { id, name } = args;

  const ctx = await resolveCatalogContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalog_id = ctx.servicesCatalogId;

  try {
    const response = await api.updateServicesCatalogArea(services_catalog_id, id, { area: { name } });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar área #${id}**`,
        response,
        '*Verifique se a área existe e se você possui a role **service_catalogs_manage**.*'
      );
    }

    const area = response.data || {};
    return textResponse(
      `**✅ Área #${id} atualizada com sucesso!**\n\n` +
      `**ID:** ${id}\n` +
      `**Novo nome:** ${area.name || name}\n` +
      `**Catálogo:** #${services_catalog_id}\n\n` +
      `*✅ Área atualizada via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar área #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

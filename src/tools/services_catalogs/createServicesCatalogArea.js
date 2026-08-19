/**
 * Slice: create_services_catalog_area — cria uma área em um catálogo de serviços.
 *
 * Endpoint: POST /services-catalogs/{services_catalog_id}/areas.
 * Body: wrapper explícito { area: { name } }.
 *
 * Requer a role service_catalogs_manage.
 * O nome deve ser único por [organização, catálogo] — validado apenas no create.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveCatalogContext } = require('./catalogResolver');

const schema = {
  name: 'create_services_catalog_area',
  description:
    'Criar uma nova área em um catálogo de serviços. ' +
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
      name: {
        type: 'string',
        description: 'Nome da área (obrigatório, único por catálogo)'
      }
    },
    required: ['name']
  }
};

async function execute(args, { api }) {
  requireField(args, 'name');

  const { name } = args;

  const ctx = await resolveCatalogContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalog_id = ctx.servicesCatalogId;

  try {
    const response = await api.createServicesCatalogArea(services_catalog_id, { area: { name } });

    if (response.error) {
      const detail = extractApiErrorDetail(response);
      if (detail && detail.name) {
        const msgs = [detail.name].flat().join(', ');
        return errorResponse(
          `**❌ Erro de validação ao criar área**\n\n` +
          `**Campo \`name\`:** ${msgs}\n\n` +
          `*Verifique se já existe uma área com esse nome neste catálogo.*`
        );
      }
      return apiFailureResponse(
        `**❌ Erro ao criar área no catálogo #${services_catalog_id}**`,
        response,
        '*Verifique se você possui a role **service_catalogs_manage**.*'
      );
    }

    const area = response.data || {};
    return textResponse(
      `**✅ Área criada com sucesso!**\n\n` +
      `**ID:** ${area.id}\n` +
      `**Nome:** ${area.name || name}\n` +
      `**Catálogo:** #${services_catalog_id}\n\n` +
      `*✅ Área criada via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar área no catálogo #${services_catalog_id}**`, error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

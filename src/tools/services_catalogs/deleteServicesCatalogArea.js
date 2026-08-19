/**
 * Slice: delete_services_catalog_area — remove (soft delete) uma área de catálogo.
 *
 * Endpoint: DELETE /services-catalogs/{services_catalog_id}/areas/{id}.
 * Resposta de sucesso: 204 sem corpo.
 *
 * Requer a role service_catalogs_manage.
 *
 * Cascata: todos os itens da área são desativados (active=false).
 * Pre-flight consulta os itens antes do DELETE para informar a contagem.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveCatalogContext } = require('./catalogResolver');
const { preflightArea, formatAreaCascade } = require('./cascadePreflight');

const schema = {
  name: 'delete_services_catalog_area',
  description:
    'Remover (soft delete) uma área de catálogo de serviços e todos os seus itens. ' +
    'Informe services_catalog_id (direto) ou services_catalog_name (resolução automática). ' +
    'Requer a role **service_catalogs_manage**. ' +
    '**Atenção:** todos os itens da área são desativados em cascata.',
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
        description: 'ID da área a ser removida (obrigatório)'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  requireField(args, 'id');

  const { id } = args;

  const ctx = await resolveCatalogContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalog_id = ctx.servicesCatalogId;

  // Contagem informativa (NAO e um gate): roda antes do DELETE so para o relatorio
  const preflight = await preflightArea(api, id);

  try {
    const response = await api.deleteServicesCatalogArea(services_catalog_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao remover área #${id}**`,
        response,
        '*Verifique se a área existe e se você possui a role **service_catalogs_manage**.*'
      );
    }

    const cascade = formatAreaCascade(preflight);
    return textResponse(
      `**✅ Área #${id} removida com sucesso!**\n` +
      cascade + '\n\n' +
      `*✅ Área removida via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover área #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

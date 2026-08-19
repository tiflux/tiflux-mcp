/**
 * Slice: delete_services_catalog_item — remove (soft delete) um item de catálogo.
 *
 * Endpoint: DELETE /services-catalogs-areas/{services_catalogs_area_id}/items/{id}.
 * Resposta de sucesso: 204 sem corpo.
 *
 * Requer a role service_catalogs_manage.
 *
 * NÃO há pre-flight: itens não têm cascata.
 * ATENÇÃO: um item em uso por tickets é desativado sem bloqueio (o before_destroy
 * do model Rails não é executado porque a action faz UPDATE, não DELETE).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveAreaContext } = require('./catalogResolver');

const schema = {
  name: 'delete_services_catalog_item',
  description:
    'Remover (soft delete) um item de catálogo de serviços. ' +
    'Informe services_catalogs_area_id (direto) ou a combinação area_name + services_catalog_id/services_catalog_name. ' +
    'Requer a role **service_catalogs_manage**. ' +
    '**Atenção:** um item em uso por tickets é desativado sem bloqueio (sem confirmação adicional).',
  inputSchema: {
    type: 'object',
    properties: {
      services_catalogs_area_id: {
        type: 'number',
        description: 'ID da área pai (tem precedência sobre area_name)'
      },
      area_name: {
        type: 'string',
        description: 'Nome da área para resolução automática (requer services_catalog_id ou services_catalog_name)'
      },
      services_catalog_id: {
        type: 'number',
        description: 'ID do catálogo pai (usado na resolução por area_name)'
      },
      services_catalog_name: {
        type: 'string',
        description: 'Nome do catálogo para resolução automática (alternativa a services_catalog_id)'
      },
      id: {
        type: 'number',
        description: 'ID do item a ser removido (obrigatório)'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  requireField(args, 'id');

  const { id } = args;

  // Resolucao por nome
  const ctx = await resolveAreaContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalogs_area_id = ctx.areaId;

  // Sem pre-flight: itens não têm cascata
  try {
    const response = await api.deleteServicesCatalogItem(services_catalogs_area_id, id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao remover item #${id}**`,
        response,
        '*Verifique se o item existe e não está já inativo, e se você possui a role **service_catalogs_manage**.*'
      );
    }

    return textResponse(
      `**✅ Item #${id} removido com sucesso!**\n\n` +
      `**ID removido:** ${id}\n` +
      `**Área:** #${services_catalogs_area_id}\n\n` +
      `*✅ Item removido via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover item #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

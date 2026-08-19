/**
 * Slice: delete_services_catalog — remove (soft delete) um catálogo de serviços.
 *
 * Endpoint: DELETE /services-catalogs/{id} (via api.deleteServicesCatalog).
 * Resposta de sucesso: 204 sem corpo.
 *
 * Requer a role service_catalogs_manage.
 *
 * A cascata é silenciosa e irrestrita:
 *   - Catálogo: is_deleted=true
 *   - Todas as suas áreas: active=false
 *   - Todos os itens dessas áreas: active=false
 *   - Atividades recorrentes referenciando esses itens: active=false
 *
 * Um pre-flight consulta a API antes do DELETE para informar a contagem.
 * Se o pre-flight falhar, o DELETE ainda acontece (a contagem é informativa).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { preflightCatalog, formatCatalogCascade } = require('./cascadePreflight');

const schema = {
  name: 'delete_services_catalog',
  description:
    'Remover (soft delete) um catálogo de serviços e todas as suas áreas e itens. ' +
    'Requer a role **service_catalogs_manage**. ' +
    '**Atenção:** a remoção desativa em cascata todas as áreas e itens do catálogo, ' +
    'incluindo atividades recorrentes que os referenciam — sem confirmação adicional e ' +
    'mesmo que itens estejam em uso por tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do catálogo a ser removido (obrigatório)'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  requireField(args, 'id');

  const { id } = args;

  // Pre-flight: conta areas e itens antes do delete
  const preflight = await preflightCatalog(api, id);

  try {
    const response = await api.deleteServicesCatalog(id);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao remover catálogo #${id}**`,
        response,
        '*Verifique se o catálogo existe e se você possui a role **service_catalogs_manage**.*'
      );
    }

    const cascade = formatCatalogCascade(preflight);
    return textResponse(
      `**✅ Catálogo #${id} removido com sucesso!**\n` +
      cascade + '\n\n' +
      `*✅ Catálogo removido via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover catálogo #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

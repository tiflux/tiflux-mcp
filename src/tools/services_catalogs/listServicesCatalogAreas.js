/**
 * Slice: list_services_catalog_areas — lista áreas de um catálogo de serviços.
 *
 * Endpoint: GET /services-catalogs/{services_catalog_id}/areas.
 * Aceita services_catalog_id (direto) OU services_catalog_name (resolução server-side).
 * Precedência: services_catalog_id vence services_catalog_name.
 *
 * Retorna apenas áreas ativas (active=true).
 * ATENÇÃO: A API não expõe GET .../areas/{id}. Use o filtro `name` para detalhar.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { renderList } = require('../_shared/format');
const { resolveCatalogContext } = require('./catalogResolver');

const schema = {
  name: 'list_services_catalog_areas',
  description:
    'Listar as áreas de um catálogo de serviços. ' +
    'Informe services_catalog_id (direto) ou services_catalog_name (resolução automática). ' +
    'Retorna apenas áreas ativas. Não existe get_services_catalog_area — filtre por `name` para localizar uma área específica.',
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
        description: 'Filtrar áreas por nome (busca parcial, server-side)'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function renderItem(area) {
  const catalog = area.services_catalog ? ` (catálogo: ${area.services_catalog.name})` : '';
  return `**ID ${area.id}** — ${area.name}${catalog}\n\n`;
}

async function execute(args, { api, verbosity }) {
  const { name, offset = 1, limit = 20 } = args;
  // Limite efetivo para o rodape: o transporte clampeia em 200, entao usar o
  // valor bruto faria hasMore=false com 200 itens e limit>200, mentindo
  // "ultima pagina" quando ainda ha mais. (BL-008)
  const effectiveLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  // Resolucao por nome (precedencia: id vence name)
  const ctx = await resolveCatalogContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalog_id = ctx.servicesCatalogId;

  try {
    const response = await api.listServicesCatalogAreas(services_catalog_id, { name, offset, limit });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao listar áreas do catálogo #${services_catalog_id}**`,
        response,
        '*Verifique se o catálogo existe e se você tem permissão.*'
      );
    }

    const items = response.data || [];
    const total = response.total;

    const text = renderList({
      items,
      title: `Áreas do Catálogo #${services_catalog_id}`,
      emptyMessage:
        `**Nenhuma área encontrada no catálogo #${services_catalog_id}**\n\n` +
        `*${name ? `Nenhuma área com nome contendo "${name}".` : 'Este catálogo não possui áreas ativas.'}*`,
      renderItem,
      total,
      offset,
      limit: effectiveLimit,
      unit: 'áreas',
      verbosity
    });

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao listar áreas do catálogo #${services_catalog_id}**`, error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

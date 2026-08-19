/**
 * Slice: list_services_catalog_items — lista itens de uma área de catálogo.
 *
 * Endpoint: GET /services-catalogs-areas/{services_catalogs_area_id}/items.
 * Aceita services_catalogs_area_id (direto) OU (area_name + services_catalog_id/services_catalog_name).
 * Precedência: services_catalogs_area_id vence qualquer combinação por nome.
 *
 * Retorna apenas itens ativos (active=true).
 * DIFERENTE de search_catalog_item: esta tool lista itens de uma área específica,
 * incluindo inativos ausentes do search_catalog_item (se a API os retornar).
 * Use list_desk_services_catalogs para catálogos vinculados a uma mesa.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { renderList } = require('../_shared/format');
const { resolveAreaContext } = require('./catalogResolver');

const schema = {
  name: 'list_services_catalog_items',
  description:
    'Listar itens de uma área de catálogo de serviços. ' +
    'Informe services_catalogs_area_id (direto) ou a combinação area_name + services_catalog_id/services_catalog_name. ' +
    'DIFERENTE de search_catalog_item (itens selecionáveis em tickets de uma mesa). ' +
    'Não existe get_services_catalog_item — filtre por `name` para localizar um item específico.',
  inputSchema: {
    type: 'object',
    properties: {
      services_catalogs_area_id: {
        type: 'number',
        description: 'ID da área (tem precedência sobre area_name)'
      },
      area_name: {
        type: 'string',
        description: 'Nome da área para resolução automática (requer services_catalog_id ou services_catalog_name)'
      },
      services_catalog_id: {
        type: 'number',
        description: 'ID do catálogo pai (usado na resolução por area_name; tem precedência sobre services_catalog_name)'
      },
      services_catalog_name: {
        type: 'string',
        description: 'Nome do catálogo para resolução automática (alternativa a services_catalog_id, usado com area_name)'
      },
      name: {
        type: 'string',
        description: 'Filtrar itens por nome (busca parcial, server-side)'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function renderItem(item) {
  const area = item.services_catalogs_area ? ` — área: ${item.services_catalogs_area.name}` : '';
  const catalog = item.services_catalog ? ` (catálogo: ${item.services_catalog.name})` : '';
  const times = (item.start_time != null && item.end_time != null)
    ? ` | SLA atendimento: ${item.start_time || '?'} / SLA solução: ${item.end_time || '?'}`
    : '';
  return `**ID ${item.id}** — ${item.name}${area}${catalog}${times}\n\n`;
}

async function execute(args, { api, verbosity }) {
  const { name, offset = 1, limit = 20 } = args;
  // Limite efetivo para o rodape: o transporte clampeia em 200, entao usar o
  // valor bruto faria hasMore=false com 200 itens e limit>200, mentindo
  // "ultima pagina" quando ainda ha mais. (BL-008)
  const effectiveLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  // Resolucao por nome (precedencia: id vence name)
  const ctx = await resolveAreaContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalogs_area_id = ctx.areaId;

  try {
    const response = await api.listServicesCatalogItems(services_catalogs_area_id, { name, offset, limit });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao listar itens da área #${services_catalogs_area_id}**`,
        response,
        '*Verifique se a área existe e se você tem permissão.*'
      );
    }

    const items = response.data || [];
    const total = response.total;

    const text = renderList({
      items,
      title: `Itens da Área #${services_catalogs_area_id}`,
      emptyMessage:
        `**Nenhum item encontrado na área #${services_catalogs_area_id}**\n\n` +
        `*${name ? `Nenhum item com nome contendo "${name}".` : 'Esta área não possui itens ativos.'}*`,
      renderItem,
      total,
      offset,
      limit: effectiveLimit,
      unit: 'itens',
      verbosity
    });

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao listar itens da área #${services_catalogs_area_id}**`, error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: list_services_catalogs — lista todos os catálogos de serviços da organização.
 *
 * Endpoint: GET /services-catalogs (via api.listServicesCatalogs).
 * Filtros: name (ilike parcial, server-side), offset, limit.
 * Retorna apenas catálogos ativos (is_deleted=false), ordenados por id.
 *
 * ATENÇÃO: A API não expõe GET /services-catalogs/{id} (retorna 404/40403).
 * Para ver detalhes de um catálogo específico, use o filtro `name` nesta tool.
 *
 * DIFERENTE de list_desk_services_catalogs: esta tool lista todos os catálogos
 * da organização (visão de configuração). Use list_desk_services_catalogs para
 * ver os catálogos vinculados a uma mesa específica (visão de operação).
 * Use search_catalog_item para buscar itens selecionáveis em tickets de uma mesa.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { renderList } = require('../_shared/format');

const schema = {
  name: 'list_services_catalogs',
  description:
    'Listar todos os catálogos de serviços da organização (visão de configuração). ' +
    'Filtre por `name` para localizar um catálogo específico — não existe get_services_catalog, ' +
    'pois a API não tem endpoint de detalhe individual. ' +
    'DIFERENTE de list_desk_services_catalogs (catálogos de uma mesa) e de ' +
    'search_catalog_item (itens selecionáveis em tickets de uma mesa).',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Filtrar por nome (busca parcial, insensível a maiúsculas e acentos)'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function renderItem(catalog) {
  return `**ID ${catalog.id}** — ${catalog.name}\n\n`;
}

async function execute(args, { api, verbosity }) {
  const { name, offset = 1, limit = 20 } = args;
  // Limite efetivo para cálculo do rodapé: o transporte clampeia em 200,
  // então usar o valor bruto faria hasMore=false para 200 itens com limit>200,
  // mentindo "última página" quando ainda há mais. (BL-008)
  const effectiveLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  try {
    const response = await api.listServicesCatalogs({ name, offset, limit });

    if (response.error) {
      return apiFailureResponse(
        '**❌ Erro ao listar catálogos de serviços**',
        response,
        '*Verifique sua conexão e configurações da API.*'
      );
    }

    const items = response.data || [];
    const total = response.total;

    const text = renderList({
      items,
      title: 'Catálogos de Serviços',
      emptyMessage:
        '**Nenhum catálogo de serviços encontrado**\n\n' +
        '*A organização não possui catálogos de serviços ativos' +
        (name ? ` com nome contendo "${name}"` : '') + '.*',
      renderItem,
      total,
      offset,
      limit: effectiveLimit,
      unit: 'catálogos',
      verbosity
    });

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao listar catálogos de serviços**', error);
  }
}

module.exports = { name: schema.name, schema, execute };

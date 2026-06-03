/**
 * Slice: search_catalog_item — busca/lista itens de catalogo de uma mesa.
 *
 * Endpoints: GET /desks (resolver desk_name) + GET /desks/{id}/services-catalogs-items.
 * Regras:
 *   - desk_id OU desk_name obrigatorio
 *   - search OU catalog_item_name OU area_id OU catalog_id obrigatorio
 *   - search filtra server-side por nome do catalogo, area ou item (parcial, case-insensitive)
 *   - search presente -> retorna listagem com hierarquia (nunca colapsa)
 *   - catalog_item_name filtra client-side por nome do item (case-insensitive, partial)
 *   - 1 match exato de nome (catalog_item_name) -> detalhado; multiplos -> erro com lista; listagem -> formato resumido
 *
 * Preserva contrato do handler legado: em erro/multiplas, resposta tem isError: true.
 */

const { resolveDeskName } = require('../_shared/deskResolver');

const schema = {
  name: 'search_catalog_item',
  description: 'Buscar itens de catálogo de serviços por termo livre (catálogo, área ou item) ou por nome/filtro dentro de uma mesa específica. Use o parâmetro `search` para busca server-side por termo aproximado em nome de catálogo, área ou item — retorna listagem com hierarquia completa. Use `catalog_item_name` para localizar um item específico por nome (busca client-side, colapsa para detalhe único quando há 1 match). Os itens de catálogo representam os tipos de solicitações que podem ser criadas em uma mesa.',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID da mesa onde buscar itens de catálogo (use desk_id OU desk_name)'
      },
      desk_name: {
        type: 'string',
        description: 'Nome da mesa para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados").'
      },
      search: {
        type: 'string',
        description: 'Termo livre para busca server-side por nome de catálogo, área ou item de serviço. Busca parcial, sem distinção de maiúsculas/minúsculas e ignora acentos. Retorna listagem com hierarquia completa (catálogo → área → item). Combine com area_id ou catalog_id para restringir o escopo.'
      },
      catalog_item_name: {
        type: 'string',
        description: 'Nome do item de catálogo a ser buscado (busca client-side, parcial, case-insensitive, somente por nome do item). 1 match → detalhe; múltiplos → erro com lista. Opcional quando search, area_id ou catalog_id são fornecidos.'
      },
      area_id: {
        type: 'number',
        description: 'ID da área de serviços para filtrar os resultados. Quando fornecido sem catalog_item_name ou search, lista todos os itens da área.'
      },
      catalog_id: {
        type: 'number',
        description: 'ID do catálogo de serviços para filtrar os resultados. Quando fornecido sem catalog_item_name ou search, lista todos os itens do catálogo.'
      },
      limit: {
        type: 'number',
        description: 'Número de itens por página (padrão: 20, máximo: 200)',
        default: 20
      },
      offset: {
        type: 'number',
        description: 'Número da página a ser retornada (padrão: 1)',
        default: 1
      }
    },
    required: []
  }
};

function errorTextResponse(message) {
  return {
    content: [{ type: 'text', text: `Erro ao buscar item de catalogo: ${message}` }],
    isError: true
  };
}

async function execute(args, { api }) {
  const {
    desk_id,
    desk_name,
    search,
    catalog_item_name,
    area_id,
    catalog_id,
    limit,
    offset
  } = args;

  try {
    if (!desk_id && !desk_name) {
      throw new Error('desk_id ou desk_name e obrigatorio para buscar itens de catalogo');
    }

    if (!search && !catalog_item_name && !area_id && !catalog_id) {
      throw new Error('Forneça search para busca por termo livre, catalog_item_name para busca por nome do item, ou area_id/catalog_id para listar todos os itens de uma área/catálogo');
    }

    let finalDeskId = desk_id;
    if (!finalDeskId && desk_name) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    const filters = { limit, offset };
    if (area_id) filters.area_id = area_id;
    if (catalog_id) filters.catalog_id = catalog_id;
    if (search) filters.name = search;

    const response = await api.searchCatalogItems(finalDeskId, filters);

    if (response.error) {
      throw new Error(`Erro ao buscar itens de catalogo: ${response.error}`);
    }

    if (!response.data || response.data.length === 0) {
      if (search) {
        throw new Error(`Nenhum item de catalogo encontrado com o termo: "${search}"`);
      }
      const filterInfo = [];
      if (area_id) filterInfo.push(`area_id=${area_id}`);
      if (catalog_id) filterInfo.push(`catalog_id=${catalog_id}`);
      const filterStr = filterInfo.length > 0 ? ` com filtros: ${filterInfo.join(', ')}` : '';
      throw new Error(`Nenhum item de catalogo encontrado na mesa ${finalDeskId}${filterStr}`);
    }

    // search present: always return listing with hierarchy (never collapse to single detail)
    if (search) {
      const itemsList = response.data.map(item =>
        `- ${item.name} (ID: ${item.id})\n  Área: ${item.area.name} (ID: ${item.area.id})\n  Catálogo: ${item.catalog.name} (ID: ${item.catalog.id})`
      ).join('\n\n');

      const filterInfo = [];
      filterInfo.push(`termo: "${search}"`);
      if (area_id) filterInfo.push(`Area ID: ${area_id}`);
      if (catalog_id) filterInfo.push(`Catálogo ID: ${catalog_id}`);
      const headerInfo = `\nFiltros: ${filterInfo.join(', ')}`;

      return {
        content: [{
          type: 'text',
          text: `Itens de catálogo encontrados (${response.data.length}):${headerInfo}\n\n${itemsList}`
        }]
      };
    }

    let matchingItems = response.data;
    if (catalog_item_name) {
      const searchTerm = catalog_item_name.toLowerCase();
      matchingItems = response.data.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
      );

      if (matchingItems.length === 0) {
        throw new Error(`Nenhum item de catalogo encontrado com o nome: ${catalog_item_name}`);
      }
    }

    if (catalog_item_name && matchingItems.length > 1) {
      const itemNames = matchingItems.map(item =>
        `${item.name} (ID: ${item.id}, Area: ${item.area.name}, Catalogo: ${item.catalog.name})`
      ).join('\n');
      throw new Error(`Multiplos itens de catalogo encontrados com o nome "${catalog_item_name}":\n${itemNames}\n\nUse um nome mais especifico ou forneça area_id/catalog_id para filtrar.`);
    }

    if (catalog_item_name && matchingItems.length === 1) {
      const item = matchingItems[0];
      return {
        content: [{
          type: 'text',
          text: `Item de catalogo encontrado:\n\nID: ${item.id}\nNome: ${item.name}\nArea: ${item.area.name} (ID: ${item.area.id})\nCatalogo: ${item.catalog.name} (ID: ${item.catalog.id})\nTempo inicial: ${item.start_time}\nTempo final: ${item.end_time}`
        }]
      };
    }

    const itemsList = matchingItems.map(item =>
      `- ${item.name} (ID: ${item.id})\n  Area: ${item.area.name} (ID: ${item.area.id})\n  Catalogo: ${item.catalog.name} (ID: ${item.catalog.id})`
    ).join('\n\n');

    const filterInfo = [];
    if (area_id) filterInfo.push(`Area ID: ${area_id}`);
    if (catalog_id) filterInfo.push(`Catalogo ID: ${catalog_id}`);
    const headerInfo = filterInfo.length > 0 ? `\nFiltros: ${filterInfo.join(', ')}` : '';

    return {
      content: [{
        type: 'text',
        text: `Itens de catalogo encontrados (${matchingItems.length}):${headerInfo}\n\n${itemsList}`
      }]
    };
  } catch (error) {
    return errorTextResponse(error.message);
  }
}

module.exports = { name: schema.name, schema, execute };

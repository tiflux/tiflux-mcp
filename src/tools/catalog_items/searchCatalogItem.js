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

const { errorResponse, withValidationResponse } = require('../_shared/errors');
const { ValidationError } = require('../_shared/validators');
const { resolveDeskName } = require('../_shared/deskResolver');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'search_catalog_item',
  description: 'Buscar itens selecionáveis em tickets de uma mesa específica (por termo livre ou nome). DIFERENTE de list_services_catalog_items (itens de uma área específica, incluindo inativos não visíveis aqui) e de list_desk_services_catalogs (catálogos vinculados à mesa). Use search para busca server-side por catálogo, área ou item; use catalog_item_name para localizar um item por nome (colapsado para detalhe único quando há 1 match).',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID da mesa onde buscar itens de catálogo. Obrigatório: informe desk_id ou desk_name (para achar a mesa, use list_desks).'
      },
      desk_name: {
        type: 'string',
        description: 'Nome da mesa para busca automática (alternativa ao desk_id; um dos dois é obrigatório). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados").'
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
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function errorTextResponse(message) {
  return errorResponse(`Erro ao buscar item de catalogo: ${message}`);
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

  // Validação de input antes do try: volta como "Problema / Como resolver" pelo embrulho
  // do export. Os `throw` dentro do try (sem resultado, ambíguo, erro da API) são
  // resultado de busca e seguem no formato próprio do catch.
  if (!desk_id && !desk_name) {
    throw new ValidationError('desk_id ou desk_name é obrigatório para buscar itens de catálogo', {
      hint: 'Informe desk_id (ID da mesa) ou desk_name (nome, aceita parcial). Para achar a mesa, use list_desks; get_desk mostra os catálogos da mesa.'
    });
  }

  if (!search && !catalog_item_name && !area_id && !catalog_id) {
    throw new ValidationError('falta o critério de busca do item de catálogo', {
      hint: 'Informe search (termo livre), catalog_item_name (nome do item) ou area_id/catalog_id (lista todos os itens da área/catálogo). Para ver os catálogos da mesa, use get_desk ou list_desk_services_catalogs.'
    });
  }

  try {
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

module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar item de catálogo', execute) };

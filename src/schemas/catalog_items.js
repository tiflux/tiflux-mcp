/**
 * Schemas para ferramentas de itens de catálogo de serviços
 */

const searchCatalogItemSchema = {
  name: 'search_catalog_item',
  description: 'Buscar itens de catálogo de serviços por nome, área ou catálogo dentro de uma mesa específica. Os itens de catálogo representam os tipos de solicitações que podem ser criadas em uma mesa. Quando catalog_item_name não é fornecido, lista todos os itens da área/catálogo especificado.',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID da mesa onde buscar itens de catálogo (use desk_id OU desk_name)'
      },
      desk_name: {
        type: 'string',
        description: 'Nome da mesa para busca automática (alternativa ao desk_id)'
      },
      catalog_item_name: {
        type: 'string',
        description: 'Nome do item de catálogo a ser buscado (busca parcial case-insensitive). Opcional quando area_id ou catalog_id são fornecidos.'
      },
      area_id: {
        type: 'number',
        description: 'ID da área de serviços para filtrar os resultados. Quando fornecido sem catalog_item_name, lista todos os itens da área.'
      },
      catalog_id: {
        type: 'number',
        description: 'ID do catálogo de serviços para filtrar os resultados. Quando fornecido sem catalog_item_name, lista todos os itens do catálogo.'
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

module.exports = {
  searchCatalogItemSchema
};

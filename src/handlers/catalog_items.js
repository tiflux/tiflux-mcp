/**
 * Handlers para operações de itens de catálogo de serviços
 */

const TiFluxAPI = require('../api/tiflux-api');

class CatalogItemHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Busca itens de catálogo por nome, área ou catálogo em uma mesa específica
   * Quando catalog_item_name não é fornecido, lista todos os itens da área/catálogo
   */
  async handleSearchCatalogItem(args) {
    const {
      desk_id,
      desk_name,
      catalog_item_name,
      area_id,
      catalog_id,
      limit,
      offset
    } = args;

    try {
      // Validar que pelo menos desk_id ou desk_name foi fornecido
      if (!desk_id && !desk_name) {
        throw new Error('desk_id ou desk_name e obrigatorio para buscar itens de catalogo');
      }

      // Validar que catalog_item_name OU area_id OU catalog_id foi fornecido
      if (!catalog_item_name && !area_id && !catalog_id) {
        throw new Error('Forneça catalog_item_name para busca por nome, ou area_id/catalog_id para listar todos os itens de uma área/catálogo');
      }

      // Resolver desk_id se desk_name foi fornecido
      let finalDeskId = desk_id;
      if (!finalDeskId && desk_name) {
        const deskResponse = await this.api.searchDesks(desk_name);

        if (deskResponse.error) {
          throw new Error(`Erro ao buscar mesa: ${deskResponse.error}`);
        }

        if (!deskResponse.data || deskResponse.data.length === 0) {
          throw new Error(`Nenhuma mesa encontrada com o nome: ${desk_name}`);
        }

        if (deskResponse.data.length > 1) {
          const deskNames = deskResponse.data.map(d => `${d.name} (ID: ${d.id})`).join(', ');
          throw new Error(`Multiplas mesas encontradas com o nome "${desk_name}": ${deskNames}. Use desk_id para especificar.`);
        }

        finalDeskId = deskResponse.data[0].id;
      }

      // Buscar itens de catálogo da mesa
      const filters = { limit, offset };
      if (area_id) filters.area_id = area_id;
      if (catalog_id) filters.catalog_id = catalog_id;

      const response = await this.api.searchCatalogItems(finalDeskId, filters);

      if (response.error) {
        throw new Error(`Erro ao buscar itens de catalogo: ${response.error}`);
      }

      if (!response.data || response.data.length === 0) {
        const filterInfo = [];
        if (area_id) filterInfo.push(`area_id=${area_id}`);
        if (catalog_id) filterInfo.push(`catalog_id=${catalog_id}`);
        const filterStr = filterInfo.length > 0 ? ` com filtros: ${filterInfo.join(', ')}` : '';
        throw new Error(`Nenhum item de catalogo encontrado na mesa ${finalDeskId}${filterStr}`);
      }

      // Se catalog_item_name foi fornecido, filtrar por nome
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

      // Se busca por nome retornou múltiplos e não é listagem
      if (catalog_item_name && matchingItems.length > 1) {
        const itemNames = matchingItems.map(item =>
          `${item.name} (ID: ${item.id}, Area: ${item.area.name}, Catalogo: ${item.catalog.name})`
        ).join('\n');
        throw new Error(`Multiplos itens de catalogo encontrados com o nome "${catalog_item_name}":\n${itemNames}\n\nUse um nome mais especifico ou forneça area_id/catalog_id para filtrar.`);
      }

      // Se é busca por nome e encontrou exatamente 1, retorna formato detalhado
      if (catalog_item_name && matchingItems.length === 1) {
        const item = matchingItems[0];
        return {
          content: [{
            type: 'text',
            text: `Item de catalogo encontrado:\n\nID: ${item.id}\nNome: ${item.name}\nArea: ${item.area.name} (ID: ${item.area.id})\nCatalogo: ${item.catalog.name} (ID: ${item.catalog.id})\nTempo inicial: ${item.start_time}\nTempo final: ${item.end_time}`
          }]
        };
      }

      // Listagem de múltiplos itens (sem filtro por nome ou com area_id/catalog_id)
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
      return {
        content: [{
          type: 'text',
          text: `Erro ao buscar item de catalogo: ${error.message}`
        }],
        isError: true
      };
    }
  }
}

module.exports = CatalogItemHandlers;

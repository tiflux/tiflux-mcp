/**
 * Handlers para operações de itens de catálogo de serviços
 */

const TiFluxAPI = require('../api/tiflux-api');

class CatalogItemHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Busca itens de catálogo por nome em uma mesa específica
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

      // Validar que catalog_item_name foi fornecido
      if (!catalog_item_name) {
        throw new Error('catalog_item_name e obrigatorio para buscar itens de catalogo');
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
        throw new Error(`Nenhum item de catalogo encontrado na mesa ${finalDeskId}`);
      }

      // Filtrar por nome (busca parcial case-insensitive)
      const searchTerm = catalog_item_name.toLowerCase();
      const matchingItems = response.data.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
      );

      if (matchingItems.length === 0) {
        throw new Error(`Nenhum item de catalogo encontrado com o nome: ${catalog_item_name}`);
      }

      if (matchingItems.length > 1) {
        const itemNames = matchingItems.map(item =>
          `${item.name} (ID: ${item.id}, Area: ${item.area.name}, Catalogo: ${item.catalog.name})`
        ).join('\n');
        throw new Error(`Multiplos itens de catalogo encontrados com o nome "${catalog_item_name}":\n${itemNames}\n\nUse um nome mais especifico ou forneça area_id/catalog_id para filtrar.`);
      }

      // Retornar o item encontrado
      const item = matchingItems[0];
      return {
        content: [{
          type: 'text',
          text: `Item de catalogo encontrado:\n\nID: ${item.id}\nNome: ${item.name}\nArea: ${item.area.name} (ID: ${item.area.id})\nCatalogo: ${item.catalog.name} (ID: ${item.catalog.id})\nTempo inicial: ${item.start_time}\nTempo final: ${item.end_time}`
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

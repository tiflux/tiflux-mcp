/**
 * Schemas dos tools relacionados a estágios
 */

const stageSchemas = {
  search_stage: {
    name: 'search_stage',
    description: 'Buscar estagios de uma mesa no TiFlux para usar em atualizacao de tickets',
    inputSchema: {
      type: 'object',
      properties: {
        desk_id: {
          type: 'number',
          description: 'ID da mesa para buscar estagios'
        },
        desk_name: {
          type: 'string',
          description: 'Nome da mesa para busca automatica (alternativa ao desk_id)'
        },
        limit: {
          type: 'number',
          description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
        },
        offset: {
          type: 'number',
          description: 'Numero da pagina (padrao: 1)'
        }
      },
      required: []
    }
  }
};

module.exports = stageSchemas;

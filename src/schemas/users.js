/**
 * Schemas dos tools relacionados a usuários
 */

const userSchemas = {
  search_user: {
    name: 'search_user',
    description: 'Buscar usuarios no TiFlux por nome para usar como responsavel em tickets',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nome do usuario a ser buscado (busca parcial)'
        },
        type: {
          type: 'string',
          description: 'Tipo de usuario (client, attendant, admin)',
          enum: ['client', 'attendant', 'admin']
        },
        active: {
          type: 'boolean',
          description: 'Filtrar usuarios ativos (true) ou inativos (false)'
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
      required: ['name']
    }
  }
};

module.exports = userSchemas;

/**
 * Schemas dos tools relacionados a clientes
 */

const clientSchemas = {
  search_client: {
    name: 'search_client',
    description: 'Buscar clientes no TiFlux por nome',
    inputSchema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Nome do cliente a ser buscado (busca parcial)'
        }
      },
      required: ['client_name']
    }
  }
};

module.exports = clientSchemas;
/**
 * Schemas dos tools relacionados a tickets
 */

const ticketSchemas = {
  get_ticket: {
    name: 'get_ticket',
    description: 'Buscar um ticket específico no TiFlux pelo ID',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'ID do ticket a ser buscado (ex: "123", "456")'
        }
      },
      required: ['ticket_id']
    }
  },

  create_ticket: {
    name: 'create_ticket',
    description: 'Criar um novo ticket no TiFlux',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Título do ticket'
        },
        description: {
          type: 'string',
          description: 'Descrição do ticket'
        },
        client_id: {
          type: 'number',
          description: 'ID do cliente (opcional - usa TIFLUX_DEFAULT_CLIENT_ID se não informado)'
        },
        client_name: {
          type: 'string',
          description: 'Nome do cliente para busca automática (alternativa ao client_id)'
        },
        desk_id: {
          type: 'number',
          description: 'ID da mesa (opcional - usa TIFLUX_DEFAULT_DESK_ID se não informado)'
        },
        priority_id: {
          type: 'number',
          description: 'ID da prioridade (opcional - usa TIFLUX_DEFAULT_PRIORITY_ID se não informado)'
        },
        services_catalogs_item_id: {
          type: 'number',
          description: 'ID do item de catálogo (opcional - usa TIFLUX_DEFAULT_CATALOG_ITEM_ID se não informado)'
        },
        status_id: {
          type: 'number',
          description: 'ID do status (opcional)'
        },
        requestor_name: {
          type: 'string',
          description: 'Nome do solicitante (opcional)'
        },
        requestor_email: {
          type: 'string',
          description: 'Email do solicitante (opcional)'
        },
        requestor_telephone: {
          type: 'string',
          description: 'Telefone do solicitante (opcional)'
        },
        responsible_id: {
          type: 'number',
          description: 'ID do responsável (opcional)'
        },
        followers: {
          type: 'string',
          description: 'Emails dos seguidores separados por vírgula (opcional)'
        }
      },
      required: ['title', 'description']
    }
  }
};

module.exports = ticketSchemas;
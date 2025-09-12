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
        desk_name: {
          type: 'string',
          description: 'Nome da mesa para busca automática (alternativa ao desk_id)'
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
  },

  update_ticket: {
    name: 'update_ticket',
    description: 'Atualizar um ticket existente no TiFlux',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'ID do ticket a ser atualizado (ex: "123", "456")'
        },
        title: {
          type: 'string',
          description: 'Novo título do ticket (opcional)'
        },
        description: {
          type: 'string',
          description: 'Nova descrição do ticket (opcional)'
        },
        client_id: {
          type: 'number',
          description: 'Novo ID do cliente (opcional)'
        },
        desk_id: {
          type: 'number',
          description: 'Novo ID da mesa (opcional - LIMITAÇÃO: API não suporta transferência de mesa via update)'
        },
        stage_id: {
          type: 'number',
          description: 'ID do estágio/fase do ticket (opcional)'
        },
        responsible_id: {
          type: 'number',
          description: 'ID do responsável (opcional - use null ou omita para remover responsável)'
        },
        followers: {
          type: 'string',
          description: 'Emails dos seguidores separados por vírgula (opcional)'
        }
      },
      required: ['ticket_id']
    }
  },

  list_tickets: {
    name: 'list_tickets',
    description: 'Listar tickets do TiFlux com filtros (pelo menos um filtro obrigatório: desk_ids/desk_name, client_ids, stage_ids/stage_name ou responsible_ids)',
    inputSchema: {
      type: 'object',
      properties: {
        desk_ids: {
          type: 'string',
          description: 'IDs das mesas separados por vírgula (ex: "1,2,3") - máximo 15 IDs'
        },
        desk_name: {
          type: 'string',
          description: 'Nome da mesa para busca automática (alternativa ao desk_ids)'
        },
        client_ids: {
          type: 'string',
          description: 'IDs dos clientes separados por vírgula (ex: "1,2,3") - máximo 15 IDs'
        },
        stage_ids: {
          type: 'string',
          description: 'IDs dos estágios separados por vírgula (ex: "1,2,3") - máximo 15 IDs'
        },
        stage_name: {
          type: 'string',
          description: 'Nome do estágio para busca automática (deve ser usado junto com desk_name)'
        },
        responsible_ids: {
          type: 'string',
          description: 'IDs dos responsáveis separados por vírgula (ex: "1,2,3") - máximo 15 IDs'
        },
        offset: {
          type: 'number',
          description: 'Número da página (padrão: 1)'
        },
        limit: {
          type: 'number',
          description: 'Número de tickets por página (padrão: 20, máximo: 200)'
        },
        is_closed: {
          type: 'boolean',
          description: 'Filtrar tickets fechados (padrão: false - apenas abertos)'
        }
      },
      required: []
    }
  }
};

module.exports = ticketSchemas;
/**
 * Schemas dos tools relacionados a tickets
 */

const ticketSchemas = {
  get_ticket: {
    name: 'get_ticket',
    description: 'Buscar um ticket específico no TiFlux pelo número',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket a ser buscado (ex: "123", "456")'
        },
        show_entities: {
          type: 'boolean',
          description: 'Incluir TODOS os campos personalizados vinculados ao ticket na resposta (padrão: false)'
        },
        include_filled_entity: {
          type: 'boolean',
          description: 'Incluir apenas campos personalizados que possuem valores preenchidos (padrão: false)'
        }
      },
      required: ['ticket_number']
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
        responsible_name: {
          type: 'string',
          description: 'Nome do responsável para busca automática (alternativa ao responsible_id)'
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
        ticket_number: {
          type: 'string',
          description: 'Número do ticket a ser atualizado (ex: "123", "456")'
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
        responsible_name: {
          type: 'string',
          description: 'Nome do responsável para busca automática (alternativa ao responsible_id)'
        },
        followers: {
          type: 'string',
          description: 'Emails dos seguidores separados por vírgula (opcional)'
        }
      },
      required: ['ticket_number']
    }
  },

  cancel_ticket: {
    name: 'cancel_ticket',
    description: 'Cancelar um ticket específico no TiFlux',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket a ser cancelado (ex: "123", "456")'
        }
      },
      required: ['ticket_number']
    }
  },

  close_ticket: {
    name: 'close_ticket',
    description: 'Fechar um ticket específico no TiFlux',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket a ser fechado (ex: "123", "456")'
        }
      },
      required: ['ticket_number']
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
  },

  create_ticket_answer: {
    name: 'create_ticket_answer',
    description: 'Criar uma nova resposta (comunicação com cliente) em um ticket específico',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket onde será criada a resposta'
        },
        text: {
          type: 'string',
          description: 'Conteúdo da resposta que será enviada ao cliente'
        },
        with_signature: {
          type: 'boolean',
          description: 'Incluir assinatura do usuário na resposta (padrão: false)'
        },
        files: {
          type: 'array',
          description: 'Lista com os caminhos dos arquivos a serem anexados (opcional, máximo 10 arquivos de 25MB cada)',
          items: {
            type: 'string'
          }
        }
      },
      required: ['ticket_number', 'text']
    }
  },

  update_ticket_entities: {
    name: 'update_ticket_entities',
    description: 'Atualizar campos personalizados (entities) de um ticket no TiFlux. Suporta até 50 campos por requisição.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket a ser atualizado'
        },
        entities: {
          type: 'array',
          description: 'Lista de campos personalizados a serem atualizados',
          items: {
            type: 'object',
            properties: {
              entity_field_id: {
                type: 'number',
                description: 'ID do campo personalizado (obtido via get_ticket)'
              },
              value: {
                type: 'string',
                description: 'Valor do campo. Tipos aceitos: text (string), text_area (string), currency (float como string ex: "150.55"), phone (apenas números ex: "47999999999"), email (string), link (URL começando com http/https/ftp), date (formato YYYY-MM-DD), single_select (ID da opção como string), checkbox (boolean como string "true"/"false"). Use null para limpar campos não obrigatórios.'
              },
              country_code: {
                type: 'string',
                description: 'Código do país (opcional, apenas para campos tipo phone de outros países além do Brasil)'
              }
            },
            required: ['entity_field_id', 'value']
          }
        }
      },
      required: ['ticket_number', 'entities']
    }
  },

  get_ticket_files: {
    name: 'get_ticket_files',
    description: 'Buscar arquivos anexados a um ticket específico no TiFlux',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket para buscar os arquivos anexados (ex: "123", "456")'
        }
      },
      required: ['ticket_number']
    }
  }
};

module.exports = ticketSchemas;
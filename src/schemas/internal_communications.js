/**
 * Schemas dos tools relacionados a comunicações internas dos tickets
 */

const internalCommunicationsSchemas = {
  create_internal_communication: {
    name: 'create_internal_communication',
    description: 'Criar uma nova comunicação interna em um ticket específico',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket onde será criada a comunicação interna'
        },
        text: {
          type: 'string',
          description: 'Conteúdo da comunicação interna'
        },
        files: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Lista com os caminhos dos arquivos locais a serem anexados (opcional, máximo 10 arquivos de 25MB cada)'
        },
        files_base64: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Conteúdo do arquivo codificado em base64'
              },
              filename: {
                type: 'string',
                description: 'Nome do arquivo com extensão (ex: "documento.pdf", "planilha.csv")'
              }
            },
            required: ['content', 'filename']
          },
          description: 'Lista de arquivos em formato base64 para anexar (alternativa ao parâmetro files, máximo 10 arquivos de 25MB cada)'
        }
      },
      required: ['ticket_number', 'text']
    }
  },

  list_internal_communications: {
    name: 'list_internal_communications',
    description: 'Listar comunicações internas existentes em um ticket específico',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket para listar as comunicações internas'
        },
        offset: {
          type: 'number',
          description: 'Número da página a ser retornada (padrão: 1)'
        },
        limit: {
          type: 'number',
          description: 'Número de comunicações por página (padrão: 20, máximo: 200)'
        }
      },
      required: ['ticket_number']
    }
  },

  get_internal_communication: {
    name: 'get_internal_communication',
    description: 'Obter uma comunicação interna específica com texto completo',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_number: {
          type: 'string',
          description: 'Número do ticket da comunicação interna'
        },
        communication_id: {
          type: 'string',
          description: 'ID da comunicação interna a ser obtida'
        }
      },
      required: ['ticket_number', 'communication_id']
    }
  }
};

module.exports = internalCommunicationsSchemas;
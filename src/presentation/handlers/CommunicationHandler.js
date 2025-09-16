/**
 * CommunicationHandler - Handler limpo para operações de comunicação interna
 *
 * Responsabilidades:
 * - Receber requests MCP e validar parâmetros básicos
 * - Delegar lógica de negócio para CommunicationService
 * - Aplicar formatação de resposta via middleware
 * - Error handling padronizado para uploads
 * - Logging de requests/responses
 * - Suporte a múltiplos arquivos (até 10 arquivos, 25MB cada)
 */

class CommunicationHandler {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.communicationService = container.resolve('communicationService');
    this.domainValidator = container.resolve('domainValidator');
    this.responseFormatter = null; // Lazy loading
  }

  /**
   * Handler para criar comunicação interna
   */
  async handleCreateInternalCommunication(args) {
    const timer = this.logger.startTimer('handle_create_internal_communication');

    try {
      this.logger.info('Handling create internal communication request', {
        ticketNumber: args.ticket_number,
        hasText: !!args.text,
        textLength: args.text?.length || 0,
        hasFiles: !!(args.files && args.files.length > 0),
        fileCount: args.files?.length || 0
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      if (!args.text) {
        throw new ValidationError('text é obrigatório');
      }

      // Monta dados da comunicação
      const communicationData = {
        text: args.text,
        files: args.files || [],
        visibility: args.visibility || 'internal'
      };

      // Validação usando domain validator
      await this.domainValidator.validateCommunicationCreation(args.ticket_number, communicationData);

      // Delega para o domain service
      const result = await this.communicationService.createInternalCommunication(args.ticket_number, communicationData);

      timer();
      return this._formatCreateResult(result, args.ticket_number);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle create internal communication', {
        ticketNumber: args.ticket_number,
        textLength: args.text?.length || 0,
        fileCount: args.files?.length || 0,
        error: error.message
      });

      return this._formatErrorResponse(error, 'create_internal_communication');
    }
  }

  /**
   * Handler para listar comunicações internas
   */
  async handleListInternalCommunications(args) {
    const timer = this.logger.startTimer('handle_list_internal_communications');

    try {
      this.logger.info('Handling list internal communications request', {
        ticketNumber: args.ticket_number,
        limit: args.limit,
        offset: args.offset
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      const filters = {
        limit: args.limit || 20,
        offset: args.offset || 1
      };

      // Delega para o domain service
      const result = await this.communicationService.listInternalCommunications(args.ticket_number, filters);

      timer();
      return this._formatListResult(result, args.ticket_number);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle list internal communications', {
        ticketNumber: args.ticket_number,
        error: error.message
      });

      return this._formatErrorResponse(error, 'list_internal_communications');
    }
  }

  /**
   * Handler para buscar comunicação interna específica
   */
  async handleGetInternalCommunication(args) {
    const timer = this.logger.startTimer('handle_get_internal_communication');

    try {
      this.logger.info('Handling get internal communication request', {
        ticketNumber: args.ticket_number,
        communicationId: args.communication_id
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      if (!args.communication_id) {
        throw new ValidationError('communication_id é obrigatório');
      }

      // Delega para o domain service
      const result = await this.communicationService.getInternalCommunication(args.ticket_number, args.communication_id);

      timer();
      return this._formatCommunicationResult(result, args.ticket_number);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle get internal communication', {
        ticketNumber: args.ticket_number,
        communicationId: args.communication_id,
        error: error.message
      });

      return this._formatErrorResponse(error, 'get_internal_communication');
    }
  }

  /**
   * Formata resultado da criação de comunicação
   */
  _formatCreateResult(communication, ticketNumber) {
    if (!communication) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ **Erro ao criar comunicação interna**\n\n' +
                  'Não foi possível criar a comunicação interna.\n\n' +
                  '*Verifique os dados fornecidos e tente novamente.*'
          }
        ]
      };
    }

    let content = `✅ **Comunicação interna criada com sucesso**\n\n`;
    content += `**Ticket:** #${ticketNumber}\n`;
    content += `**ID da Comunicação:** ${communication.id}\n`;

    if (communication.author) {
      content += `**Autor:** ${communication.author.name || communication.author.id}\n`;
    }

    if (communication.created_at) {
      const date = new Date(communication.created_at);
      content += `**Data:** ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR')}\n`;
    }

    content += '\n**Conteúdo:**\n';
    const textPreview = communication.text && communication.text.length > 200
      ? communication.text.substring(0, 200) + '...'
      : communication.text;
    content += `${textPreview}\n`;

    // Arquivos anexados
    if (communication.attachments && communication.attachments.length > 0) {
      content += `\n📎 **Arquivos Anexados (${communication.attachments.length}):**\n`;
      communication.attachments.forEach((attachment, index) => {
        content += `${index + 1}. **${attachment.filename}**`;
        if (attachment.size_formatted) {
          content += ` (${attachment.size_formatted})`;
        }
        if (attachment.file_type) {
          content += ` - ${attachment.file_type}`;
        }
        content += '\n';
      });
    }

    content += '\n*Comunicação interna criada com sucesso no TiFlux.*';

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  /**
   * Formata resultado da listagem de comunicações
   */
  _formatListResult(result, ticketNumber) {
    if (!result || !result.communications || result.communications.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📭 **Nenhuma comunicação interna encontrada**\n\n` +
                  `**Ticket:** #${ticketNumber}\n\n` +
                  'Não há comunicações internas registradas para este ticket.\n\n' +
                  '*Use create_internal_communication para adicionar uma nova comunicação.*'
          }
        ]
      };
    }

    const { communications, pagination } = result;

    let content = `💬 **Comunicações Internas - Ticket #${ticketNumber}**\n\n`;

    if (pagination) {
      content += `📊 **Resumo:** ${pagination.total} comunicação(ões) • Página ${pagination.current_page} de ${pagination.total_pages}\n\n`;
    }

    communications.forEach((comm, index) => {
      const position = pagination ? ((pagination.current_page - 1) * pagination.per_page) + index + 1 : index + 1;
      content += `**${position}. Comunicação #${comm.id}**\n`;

      if (comm.author) {
        content += `👤 **Autor:** ${comm.author.name || comm.author.id}\n`;
      }

      if (comm.created_at) {
        const date = new Date(comm.created_at);
        content += `📅 **Data:** ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR')}\n`;
      }

      // Preview do texto
      const textPreview = comm.text && comm.text.length > 150
        ? comm.text.substring(0, 150) + '...'
        : comm.text;
      content += `📝 **Conteúdo:** ${textPreview}\n`;

      // Anexos
      if (comm.attachments && comm.attachments.length > 0) {
        content += `📎 **Anexos:** ${comm.attachments.length} arquivo(s)\n`;
      }

      content += '\n';
    });

    // Paginação
    if (pagination && pagination.total_pages > 1) {
      content += '---\n';
      content += `📄 **Paginação:** Página ${pagination.current_page} de ${pagination.total_pages}\n`;
      if (pagination.current_page < pagination.total_pages) {
        content += `*Use offset=${pagination.current_page + 1} para ver a próxima página.*\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  /**
   * Formata resultado de comunicação individual
   */
  _formatCommunicationResult(communication, ticketNumber) {
    if (!communication) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Comunicação não encontrada**\n\n` +
                  `**Ticket:** #${ticketNumber}\n\n` +
                  'A comunicação solicitada não foi encontrada ou não está acessível.\n\n' +
                  '*Verifique o ID da comunicação e tente novamente.*'
          }
        ]
      };
    }

    let content = `💬 **Detalhes da Comunicação**\n\n`;
    content += `**Ticket:** #${ticketNumber}\n`;
    content += `**ID da Comunicação:** ${communication.id}\n`;

    // Metadados
    if (communication.author) {
      content += `**Autor:** ${communication.author.name || communication.author.id}\n`;
      if (communication.author.email) {
        content += `**Email do Autor:** ${communication.author.email}\n`;
      }
    }

    if (communication.created_at) {
      const date = new Date(communication.created_at);
      content += `**Data de Criação:** ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR')}\n`;
    }

    if (communication.visibility) {
      const visibilityText = {
        internal: '🔒 Interna',
        private: '🔐 Privada',
        public: '🌐 Pública',
        client: '👤 Cliente'
      };
      content += `**Visibilidade:** ${visibilityText[communication.visibility] || communication.visibility}\n`;
    }

    // Conteúdo completo
    content += '\n**Conteúdo Completo:**\n';
    content += '```\n';
    content += communication.text || 'Nenhum conteúdo de texto';
    content += '\n```\n';

    // Anexos detalhados
    if (communication.attachments && communication.attachments.length > 0) {
      content += `\n📎 **Arquivos Anexados (${communication.attachments.length}):**\n\n`;

      communication.attachments.forEach((attachment, index) => {
        content += `**${index + 1}. ${attachment.filename}**\n`;

        if (attachment.size_formatted) {
          content += `   📏 Tamanho: ${attachment.size_formatted}\n`;
        }

        if (attachment.file_type) {
          content += `   📄 Tipo: ${attachment.file_type}\n`;
        }

        if (attachment.file_classification) {
          const classificationText = {
            image: '🖼️ Imagem',
            document: '📄 Documento',
            archive: '📦 Arquivo',
            other: '📎 Outros'
          };
          content += `   🏷️ Classificação: ${classificationText[attachment.file_classification] || attachment.file_classification}\n`;
        }

        if (attachment.download_url) {
          content += `   🔗 [Baixar arquivo](${attachment.download_url})\n`;
        }

        content += '\n';
      });
    }

    // URLs úteis
    if (communication.communication_url) {
      content += `🔗 **Links Úteis**\n`;
      content += `• [Ver Comunicação no TiFlux](${communication.communication_url})\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  /**
   * Formata resposta de erro padronizada
   */
  _formatErrorResponse(error, operation) {
    // Tipos de erro conhecidos
    const errorMap = {
      ValidationError: '❌',
      NotFoundError: '🔍',
      APIError: '🔌',
      TimeoutError: '⏱️',
      NetworkError: '🌐',
      FileUploadError: '📎'
    };

    const icon = errorMap[error.constructor.name] || '❌';
    const operationText = {
      create_internal_communication: 'criar comunicação interna',
      list_internal_communications: 'listar comunicações internas',
      get_internal_communication: 'buscar comunicação interna'
    };

    let errorMessage = error.message;

    // Adiciona contexto específico para alguns erros
    if (error.constructor.name === 'ValidationError') {
      if (error.message.includes('arquivo') || error.message.includes('file')) {
        errorMessage = `Erro nos arquivos: ${error.message}`;
      } else {
        errorMessage = `Dados inválidos: ${error.message}`;
      }
    } else if (error.constructor.name === 'NotFoundError') {
      errorMessage = `Recurso não encontrado: ${error.message}`;
    } else if (error.constructor.name === 'APIError') {
      errorMessage = `Erro na API: ${error.message}`;
      if (error.statusCode) {
        errorMessage += ` (HTTP ${error.statusCode})`;
      }
    } else if (error.constructor.name === 'FileUploadError') {
      errorMessage = `Erro no upload: ${error.message}`;
    }

    // Dicas específicas para comunicações
    let tips = '*Verifique os parâmetros fornecidos e tente novamente.*';
    if (operation === 'create_internal_communication') {
      tips = '*Dicas:*\n' +
             '• Verifique se o ticket_number é válido\n' +
             '• Certifique-se de que o texto não está vazio\n' +
             '• Arquivos devem ter no máximo 25MB cada\n' +
             '• Máximo de 10 arquivos por comunicação\n' +
             '• Extensões perigosas (.exe, .bat, etc.) são bloqueadas';
    }

    return {
      content: [
        {
          type: 'text',
          text: `**${icon} Erro ao ${operationText[operation] || 'processar solicitação'}**\n\n` +
                `**Erro:** ${errorMessage}\n\n` +
                tips
        }
      ]
    };
  }

  /**
   * Lazy loading do ResponseFormatter
   */
  _getResponseFormatter() {
    if (!this.responseFormatter) {
      this.responseFormatter = this.container.resolve('responseFormatter');
    }
    return this.responseFormatter;
  }

  /**
   * Estatísticas do handler
   */
  getStats() {
    return {
      operations: ['create_internal_communication', 'list_internal_communications', 'get_internal_communication'],
      features: {
        domain_service_integration: true,
        file_upload_support: true,
        multipart_handling: true,
        validation_support: true,
        error_formatting: true,
        request_logging: true,
        performance_timing: true,
        result_formatting: true
      },
      dependencies: {
        communicationService: !!this.communicationService,
        domainValidator: !!this.domainValidator,
        logger: !!this.logger
      },
      capabilities: {
        max_files_per_communication: 10,
        max_file_size_mb: 25,
        max_total_size_mb: 100,
        supported_visibilities: ['internal', 'private', 'public', 'client'],
        blocked_extensions: ['exe', 'bat', 'cmd', 'scr', 'com']
      }
    };
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = CommunicationHandler;
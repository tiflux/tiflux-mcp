/**
 * CommunicationService - Lógica de negócio para comunicações internas
 *
 * Centraliza operações relacionadas a comunicações internas:
 * - Criação com suporte a anexos
 * - Listagem paginada
 * - Busca de comunicação específica
 * - Cache inteligente
 * - Validações de negócio
 * - File upload handling
 */

class CommunicationService {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
    this.cacheStrategy = container.resolve('cacheStrategy');
    this.communicationRepository = null; // Lazy loading
    this.communicationValidator = null;
  }

  /**
   * Cria uma nova comunicação interna
   */
  async createCommunication(ticketNumber, communicationData) {
    const timer = this.logger.startTimer(`create_communication_${ticketNumber}`);

    try {
      this.logger.info('Creating internal communication', {
        ticketNumber,
        hasText: !!communicationData.text,
        hasFiles: !!(communicationData.files && communicationData.files.length > 0),
        fileCount: communicationData.files?.length || 0
      });

      // Validação de dados
      await this._getCommunicationValidator().validateCreateData(ticketNumber, communicationData);

      // Aplicar business rules
      const processedData = await this._applyCreateBusinessRules(ticketNumber, communicationData);

      // Criar no repository
      const createdCommunication = await this._getCommunicationRepository().create(
        ticketNumber,
        processedData
      );

      // Invalida cache relacionado
      await this.cacheStrategy.invalidateCommunications(ticketNumber);

      timer();
      this.logger.info('Internal communication created successfully', {
        ticketNumber,
        communicationId: createdCommunication.id,
        hasAttachments: !!(createdCommunication.attachments && createdCommunication.attachments.length > 0)
      });

      return this._formatCommunicationForResponse(createdCommunication, 'created');

    } catch (error) {
      timer();
      this.logger.error('Failed to create internal communication', {
        ticketNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lista comunicações internas de um ticket
   */
  async listCommunications(ticketNumber, options = {}) {
    const timer = this.logger.startTimer(`list_communications_${ticketNumber}`);

    try {
      this.logger.info('Listing internal communications', {
        ticketNumber,
        limit: options.limit,
        offset: options.offset
      });

      // Validação básica
      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      const normalizedTicketNumber = ticketNumber.toString().trim();

      // Normaliza opções
      const normalizedOptions = {
        limit: Math.min(parseInt(options.limit) || 20, 200),
        offset: Math.max(parseInt(options.offset) || 1, 1)
      };

      // Tenta buscar no cache
      const cacheKey = this._buildCacheKey(normalizedTicketNumber, normalizedOptions);
      const cached = await this.cacheStrategy.getCommunications(cacheKey);
      if (cached) {
        this.logger.debug('Communications found in cache', {
          ticketNumber: normalizedTicketNumber,
          count: cached.length
        });
        timer();
        return this._formatCommunicationListForResponse(cached, normalizedTicketNumber);
      }

      // Busca no repository
      const communications = await this._getCommunicationRepository().list(
        normalizedTicketNumber,
        normalizedOptions
      );

      // Cache o resultado
      await this.cacheStrategy.cacheCommunications(cacheKey, communications);

      timer();
      this.logger.info('Internal communications listed successfully', {
        ticketNumber: normalizedTicketNumber,
        count: communications.communications?.length || 0
      });

      return this._formatCommunicationListForResponse(communications, normalizedTicketNumber);

    } catch (error) {
      timer();
      this.logger.error('Failed to list internal communications', {
        ticketNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Busca uma comunicação interna específica
   */
  async getCommunication(ticketNumber, communicationId) {
    const timer = this.logger.startTimer(`get_communication_${ticketNumber}_${communicationId}`);

    try {
      this.logger.info('Getting internal communication', {
        ticketNumber,
        communicationId
      });

      // Validações
      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      if (!communicationId || communicationId.toString().trim() === '') {
        throw new ValidationError('communication_id é obrigatório');
      }

      const normalizedTicketNumber = ticketNumber.toString().trim();
      const normalizedCommunicationId = communicationId.toString().trim();

      // Tenta buscar no cache
      const cached = await this.cacheStrategy.getCommunication(
        normalizedTicketNumber,
        normalizedCommunicationId
      );
      if (cached) {
        this.logger.debug('Communication found in cache', {
          ticketNumber: normalizedTicketNumber,
          communicationId: normalizedCommunicationId
        });
        timer();
        return this._formatCommunicationForResponse(cached, 'retrieved');
      }

      // Busca no repository
      const communication = await this._getCommunicationRepository().getById(
        normalizedTicketNumber,
        normalizedCommunicationId
      );

      if (!communication) {
        throw new NotFoundError(
          `Comunicação interna #${normalizedCommunicationId} não encontrada no ticket #${normalizedTicketNumber}`
        );
      }

      // Cache o resultado
      await this.cacheStrategy.cacheCommunication(
        normalizedTicketNumber,
        normalizedCommunicationId,
        communication
      );

      timer();
      this.logger.info('Internal communication retrieved successfully', {
        ticketNumber: normalizedTicketNumber,
        communicationId: normalizedCommunicationId
      });

      return this._formatCommunicationForResponse(communication, 'retrieved');

    } catch (error) {
      timer();
      this.logger.error('Failed to get internal communication', {
        ticketNumber,
        communicationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Aplica business rules na criação de comunicações
   */
  async _applyCreateBusinessRules(ticketNumber, communicationData) {
    const processed = { ...communicationData };

    // 1. Validar tamanho e tipo de arquivos
    if (processed.files && processed.files.length > 0) {
      const maxFiles = this.config.get('communications.maxFiles', 10);
      const maxFileSize = this.config.get('communications.maxFileSize', 25 * 1024 * 1024); // 25MB

      if (processed.files.length > maxFiles) {
        throw new ValidationError(`Máximo de ${maxFiles} arquivos permitidos por comunicação`);
      }

      // Validar cada arquivo
      processed.files.forEach((file, index) => {
        if (!file || typeof file !== 'string') {
          throw new ValidationError(`Arquivo ${index + 1} inválido: caminho não fornecido`);
        }

        // Verifica se arquivo existe e tamanho
        const fs = require('fs');
        if (!fs.existsSync(file)) {
          throw new ValidationError(`Arquivo não encontrado: ${file}`);
        }

        const stats = fs.statSync(file);
        if (stats.size > maxFileSize) {
          const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
          throw new ValidationError(`Arquivo ${file} excede o tamanho máximo de ${maxSizeMB}MB`);
        }

        // Validar extensões permitidas (se configurado)
        const allowedExtensions = this.config.get('communications.allowedExtensions');
        if (allowedExtensions && allowedExtensions.length > 0) {
          const path = require('path');
          const fileExt = path.extname(file).toLowerCase().substring(1);

          if (!allowedExtensions.includes(fileExt)) {
            throw new ValidationError(
              `Extensão ${fileExt} não permitida. Permitidas: ${allowedExtensions.join(', ')}`
            );
          }
        }
      });

      this.logger.debug('File validation passed', {
        fileCount: processed.files.length,
        maxFiles,
        maxFileSize: Math.round(maxFileSize / (1024 * 1024)) + 'MB'
      });
    }

    // 2. Sanitizar HTML no texto (se configurado)
    if (processed.text && this.config.get('communications.sanitizeHtml', false)) {
      // Implementar sanitização HTML se necessário
      this.logger.debug('HTML sanitization not implemented', {
        textLength: processed.text.length
      });
    }

    // 3. Validar referências ao ticket
    // Pode verificar se o ticket existe aqui se necessário
    this.logger.debug('Business rules applied successfully', {
      ticketNumber,
      hasFiles: !!(processed.files && processed.files.length > 0)
    });

    return processed;
  }

  /**
   * Formata comunicação individual para resposta
   */
  _formatCommunicationForResponse(communicationData, action = 'retrieved') {
    const actionTexts = {
      created: '✅ Comunicação Interna Criada com Sucesso',
      retrieved: 'Detalhes da Comunicação Interna',
      updated: '✅ Comunicação Interna Atualizada'
    };

    const communication = communicationData.communication || communicationData;

    let text = `**${actionTexts[action]}**\n\n`;

    text += `**ID:** ${communication.id || 'N/A'}\n`;
    text += `**Ticket:** #${communication.ticket_number || 'N/A'}\n`;

    if (communication.author) {
      text += `**Autor:** ${communication.author.name || communication.author || 'N/A'}\n`;
    }

    if (communication.created_at) {
      const date = new Date(communication.created_at);
      text += `**Data:** ${date.toLocaleString('pt-BR')}\n`;
    }

    text += '\n**Conteúdo:**\n';
    text += communication.text || 'Sem conteúdo de texto';

    // Anexos
    if (communication.attachments && communication.attachments.length > 0) {
      text += `\n\n**📎 Anexos (${communication.attachments.length}):**\n`;

      communication.attachments.forEach((attachment, index) => {
        const fileName = attachment.filename || attachment.name || `Anexo ${index + 1}`;
        const fileSize = attachment.size ? this._formatFileSize(attachment.size) : 'Tamanho desconhecido';

        text += `${index + 1}. **${fileName}** (${fileSize})\n`;

        if (attachment.url) {
          text += `   🔗 [Download](${attachment.url})\n`;
        }
      });
    }

    return {
      content: [{
        type: 'text',
        text: text
      }]
    };
  }

  /**
   * Formata lista de comunicações para resposta
   */
  _formatCommunicationListForResponse(listData, ticketNumber) {
    const communications = listData.communications || listData || [];

    if (communications.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `**📝 Comunicações Internas - Ticket #${ticketNumber}**\n\n` +
                `Nenhuma comunicação interna encontrada para este ticket.`
        }]
      };
    }

    let text = `**📝 Comunicações Internas - Ticket #${ticketNumber}**\n\n`;
    text += `**${communications.length} comunicação(ões) encontrada(s):**\n\n`;

    communications.forEach((communication, index) => {
      const hasAttachments = communication.attachments && communication.attachments.length > 0;
      const attachmentIcon = hasAttachments ? '📎' : '';

      text += `**${index + 1}. ${attachmentIcon} Comunicação #${communication.id}**\n`;

      if (communication.author) {
        text += `   **Autor:** ${communication.author.name || communication.author}\n`;
      }

      if (communication.created_at) {
        const date = new Date(communication.created_at);
        text += `   **Data:** ${date.toLocaleString('pt-BR')}\n`;
      }

      // Preview do conteúdo
      if (communication.text) {
        const preview = communication.text.substring(0, 100);
        const truncated = communication.text.length > 100 ? '...' : '';
        text += `   **Conteúdo:** ${preview}${truncated}\n`;
      }

      if (hasAttachments) {
        text += `   **Anexos:** ${communication.attachments.length} arquivo(s)\n`;
      }

      text += '\n';
    });

    // Informação de paginação se disponível
    const pagination = listData.pagination;
    if (pagination && pagination.has_more) {
      text += `**📄 Paginação**\n`;
      text += `Página atual: ${pagination.current_page || 'N/A'}\n`;
      text += `Há mais comunicações disponíveis.\n\n`;
    }

    text += `💡 *Use get_internal_communication para ver detalhes completos e anexos.*`;

    return {
      content: [{
        type: 'text',
        text: text
      }]
    };
  }

  /**
   * Constrói chave de cache para listagem
   */
  _buildCacheKey(ticketNumber, options) {
    const parts = [ticketNumber];

    if (options.limit && options.limit !== 20) {
      parts.push(`limit_${options.limit}`);
    }

    if (options.offset && options.offset !== 1) {
      parts.push(`offset_${options.offset}`);
    }

    return parts.join('_');
  }

  /**
   * Formata tamanho de arquivo
   */
  _formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Lazy loading do CommunicationRepository
   */
  _getCommunicationRepository() {
    if (!this.communicationRepository) {
      this.communicationRepository = this.container.resolve('communicationRepository');
    }
    return this.communicationRepository;
  }

  /**
   * Lazy loading do CommunicationValidator
   */
  _getCommunicationValidator() {
    if (!this.communicationValidator) {
      this.communicationValidator = this.container.resolve('communicationValidator');
    }
    return this.communicationValidator;
  }

  /**
   * Estatísticas do service
   */
  getStats() {
    return {
      cache: {
        communications_ttl: '3 minutes',
        specific_communication_ttl: '10 minutes'
      },
      file_upload: {
        max_files: this.config.get('communications.maxFiles', 10),
        max_file_size: this.config.get('communications.maxFileSize', 25 * 1024 * 1024),
        allowed_extensions: this.config.get('communications.allowedExtensions', [])
      },
      features: {
        html_sanitization: this.config.get('communications.sanitizeHtml', false),
        file_validation: true,
        cache_invalidation: true
      }
    };
  }
}

// Import das classes de erro
const { ValidationError, NotFoundError } = require('../../utils/errors');

module.exports = CommunicationService;
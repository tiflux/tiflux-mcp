/**
 * TicketService - Lógica de negócio para tickets
 *
 * Centraliza todas as operações relacionadas a tickets:
 * - Business rules e validações
 * - Formatação e transformação de dados
 * - Cache inteligente
 * - Error handling específico
 * - Logging de operações
 */

class TicketService {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
    this.cacheStrategy = container.resolve('cacheStrategy');
    this.ticketRepository = null; // Será injetado após criar TicketRepository
    this.ticketValidator = null;  // Será injetado após criar TicketValidator
    this.ticketMapper = null;     // Será injetado após criar TicketMapper
  }

  /**
   * Busca um ticket por número com cache inteligente
   */
  async getTicket(ticketNumber) {
    const timer = this.logger.startTimer(`get_ticket_${ticketNumber}`);

    try {
      this.logger.info('Getting ticket', { ticketNumber });

      // Validação básica
      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Normaliza número
      const normalizedNumber = ticketNumber.toString().trim();

      // Tenta buscar no cache primeiro
      const cached = await this.cacheStrategy.getTicket(normalizedNumber);
      if (cached) {
        this.logger.debug('Ticket found in cache', { ticketNumber: normalizedNumber });
        timer();
        return this._formatTicketForResponse(cached);
      }

      // Busca no repository (API)
      this.logger.debug('Fetching ticket from API', { ticketNumber: normalizedNumber });
      const ticketData = await this._getTicketRepository().getById(normalizedNumber);

      // Valida dados retornados
      if (!ticketData) {
        throw new NotFoundError(`Ticket #${normalizedId} não encontrado`);
      }

      // Cache o resultado
      await this.cacheStrategy.cacheTicket(normalizedId, ticketData);

      timer();
      this.logger.info('Ticket retrieved successfully', {
        ticketId: normalizedId,
        title: ticketData.title?.substring(0, 50) || 'N/A'
      });

      return this._formatTicketForResponse(ticketData);

    } catch (error) {
      timer();
      this.logger.error('Failed to get ticket', {
        ticketId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cria um novo ticket
   */
  async createTicket(ticketData) {
    const timer = this.logger.startTimer('create_ticket');

    try {
      this.logger.info('Creating ticket', {
        title: ticketData.title?.substring(0, 50) || 'N/A',
        clientId: ticketData.client_id || ticketData.client_name
      });

      // Validação de dados de entrada
      await this._getTicketValidator().validateCreateData(ticketData);

      // Aplica business rules
      const processedData = await this._applyCreateBusinessRules(ticketData);

      // Cria no repository
      const createdTicket = await this._getTicketRepository().create(processedData);

      // Invalida cache relacionado
      await this.cacheStrategy.invalidateTicket(createdTicket.id);

      timer();
      this.logger.info('Ticket created successfully', {
        ticketId: createdTicket.id,
        title: createdTicket.title?.substring(0, 50) || 'N/A'
      });

      return this._formatTicketForResponse(createdTicket, 'created');

    } catch (error) {
      timer();
      this.logger.error('Failed to create ticket', {
        title: ticketData.title?.substring(0, 50),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Atualiza um ticket existente
   */
  async updateTicket(ticketNumber, updateData) {
    const timer = this.logger.startTimer(`update_ticket_${ticketNumber}`);

    try {
      this.logger.info('Updating ticket', {
        ticketNumber,
        fields: Object.keys(updateData)
      });

      // Validações
      if (!ticketNumber) {
        throw new ValidationError('ticket_number é obrigatório para atualização');
      }

      const normalizedNumber = ticketNumber.toString().trim();

      // Valida dados de atualização
      await this._getTicketValidator().validateUpdateData(updateData);

      // Busca ticket atual (para validar se existe)
      const currentTicket = await this._getTicketRepository().getById(normalizedNumber);
      if (!currentTicket) {
        throw new NotFoundError(`Ticket #${normalizedNumber} não encontrado`);
      }

      // Aplica business rules de atualização
      const processedUpdateData = await this._applyUpdateBusinessRules(
        currentTicket,
        updateData
      );

      // Atualiza no repository
      const updatedTicket = await this._getTicketRepository().update(
        normalizedId,
        processedUpdateData
      );

      // Invalida cache
      await this.cacheStrategy.invalidateTicket(normalizedId);

      timer();
      this.logger.info('Ticket updated successfully', {
        ticketId: normalizedId,
        updatedFields: Object.keys(processedUpdateData)
      });

      return this._formatTicketForResponse(updatedTicket, 'updated');

    } catch (error) {
      timer();
      this.logger.error('Failed to update ticket', {
        ticketId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fecha um ticket específico
   */
  async closeTicket(ticketNumber) {
    const timer = this.logger.startTimer(`close_ticket_${ticketNumber}`);

    try {
      this.logger.info('Closing ticket', { ticketNumber });

      // Validação básica
      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      const normalizedTicketNumber = ticketNumber.toString().trim();

      // Fecha o ticket no repository
      const result = await this._getTicketRepository().close(normalizedTicketNumber);

      // Invalida cache relacionado
      await this.cacheStrategy.invalidateTicket(normalizedTicketNumber);

      timer();
      this.logger.info('Ticket closed successfully', {
        ticketNumber: normalizedTicketNumber,
        message: result.message
      });

      return this._formatCloseTicketForResponse(result, normalizedTicketNumber);

    } catch (error) {
      timer();
      this.logger.error('Failed to close ticket', {
        ticketNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lista tickets com filtros
   */
  async listTickets(filters = {}) {
    const timer = this.logger.startTimer('list_tickets');

    try {
      this.logger.info('Listing tickets', {
        filters: Object.keys(filters),
        hasClientIds: !!filters.client_ids,
        hasDeskIds: !!filters.desk_ids
      });

      // Validação de filtros obrigatórios
      await this._getTicketValidator().validateListFilters(filters);

      // Normaliza filtros
      const normalizedFilters = this._normalizeListFilters(filters);

      // Tenta buscar no cache
      const cached = await this.cacheStrategy.getTicketList(normalizedFilters);
      if (cached) {
        this.logger.debug('Ticket list found in cache', {
          filterHash: this._hashFilters(normalizedFilters),
          count: cached.tickets?.length || 0
        });
        timer();
        return this._formatTicketListForResponse(cached);
      }

      // Busca no repository
      const ticketList = await this._getTicketRepository().list(normalizedFilters);

      // Cache o resultado
      await this.cacheStrategy.cacheTicketList(normalizedFilters, ticketList);

      timer();
      this.logger.info('Tickets listed successfully', {
        count: ticketList.tickets?.length || 0,
        hasMore: !!ticketList.has_more
      });

      return this._formatTicketListForResponse(ticketList);

    } catch (error) {
      timer();
      this.logger.error('Failed to list tickets', {
        filters: Object.keys(filters),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Aplica business rules na criação de tickets
   */
  async _applyCreateBusinessRules(ticketData) {
    const processed = { ...ticketData };

    // 1. Define valores padrão se não fornecidos
    if (!processed.client_id && this.config.get('defaults.client_id')) {
      processed.client_id = this.config.get('defaults.client_id');
      this.logger.debug('Applied default client_id', { clientId: processed.client_id });
    }

    if (!processed.desk_id && this.config.get('defaults.desk_id')) {
      processed.desk_id = this.config.get('defaults.desk_id');
      this.logger.debug('Applied default desk_id', { deskId: processed.desk_id });
    }

    if (!processed.priority_id && this.config.get('defaults.priority_id')) {
      processed.priority_id = this.config.get('defaults.priority_id');
      this.logger.debug('Applied default priority_id', { priorityId: processed.priority_id });
    }

    if (!processed.services_catalogs_item_id && this.config.get('defaults.catalog_item_id')) {
      processed.services_catalogs_item_id = this.config.get('defaults.catalog_item_id');
      this.logger.debug('Applied default catalog_item_id', { catalogItemId: processed.services_catalogs_item_id });
    }

    // 2. Resolve client_name para client_id se necessário
    if (processed.client_name && !processed.client_id) {
      const clientService = this.container.resolve('clientService');
      const clients = await clientService.searchClients(processed.client_name);

      if (clients.length === 1) {
        processed.client_id = clients[0].id;
        this.logger.debug('Resolved client_name to client_id', {
          clientName: processed.client_name,
          clientId: processed.client_id
        });
      } else if (clients.length > 1) {
        this.logger.warn('Multiple clients found for name, using first match', {
          clientName: processed.client_name,
          matchCount: clients.length
        });
        processed.client_id = clients[0].id;
      }
    }

    // 3. Resolve desk_name para desk_id se necessário
    if (processed.desk_name && !processed.desk_id) {
      // Implementar quando tivermos DeskService
      this.logger.debug('desk_name resolution not implemented yet', {
        deskName: processed.desk_name
      });
    }

    return processed;
  }

  /**
   * Aplica business rules na atualização de tickets
   */
  async _applyUpdateBusinessRules(currentTicket, updateData) {
    const processed = { ...updateData };

    // 1. Validações de estado
    if (processed.stage_id && currentTicket.stage_id) {
      // Validar transições de estado se necessário
      this.logger.debug('Stage transition', {
        from: currentTicket.stage_id,
        to: processed.stage_id
      });
    }

    // 2. Resolve nomes para IDs se necessário
    if (processed.client_name && !processed.client_id) {
      const clientService = this.container.resolve('clientService');
      const clients = await clientService.searchClients(processed.client_name);

      if (clients.length > 0) {
        processed.client_id = clients[0].id;
        delete processed.client_name; // Remove o nome após resolução
      }
    }

    return processed;
  }

  /**
   * Normaliza filtros para busca de tickets
   */
  _normalizeListFilters(filters) {
    const normalized = { ...filters };

    // Normaliza limit
    if (normalized.limit) {
      normalized.limit = Math.min(parseInt(normalized.limit) || 20, 200);
    } else {
      normalized.limit = 20;
    }

    // Normaliza offset
    if (normalized.offset) {
      normalized.offset = Math.max(parseInt(normalized.offset) || 1, 1);
    } else {
      normalized.offset = 1;
    }

    // Normaliza is_closed
    if (typeof normalized.is_closed !== 'undefined') {
      normalized.is_closed = !!normalized.is_closed;
    } else {
      normalized.is_closed = false; // Default: apenas tickets abertos
    }

    return normalized;
  }

  /**
   * Formata ticket individual para resposta
   */
  _formatTicketForResponse(ticketData, action = 'retrieved') {
    const actionTexts = {
      retrieved: 'Detalhes do Ticket',
      created: '✅ Ticket Criado com Sucesso',
      updated: '✅ Ticket Atualizado com Sucesso'
    };

    const ticket = ticketData.ticket || ticketData;

    return {
      content: [
        {
          type: 'text',
          text: `**${actionTexts[action]} #${ticket.id || 'N/A'}**\n\n` +
                `**Título:** ${ticket.title || 'N/A'}\n` +
                `**Status:** ${ticket.status?.name || ticket.status || 'N/A'}\n` +
                `**Prioridade:** ${ticket.priority?.name || ticket.priority || 'N/A'}\n` +
                `**Cliente:** ${ticket.client?.name || ticket.client_name || 'N/A'}\n` +
                `**Técnico:** ${ticket.assigned_to?.name || ticket.responsible?.name || 'Não atribuído'}\n` +
                `**Mesa:** ${ticket.desk?.name || ticket.desk_name || 'N/A'}\n` +
                `**Criado em:** ${ticket.created_at ? new Date(ticket.created_at).toLocaleString('pt-BR') : 'N/A'}\n` +
                `**Atualizado em:** ${ticket.updated_at ? new Date(ticket.updated_at).toLocaleString('pt-BR') : 'N/A'}\n\n` +
                `**Descrição:**\n${ticket.description || 'Sem descrição'}`
        }
      ]
    };
  }

  /**
   * Formata resposta de fechamento de ticket
   */
  _formatCloseTicketForResponse(result, ticketNumber) {
    return {
      content: [
        {
          type: 'text',
          text: `**✅ Ticket #${ticketNumber} fechado com sucesso!**\n\n` +
                `**Mensagem:** ${result.message || 'Ticket fechado com sucesso'}\n\n` +
                `*✅ Ticket fechado via API TiFlux*`
        }
      ]
    };
  }

  /**
   * Formata lista de tickets para resposta
   */
  _formatTicketListForResponse(listData) {
    const tickets = listData.tickets || [];
    const pagination = listData.pagination || {};

    if (tickets.length === 0) {
      return {
        content: [{
          type: 'text',
          text: '📭 **Nenhum ticket encontrado**\n\nVerifique os filtros aplicados.'
        }]
      };
    }

    let text = `**📋 Lista de Tickets** (${tickets.length} encontrado${tickets.length > 1 ? 's' : ''})\n\n`;

    tickets.forEach((ticket, index) => {
      // Cabeçalho do ticket
      text += `**${index + 1}. Ticket #${ticket.id}**\n`;
      text += `   📝 **Título:** ${ticket.title || 'Não informado'}\n`;

      // Responsável
      const responsible = ticket.assigned_to?.name || ticket.responsible?.name || 'Não atribuído';
      text += `   👤 **Responsável:** ${responsible}\n`;

      // Cliente
      const clientName = ticket.client?.name || ticket.client_name || 'Não informado';
      text += `   🏢 **Cliente:** ${clientName}\n`;

      // Mesa
      if (ticket.desk?.name || ticket.desk_name) {
        const deskName = ticket.desk?.name || ticket.desk_name;
        text += `   🗂️ **Mesa:** ${deskName}\n`;
      }

      // Estágio com ícone baseado no tipo
      const stageName = ticket.stage?.name || ticket.stage_name || ticket.status?.name || 'N/A';
      const stageIcon = this._getStageIcon(stageName);
      text += `   📊 **Estágio:** ${stageName} ${stageIcon}\n`;

      // Status
      const statusIcon = ticket.status_id === 1 ? '🚨' : '✅';
      const statusName = ticket.status?.name || 'Opened';
      text += `   ${statusIcon} **Status:** ${statusName}\n`;

      // Data de atualização com tempo relativo (SEMPRE mostrar para debug)
      const hasUpdatedAt = !!ticket.updated_at;
      const updatedAtValue = ticket.updated_at;

      this.logger.debug('DEBUG updated_at', { hasUpdatedAt, updatedAtValue, ticketId: ticket.id });

      if (hasUpdatedAt) {
        try {
          const updatedDate = new Date(updatedAtValue);
          const timeAgo = this._getTimeAgo(updatedDate);
          text += `   ⏰ **Atualizado:** ${timeAgo} (${updatedDate.toLocaleDateString('pt-BR')})\n`;
        } catch (error) {
          text += `   ⏰ **Atualizado:** Erro ao processar data (${updatedAtValue})\n`;
        }
      } else {
        text += `   ⏰ **Atualizado:** Campo não disponível na API\n`;
      }

      // Data de criação
      if (ticket.created_at) {
        const createdDate = new Date(ticket.created_at);
        text += `   📅 **Criado em:** ${createdDate.toLocaleDateString('pt-BR')}\n`;
      }

      text += '\n';
    });

    // Adiciona informações de paginação
    if (pagination) {
      text += `\n**📊 Paginação:**\n`;
      text += `• Página atual: ${pagination.current_page || 1}\n`;
      text += `• Tickets por página: ${pagination.per_page || tickets.length}\n`;
      text += `• Tickets nesta página: ${tickets.length}\n`;

      if (pagination.total_pages && pagination.current_page < pagination.total_pages) {
        text += `• Há mais resultados disponíveis (use offset=${pagination.current_page + 1})\n`;
      } else {
        text += `• Esta é a última página disponível\n`;
      }
    }

    text += `\n*✅ Dados obtidos da API TiFlux em tempo real*`;

    return {
      content: [{
        type: 'text',
        text: text
      }]
    };
  }

  /**
   * Retorna ícone baseado no nome do estágio
   */
  _getStageIcon(stageName) {
    const stageNameLower = stageName.toLowerCase();

    if (stageNameLower.includes('review') || stageNameLower.includes('revisão')) {
      return '🟡';
    }
    if (stageNameLower.includes('dev') || stageNameLower.includes('desenvolvimento')) {
      return '💻';
    }
    if (stageNameLower.includes('test') || stageNameLower.includes('teste')) {
      return '🧪';
    }
    if (stageNameLower.includes('done') || stageNameLower.includes('concluído')) {
      return '✅';
    }
    if (stageNameLower.includes('pending') || stageNameLower.includes('pendente')) {
      return '⏳';
    }
    if (stageNameLower.includes('blocked') || stageNameLower.includes('bloqueado')) {
      return '🚫';
    }

    return '';
  }

  /**
   * Calcula tempo relativo desde uma data
   */
  _getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'há menos de 1 minuto';
    } else if (diffMinutes < 60) {
      return `há ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
      return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    } else {
      return date.toLocaleString('pt-BR');
    }
  }

  /**
   * Gera hash dos filtros para cache
   */
  _hashFilters(filters) {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(filters))
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Lazy loading do TicketRepository
   */
  _getTicketRepository() {
    if (!this.ticketRepository) {
      this.ticketRepository = this.container.resolve('ticketRepository');
    }
    return this.ticketRepository;
  }

  /**
   * Lazy loading do TicketValidator
   */
  _getTicketValidator() {
    if (!this.ticketValidator) {
      this.ticketValidator = this.container.resolve('ticketValidator');
    }
    return this.ticketValidator;
  }

  /**
   * Lazy loading do TicketMapper
   */
  _getTicketMapper() {
    if (!this.ticketMapper) {
      this.ticketMapper = this.container.resolve('ticketMapper');
    }
    return this.ticketMapper;
  }

  /**
   * Busca arquivos anexados a um ticket
   */
  async getTicketFiles(ticketNumber) {
    const timer = this.logger.startTimer(`get_ticket_files_${ticketNumber}`);

    try {
      this.logger.info('Getting ticket files', { ticketNumber });

      // Validação básica
      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Normaliza número
      const normalizedNumber = ticketNumber.toString().trim();

      // Busca arquivos no repository (API)
      this.logger.debug('Fetching ticket files from API', { ticketNumber: normalizedNumber });
      const filesData = await this._getTicketRepository().getFiles(normalizedNumber);

      timer();
      this.logger.info('Ticket files retrieved successfully', {
        ticketNumber: normalizedNumber,
        filesCount: filesData?.length || 0
      });

      return this._formatFilesForResponse(filesData, normalizedNumber);

    } catch (error) {
      timer();
      this.logger.error('Failed to get ticket files', {
        ticketNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Formata lista de arquivos para resposta MCP
   */
  _formatFilesForResponse(files, ticketNumber) {
    if (!files || files.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `**📎 Arquivos do Ticket #${ticketNumber}**\n\n` +
                  `*Nenhum arquivo anexado neste ticket.*\n\n` +
                  `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
    }

    // Formatar lista de arquivos
    let filesText = `**📎 Arquivos do Ticket #${ticketNumber}** (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'})\n\n`;

    files.forEach((file, index) => {
      filesText += `**${index + 1}. ${file.name || 'Sem nome'}**\n`;
      filesText += `   • **ID:** ${file.id}\n`;
      filesText += `   • **Tipo:** ${file.content_type || 'N/A'}\n`;
      filesText += `   • **Tamanho:** ${this._formatFileSize(file.size || 0)}\n`;
      filesText += `   • **URL:** ${file.url || 'N/A'}\n`;
      filesText += `   • **Criado em:** ${file.created_at || 'N/A'}\n`;
      filesText += `   • **Criado por:** ${file.created_by?.name || 'N/A'}\n\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: filesText + `*✅ Dados obtidos da API TiFlux em tempo real*`
        }
      ]
    };
  }

  /**
   * Busca o histórico de estágios e SLAs de um ticket
   */
  async getTicketStagesSlas(ticketNumber) {
    const timer = this.logger.startTimer(`get_ticket_stages_slas_${ticketNumber}`);

    try {
      this.logger.info('Getting ticket stages SLAs', { ticketNumber });

      if (!ticketNumber || ticketNumber.toString().trim() === '') {
        throw new ValidationError('ticket_number é obrigatório');
      }

      const normalizedNumber = ticketNumber.toString().trim();

      this.logger.debug('Fetching ticket stages SLAs from repository', { ticketNumber: normalizedNumber });
      const data = await this._getTicketRepository().getStagesSlas(normalizedNumber);

      timer();
      this.logger.info('Ticket stages SLAs retrieved successfully', {
        ticketNumber: normalizedNumber,
        hasData: !!data
      });

      return this._formatStagesSlasForResponse(data, normalizedNumber);

    } catch (error) {
      timer();
      this.logger.error('Failed to get ticket stages SLAs', {
        ticketNumber,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Formata dados de estágios e SLAs para resposta MCP
   */
  _formatStagesSlasForResponse(data, ticketNumber) {
    if (!data) {
      return {
        content: [
          {
            type: 'text',
            text: `**Estágios e SLAs do Ticket #${ticketNumber}**\n\n` +
                  `*Nenhum dado de estágios/SLAs disponível para este ticket.*\n\n` +
                  `*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `**Estágios e SLAs do Ticket #${ticketNumber}**\n\n` +
                `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n` +
                `*✅ Dados obtidos da API TiFlux em tempo real*`
        }
      ]
    };
  }

  /**
   * Formata tamanho de arquivo em formato legível
   */
  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Import das classes de erro (serão criadas)
const { ValidationError, NotFoundError } = require('../../utils/errors');

module.exports = TicketService;
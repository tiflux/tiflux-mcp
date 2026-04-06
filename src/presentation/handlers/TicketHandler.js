/**
 * TicketHandler - Handler limpo para operações de ticket
 *
 * Responsabilidades:
 * - Receber requests MCP e validar parâmetros básicos
 * - Delegar lógica de negócio para TicketService
 * - Aplicar formatação de resposta via middleware
 * - Error handling padronizado
 * - Logging de requests/responses
 */

class TicketHandler {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.ticketService = container.resolve('ticketService');
    this.domainOrchestrator = container.resolve('domainOrchestrator');
    this.responseFormatter = null; // Lazy loading
  }

  /**
   * Handler para buscar um ticket específico
   */
  async handleGetTicket(args) {
    const timer = this.logger.startTimer('handle_get_ticket');

    try {
      this.logger.info('Handling get ticket request', {
        ticketNumber: args.ticket_number
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Delega para o domain service
      const result = await this.ticketService.getTicket(args.ticket_number);

      timer();
      return result; // TicketService já retorna formato MCP

    } catch (error) {
      timer();
      this.logger.error('Failed to handle get ticket', {
        ticketId: args.ticket_id,
        error: error.message
      });

      return this._formatErrorResponse(error, 'get_ticket');
    }
  }

  /**
   * Handler para criar um novo ticket
   */
  async handleCreateTicket(args) {
    const timer = this.logger.startTimer('handle_create_ticket');

    try {
      this.logger.info('Handling create ticket request', {
        hasTitle: !!args.title,
        hasDescription: !!args.description,
        hasClientId: !!args.client_id,
        hasClientName: !!args.client_name
      });

      // Validação básica de parâmetros (domain validator faz validação completa)
      if (!args.title || !args.description) {
        throw new ValidationError('title e description são obrigatórios');
      }

      if (!args.client_id && !args.client_name) {
        throw new ValidationError('client_id ou client_name é obrigatório');
      }

      // Usar orchestrator para resolução automática de cliente se necessário
      const result = await this.domainOrchestrator.createTicketWithClientResolution(args);

      timer();
      return result; // TicketService já retorna formato MCP

    } catch (error) {
      timer();
      this.logger.error('Failed to handle create ticket', {
        title: args.title?.substring(0, 50),
        error: error.message
      });

      return this._formatErrorResponse(error, 'create_ticket');
    }
  }

  /**
   * Handler para atualizar um ticket existente
   */
  async handleUpdateTicket(args) {
    const timer = this.logger.startTimer('handle_update_ticket');

    try {
      this.logger.info('Handling update ticket request', {
        ticketNumber: args.ticket_number,
        fields: Object.keys(args).filter(key => key !== 'ticket_number')
      });

      // Validação básica
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Extrai dados de atualização (remove ticket_number)
      const updateData = { ...args };
      delete updateData.ticket_number;

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('Pelo menos um campo deve ser fornecido para atualização');
      }

      // Delega para o domain service
      const result = await this.ticketService.updateTicket(args.ticket_number, updateData);

      timer();
      return result;

    } catch (error) {
      timer();
      this.logger.error('Failed to handle update ticket', {
        ticketNumber: args.ticket_number,
        error: error.message
      });

      return this._formatErrorResponse(error, 'update_ticket');
    }
  }

  /**
   * Handler para listar tickets com filtros
   */
  async handleListTickets(args) {
    const timer = this.logger.startTimer('handle_list_tickets');

    try {
      this.logger.info('Handling list tickets request', {
        filters: Object.keys(args || {}),
        hasDeskIds: !!args?.desk_ids,
        hasClientIds: !!args?.client_ids
      });

      // Args pode ser vazio, domain validator validará filtros obrigatórios
      const filters = args || {};

      // Delega para o domain service
      const result = await this.ticketService.listTickets(filters);

      timer();
      return result;

    } catch (error) {
      timer();
      this.logger.error('Failed to handle list tickets', {
        filters: Object.keys(args || {}),
        error: error.message
      });

      return this._formatErrorResponse(error, 'list_tickets');
    }
  }

  /**
   * Handler para fechar um ticket específico
   */
  async handleCloseTicket(args) {
    const timer = this.logger.startTimer('handle_close_ticket');

    try {
      this.logger.info('Handling close ticket request', {
        ticketNumber: args.ticket_number
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Delega para o domain service
      const result = await this.ticketService.closeTicket(args.ticket_number);

      timer();
      return result; // TicketService já retorna formato MCP

    } catch (error) {
      timer();
      this.logger.error('Failed to handle close ticket', {
        ticketNumber: args.ticket_number,
        error: error.message
      });

      return this._formatErrorResponse(error, 'close_ticket');
    }
  }

  /**
   * Handler para buscar arquivos de um ticket
   */
  async handleGetTicketFiles(args) {
    const timer = this.logger.startTimer('handle_get_ticket_files');

    try {
      this.logger.info('Handling get ticket files request', {
        ticketNumber: args.ticket_number
      });

      // Validação básica de parâmetros
      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      // Delega para o domain service
      const result = await this.ticketService.getTicketFiles(args.ticket_number);

      timer();
      return result; // TicketService já retorna formato MCP

    } catch (error) {
      timer();
      this.logger.error('Failed to handle get ticket files', {
        ticketNumber: args.ticket_number,
        error: error.message
      });

      return this._formatErrorResponse(error, 'get_ticket_files');
    }
  }

  /**
   * Handler para buscar estágios e SLAs de um ticket
   */
  async handleGetTicketStagesSlas(args) {
    const timer = this.logger.startTimer('handle_get_ticket_stages_slas');

    try {
      this.logger.info('Handling get ticket stages SLAs request', {
        ticketNumber: args.ticket_number
      });

      if (!args.ticket_number) {
        throw new ValidationError('ticket_number é obrigatório');
      }

      const result = await this.ticketService.getTicketStagesSlas(args.ticket_number);

      timer();
      return result;

    } catch (error) {
      timer();
      this.logger.error('Failed to handle get ticket stages SLAs', {
        ticketNumber: args.ticket_number,
        error: error.message
      });

      return this._formatErrorResponse(error, 'get_ticket_stages_slas');
    }
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
      NetworkError: '🌐'
    };

    const icon = errorMap[error.constructor.name] || '❌';
    const operationText = {
      get_ticket: 'buscar ticket',
      create_ticket: 'criar ticket',
      update_ticket: 'atualizar ticket',
      list_tickets: 'listar tickets',
      close_ticket: 'fechar ticket',
      get_ticket_files: 'buscar arquivos do ticket',
      get_ticket_stages_slas: 'buscar estágios e SLAs do ticket'
    };

    let errorMessage = error.message;

    // Adiciona contexto específico para alguns erros
    if (error.constructor.name === 'ValidationError') {
      errorMessage = `Dados inválidos: ${error.message}`;
    } else if (error.constructor.name === 'NotFoundError') {
      errorMessage = `Recurso não encontrado: ${error.message}`;
    } else if (error.constructor.name === 'APIError') {
      errorMessage = `Erro na API: ${error.message}`;
      if (error.statusCode) {
        errorMessage += ` (HTTP ${error.statusCode})`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `**${icon} Erro ao ${operationText[operation] || 'processar solicitação'}**\n\n` +
                `**Erro:** ${errorMessage}\n\n` +
                `*Verifique os parâmetros fornecidos e tente novamente.*`
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
      operations: ['get_ticket', 'create_ticket', 'update_ticket', 'list_tickets', 'close_ticket', 'get_ticket_files', 'get_ticket_stages_slas'],
      features: {
        domain_service_integration: true,
        orchestrator_support: true,
        error_formatting: true,
        request_logging: true,
        performance_timing: true
      },
      dependencies: {
        ticketService: !!this.ticketService,
        domainOrchestrator: !!this.domainOrchestrator,
        logger: !!this.logger
      }
    };
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = TicketHandler;
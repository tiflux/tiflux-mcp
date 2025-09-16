/**
 * TicketRepository - Acesso a dados para tickets
 *
 * Responsabilidades:
 * - Abstrai a API do TiFlux para operações de ticket
 * - Padroniza responses e error handling
 * - Implementa retry e timeout específicos
 * - Converte dados da API para formato interno
 */

class TicketRepository {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.httpClient = container.resolve('tifluxHttpClient');
    this.config = container.resolve('config');
    this.ticketMapper = null; // Lazy loading
  }

  /**
   * Busca um ticket por ID
   */
  async getById(ticketId) {
    const timer = this.logger.startTimer(`repo_get_ticket_${ticketId}`);

    try {
      this.logger.debug('Repository: fetching ticket by ID', { ticketId });

      const response = await this.httpClient.get(`/tickets/${ticketId}`, {
        timeout: 15000, // Timeout específico para get ticket
        maxRetries: 2
      });

      timer();

      // Verifica se ticket foi encontrado
      if (response.statusCode === 404) {
        return null;
      }

      // Valida resposta da API
      if (!response.data || response.data.error) {
        throw new APIError(
          response.data?.error || 'Erro desconhecido na API',
          response.statusCode,
          response.data
        );
      }

      // Mapeia dados da API para formato interno
      const mappedTicket = this._getTicketMapper().mapFromAPI(response.data);

      this.logger.debug('Repository: ticket fetched successfully', {
        ticketId,
        hasData: !!mappedTicket
      });

      return mappedTicket;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to get ticket', {
        ticketId,
        error: error.message,
        statusCode: error.statusCode
      });

      // Re-throw com contexto adicional
      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao buscar ticket #${ticketId}: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Cria um novo ticket
   */
  async create(ticketData) {
    const timer = this.logger.startTimer('repo_create_ticket');

    try {
      this.logger.debug('Repository: creating ticket', {
        title: ticketData.title?.substring(0, 50),
        clientId: ticketData.client_id
      });

      // Mapeia dados internos para formato da API
      const apiData = this._getTicketMapper().mapToAPI(ticketData);

      const response = await this.httpClient.post('/tickets', apiData, {
        timeout: 30000, // Timeout maior para criação
        maxRetries: 1,  // Apenas 1 retry para evitar duplicação
        headers: {
          'Content-Type': 'application/json'
        }
      });

      timer();

      // Valida resposta da criação
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao criar ticket: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia ticket criado
      const createdTicket = this._getTicketMapper().mapFromAPI(response.data);

      this.logger.info('Repository: ticket created successfully', {
        ticketId: createdTicket.id,
        title: createdTicket.title?.substring(0, 50)
      });

      return createdTicket;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to create ticket', {
        title: ticketData.title?.substring(0, 50),
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao criar ticket: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Atualiza um ticket existente
   */
  async update(ticketId, updateData) {
    const timer = this.logger.startTimer(`repo_update_ticket_${ticketId}`);

    try {
      this.logger.debug('Repository: updating ticket', {
        ticketId,
        fields: Object.keys(updateData)
      });

      // Mapeia dados de atualização para formato da API
      const apiData = this._getTicketMapper().mapUpdateToAPI(updateData);

      const response = await this.httpClient.put(`/tickets/${ticketId}`, apiData, {
        timeout: 20000,
        maxRetries: 1,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      timer();

      // Valida resposta da atualização
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao atualizar ticket #${ticketId}: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia ticket atualizado
      const updatedTicket = this._getTicketMapper().mapFromAPI(response.data);

      this.logger.info('Repository: ticket updated successfully', {
        ticketId,
        updatedFields: Object.keys(updateData)
      });

      return updatedTicket;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to update ticket', {
        ticketId,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao atualizar ticket #${ticketId}: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Fecha um ticket específico
   */
  async close(ticketNumber) {
    const timer = this.logger.startTimer(`repo_close_ticket_${ticketNumber}`);

    try {
      this.logger.debug('Repository: closing ticket', { ticketNumber });

      const response = await this.httpClient.put(`/tickets/${ticketNumber}/close`, {}, {
        timeout: 20000,
        maxRetries: 1,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      timer();

      // Valida resposta do fechamento
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao fechar ticket #${ticketNumber}: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      this.logger.info('Repository: ticket closed successfully', {
        ticketNumber,
        message: response.data?.message
      });

      return response.data || { message: `Ticket ${ticketNumber} closed successfully` };

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to close ticket', {
        ticketNumber,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao fechar ticket #${ticketNumber}: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Lista tickets com filtros
   */
  async list(filters = {}) {
    const timer = this.logger.startTimer('repo_list_tickets');

    try {
      this.logger.debug('Repository: listing tickets', {
        filters: Object.keys(filters),
        limit: filters.limit,
        offset: filters.offset
      });

      // Constrói query parameters
      const queryParams = this._buildListQueryParams(filters);
      const endpoint = `/tickets?${new URLSearchParams(queryParams).toString()}`;

      const response = await this.httpClient.get(endpoint, {
        timeout: 25000, // Timeout maior para listas
        maxRetries: 2
      });

      timer();

      // Valida resposta da listagem
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao listar tickets: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia lista de tickets
      const ticketList = this._getTicketMapper().mapListFromAPI(response.data);

      this.logger.info('Repository: tickets listed successfully', {
        count: ticketList.tickets?.length || 0,
        hasMore: !!ticketList.pagination?.has_more
      });

      return ticketList;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to list tickets', {
        filters: Object.keys(filters),
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao listar tickets: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifica se um ticket existe
   */
  async exists(ticketId) {
    try {
      const ticket = await this.getById(ticketId);
      return ticket !== null;
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Constrói query parameters para listagem
   */
  _buildListQueryParams(filters) {
    const params = {};

    // Filtros obrigatórios
    if (filters.desk_ids) {
      params.desk_ids = filters.desk_ids;
    }

    if (filters.client_ids) {
      params.client_ids = filters.client_ids;
    }

    if (filters.stage_ids) {
      params.stage_ids = filters.stage_ids;
    }

    if (filters.responsible_ids) {
      params.responsible_ids = filters.responsible_ids;
    }

    // Filtros opcionais
    if (typeof filters.is_closed !== 'undefined') {
      params.is_closed = filters.is_closed;
    }

    if (filters.limit) {
      params.limit = Math.min(filters.limit, 200);
    }

    if (filters.offset) {
      params.offset = Math.max(filters.offset, 1);
    }

    // Filtros por nome (se suportados pela API)
    if (filters.desk_name) {
      params.desk_name = filters.desk_name;
    }

    if (filters.stage_name) {
      params.stage_name = filters.stage_name;
    }

    return params;
  }

  /**
   * Extrai mensagem de erro da resposta da API
   */
  _extractAPIErrorMessage(errorData) {
    if (!errorData) {
      return 'Erro desconhecido';
    }

    if (typeof errorData === 'string') {
      return errorData;
    }

    // Tenta diferentes formatos de erro da API TiFlux
    if (errorData.message) {
      return errorData.message;
    }

    if (errorData.error) {
      if (typeof errorData.error === 'string') {
        return errorData.error;
      }
      if (errorData.error.message) {
        return errorData.error.message;
      }
    }

    if (errorData.errors && Array.isArray(errorData.errors)) {
      return errorData.errors.join(', ');
    }

    if (errorData.details) {
      return errorData.details;
    }

    return JSON.stringify(errorData).substring(0, 200);
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
   * Estatísticas do repository
   */
  getStats() {
    return {
      httpClient: {
        configured: !!this.httpClient,
        baseUrl: this.config.get('api.url')
      },
      mapper: {
        loaded: !!this.ticketMapper
      }
    };
  }
}

// Import das classes de erro
const { APIError } = require('../../utils/errors');

module.exports = TicketRepository;
/**
 * ClientRepository - Acesso a dados para clientes
 *
 * Responsabilidades:
 * - Abstrai a API do TiFlux para operações de cliente
 * - Implementa busca por nome com paginação
 * - Normaliza respostas da API
 * - Error handling específico para clientes
 */

class ClientRepository {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.httpClient = container.resolve('tifluxHttpClient');
    this.config = container.resolve('config');
    this.clientMapper = null; // Lazy loading
  }

  /**
   * Busca clientes por nome
   */
  async searchByName(clientName) {
    const timer = this.logger.startTimer(`repo_search_clients`);

    try {
      this.logger.debug('Repository: searching clients by name', {
        clientName: clientName?.substring(0, 30)
      });

      // Constrói query parameters para busca
      const queryParams = new URLSearchParams({
        client_name: clientName,
        // Pode incluir outros parâmetros de busca se a API suportar
        // per_page: '50',
        // active: 'true'
      });

      const response = await this.httpClient.get(`/clients/search?${queryParams}`, {
        timeout: 20000, // Timeout específico para busca
        maxRetries: 2
      });

      timer();

      // Valida resposta da busca
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao buscar clientes: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia resultados
      const clients = this._getClientMapper().mapSearchResultsFromAPI(response.data);

      this.logger.info('Repository: clients search completed', {
        searchTerm: clientName?.substring(0, 30),
        resultCount: clients.length
      });

      return clients;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to search clients', {
        clientName: clientName?.substring(0, 30),
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao buscar clientes por nome "${clientName}": ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Busca cliente por ID
   */
  async getById(clientId) {
    const timer = this.logger.startTimer(`repo_get_client_${clientId}`);

    try {
      this.logger.debug('Repository: fetching client by ID', { clientId });

      const response = await this.httpClient.get(`/clients/${clientId}`, {
        timeout: 15000,
        maxRetries: 2
      });

      timer();

      // Verifica se cliente foi encontrado
      if (response.statusCode === 404) {
        return null;
      }

      // Valida resposta da API
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao buscar cliente #${clientId}: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia cliente
      const client = this._getClientMapper().mapFromAPI(response.data);

      this.logger.debug('Repository: client fetched successfully', {
        clientId,
        clientName: client.name?.substring(0, 50)
      });

      return client;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to get client', {
        clientId,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao buscar cliente #${clientId}: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Lista clientes com paginação (se necessário)
   */
  async list(options = {}) {
    const timer = this.logger.startTimer('repo_list_clients');

    try {
      this.logger.debug('Repository: listing clients', { options });

      const queryParams = new URLSearchParams();

      if (options.page) {
        queryParams.set('page', options.page.toString());
      }

      if (options.per_page) {
        queryParams.set('per_page', Math.min(options.per_page, 200).toString());
      }

      if (options.active !== undefined) {
        queryParams.set('active', options.active.toString());
      }

      const endpoint = queryParams.toString() ?
        `/clients?${queryParams}` :
        '/clients';

      const response = await this.httpClient.get(endpoint, {
        timeout: 25000,
        maxRetries: 2
      });

      timer();

      // Valida resposta da listagem
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao listar clientes: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia lista de clientes
      const clientList = this._getClientMapper().mapListFromAPI(response.data);

      this.logger.info('Repository: clients listed successfully', {
        count: clientList.clients?.length || 0
      });

      return clientList;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to list clients', {
        options,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao listar clientes: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifica se um cliente existe
   */
  async exists(clientId) {
    try {
      const client = await this.getById(clientId);
      return client !== null;
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Busca clientes por múltiplos critérios (se a API suportar)
   */
  async searchByCriteria(criteria = {}) {
    const timer = this.logger.startTimer('repo_search_clients_criteria');

    try {
      this.logger.debug('Repository: searching clients by criteria', {
        criteriaKeys: Object.keys(criteria)
      });

      const queryParams = new URLSearchParams();

      // Adiciona critérios de busca suportados
      if (criteria.name) {
        queryParams.set('name', criteria.name);
      }

      if (criteria.email) {
        queryParams.set('email', criteria.email);
      }

      if (criteria.document) {
        queryParams.set('document', criteria.document);
      }

      if (criteria.phone) {
        queryParams.set('phone', criteria.phone);
      }

      if (criteria.active !== undefined) {
        queryParams.set('active', criteria.active.toString());
      }

      const response = await this.httpClient.get(`/clients/search?${queryParams}`, {
        timeout: 20000,
        maxRetries: 2
      });

      timer();

      // Valida resposta
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha na busca por critérios: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia resultados
      const clients = this._getClientMapper().mapSearchResultsFromAPI(response.data);

      this.logger.info('Repository: criteria search completed', {
        criteriaKeys: Object.keys(criteria),
        resultCount: clients.length
      });

      return clients;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to search clients by criteria', {
        criteria,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha na busca por critérios: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
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
   * Lazy loading do ClientMapper
   */
  _getClientMapper() {
    if (!this.clientMapper) {
      // Importa aqui para evitar dependência circular
      const ClientMapper = require('./ClientMapper');
      this.clientMapper = new ClientMapper(this.container);
    }
    return this.clientMapper;
  }

  /**
   * Estatísticas do repository
   */
  getStats() {
    return {
      endpoints: {
        search: '/clients/search',
        get_by_id: '/clients/:id',
        list: '/clients'
      },
      features: {
        search_by_name: true,
        search_by_criteria: true,
        pagination: true,
        active_filter: true
      },
      timeouts: {
        search: '20s',
        get_by_id: '15s',
        list: '25s'
      }
    };
  }
}

// Import das classes de erro
const { APIError } = require('../../utils/errors');

module.exports = ClientRepository;
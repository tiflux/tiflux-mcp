/**
 * CommunicationRepository - Acesso a dados para comunicações internas
 *
 * Responsabilidades:
 * - Abstrai a API do TiFlux para operações de comunicação interna
 * - Implementa upload de arquivos com FormData
 * - Paginação e busca de comunicações
 * - Error handling específico para comunicações
 */

class CommunicationRepository {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.httpClient = container.resolve('tifluxHttpClient');
    this.config = container.resolve('config');
    this.communicationMapper = null; // Lazy loading
  }

  /**
   * Cria uma nova comunicação interna
   */
  async create(ticketNumber, communicationData) {
    const timer = this.logger.startTimer(`repo_create_communication_${ticketNumber}`);

    try {
      this.logger.debug('Repository: creating internal communication', {
        ticketNumber,
        hasText: !!communicationData.text,
        hasFiles: !!(communicationData.files && communicationData.files.length > 0)
      });

      // Prepara FormData para multipart/form-data
      const formData = this.httpClient.createFormData();

      // Adiciona texto da comunicação
      if (communicationData.text) {
        formData.append('text', communicationData.text);
      }

      // Adiciona arquivos se existirem
      if (communicationData.files && communicationData.files.length > 0) {
        communicationData.files.forEach((filePath, index) => {
          this.httpClient.addFileToFormData(
            formData,
            `files[${index}]`, // Campo esperado pela API
            filePath
          );
        });
      }

      // Faz a requisição
      const response = await this.httpClient.post(
        `/tickets/${ticketNumber}/internal_communications`,
        formData,
        {
          timeout: 60000, // Timeout maior para upload de arquivos
          maxRetries: 1   // Apenas 1 retry para evitar duplicação
        }
      );

      timer();

      // Valida resposta da criação
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao criar comunicação interna: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia comunicação criada
      const createdCommunication = this._getCommunicationMapper().mapFromAPI(response.data);

      this.logger.info('Repository: internal communication created successfully', {
        ticketNumber,
        communicationId: createdCommunication.id,
        hasAttachments: !!(createdCommunication.attachments && createdCommunication.attachments.length > 0)
      });

      return createdCommunication;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to create internal communication', {
        ticketNumber,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao criar comunicação interna: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Lista comunicações internas de um ticket
   */
  async list(ticketNumber, options = {}) {
    const timer = this.logger.startTimer(`repo_list_communications_${ticketNumber}`);

    try {
      this.logger.debug('Repository: listing internal communications', {
        ticketNumber,
        limit: options.limit,
        offset: options.offset
      });

      // Constrói query parameters
      const queryParams = new URLSearchParams();

      if (options.limit) {
        queryParams.set('limit', Math.min(options.limit, 200).toString());
      }

      if (options.offset) {
        queryParams.set('offset', Math.max(options.offset, 1).toString());
      }

      const endpoint = `/tickets/${ticketNumber}/internal_communications?${queryParams}`;

      const response = await this.httpClient.get(endpoint, {
        timeout: 20000,
        maxRetries: 2
      });

      timer();

      // Valida resposta da listagem
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao listar comunicações internas: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia lista de comunicações
      const communicationList = this._getCommunicationMapper().mapListFromAPI(response.data);

      this.logger.info('Repository: internal communications listed successfully', {
        ticketNumber,
        count: communicationList.communications?.length || 0
      });

      return communicationList;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to list internal communications', {
        ticketNumber,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao listar comunicações internas: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Busca uma comunicação interna específica
   */
  async getById(ticketNumber, communicationId) {
    const timer = this.logger.startTimer(`repo_get_communication_${ticketNumber}_${communicationId}`);

    try {
      this.logger.debug('Repository: fetching internal communication by ID', {
        ticketNumber,
        communicationId
      });

      const response = await this.httpClient.get(
        `/tickets/${ticketNumber}/internal_communications/${communicationId}`,
        {
          timeout: 15000,
          maxRetries: 2
        }
      );

      timer();

      // Verifica se comunicação foi encontrada
      if (response.statusCode === 404) {
        return null;
      }

      // Valida resposta da API
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha ao buscar comunicação interna #${communicationId}: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia comunicação
      const communication = this._getCommunicationMapper().mapFromAPI(response.data);

      this.logger.debug('Repository: internal communication fetched successfully', {
        ticketNumber,
        communicationId,
        hasAttachments: !!(communication.attachments && communication.attachments.length > 0)
      });

      return communication;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to get internal communication', {
        ticketNumber,
        communicationId,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha ao buscar comunicação interna #${communicationId}: ${error.message}`,
        error.statusCode || 500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifica se uma comunicação existe
   */
  async exists(ticketNumber, communicationId) {
    try {
      const communication = await this.getById(ticketNumber, communicationId);
      return communication !== null;
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Busca comunicações por critérios (se a API suportar)
   */
  async searchByCriteria(ticketNumber, criteria = {}) {
    const timer = this.logger.startTimer(`repo_search_communications_${ticketNumber}`);

    try {
      this.logger.debug('Repository: searching internal communications by criteria', {
        ticketNumber,
        criteriaKeys: Object.keys(criteria)
      });

      const queryParams = new URLSearchParams();

      // Adiciona critérios de busca suportados
      if (criteria.author_id) {
        queryParams.set('author_id', criteria.author_id.toString());
      }

      if (criteria.date_from) {
        queryParams.set('date_from', criteria.date_from);
      }

      if (criteria.date_to) {
        queryParams.set('date_to', criteria.date_to);
      }

      if (criteria.has_attachments !== undefined) {
        queryParams.set('has_attachments', criteria.has_attachments.toString());
      }

      if (criteria.text_search) {
        queryParams.set('search', criteria.text_search);
      }

      const response = await this.httpClient.get(
        `/tickets/${ticketNumber}/internal_communications/search?${queryParams}`,
        {
          timeout: 25000,
          maxRetries: 2
        }
      );

      timer();

      // Valida resposta
      if (response.statusCode >= 400) {
        const errorMessage = this._extractAPIErrorMessage(response.data);
        throw new APIError(
          `Falha na busca de comunicações: ${errorMessage}`,
          response.statusCode,
          response.data
        );
      }

      // Mapeia resultados
      const communications = this._getCommunicationMapper().mapListFromAPI(response.data);

      this.logger.info('Repository: communication search completed', {
        ticketNumber,
        criteriaKeys: Object.keys(criteria),
        resultCount: communications.communications?.length || 0
      });

      return communications;

    } catch (error) {
      timer();
      this.logger.error('Repository: failed to search internal communications', {
        ticketNumber,
        criteria,
        error: error.message,
        statusCode: error.statusCode
      });

      if (error instanceof APIError) {
        throw error;
      }

      throw new APIError(
        `Falha na busca de comunicações: ${error.message}`,
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

    // Erros específicos de upload
    if (errorData.file_errors && Array.isArray(errorData.file_errors)) {
      return `Erros de arquivo: ${errorData.file_errors.join(', ')}`;
    }

    return JSON.stringify(errorData).substring(0, 200);
  }

  /**
   * Lazy loading do CommunicationMapper
   */
  _getCommunicationMapper() {
    if (!this.communicationMapper) {
      const CommunicationMapper = require('./CommunicationMapper');
      this.communicationMapper = new CommunicationMapper(this.container);
    }
    return this.communicationMapper;
  }

  /**
   * Estatísticas do repository
   */
  getStats() {
    return {
      endpoints: {
        create: '/tickets/:number/internal_communications',
        list: '/tickets/:number/internal_communications',
        get_by_id: '/tickets/:number/internal_communications/:id',
        search: '/tickets/:number/internal_communications/search'
      },
      features: {
        file_upload: true,
        multipart_form_data: true,
        pagination: true,
        search_by_criteria: true
      },
      timeouts: {
        create: '60s (file upload)',
        list: '20s',
        get_by_id: '15s',
        search: '25s'
      },
      limits: {
        max_files_per_request: this.config.get('communications.maxFiles', 10),
        max_file_size: this.config.get('communications.maxFileSize', 25 * 1024 * 1024)
      }
    };
  }
}

// Import das classes de erro
const { APIError } = require('../../utils/errors');

module.exports = CommunicationRepository;
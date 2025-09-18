const https = require('https');
const { URL } = require('url');
const FormData = require('form-data');
const { APIError, TimeoutError, NetworkError } = require('../../utils/errors');

/**
 * HttpClient robusto com retry, timeout, interceptors e suporte a multipart
 *
 * Features:
 * - Retry automático com backoff exponencial
 * - Timeout configurável por requisição
 * - Request/Response interceptors
 * - Suporte completo a multipart/form-data
 * - Headers customizáveis
 * - Error handling inteligente
 */
class HttpClient {
  constructor(config = {}, container = null) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      retryMultiplier: 2,
      retryCondition: this._defaultRetryCondition,
      ...config
    };

    this.container = container;
    this.logger = container?.resolve('logger') || console;

    // Interceptors
    this.requestInterceptors = [];
    this.responseInterceptors = [];

    // Default headers
    this.defaultHeaders = {
      'User-Agent': 'TiFlux-MCP-Client/2.0',
      'Accept': 'application/json',
      ...config.defaultHeaders
    };
  }

  /**
   * Adiciona interceptor de requisição
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
    return this;
  }

  /**
   * Adiciona interceptor de resposta
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
    return this;
  }

  /**
   * GET request
   */
  async get(url, options = {}) {
    return this.request({
      method: 'GET',
      url,
      ...options
    });
  }

  /**
   * POST request
   */
  async post(url, data = null, options = {}) {
    return this.request({
      method: 'POST',
      url,
      data,
      ...options
    });
  }

  /**
   * PUT request
   */
  async put(url, data = null, options = {}) {
    return this.request({
      method: 'PUT',
      url,
      data,
      ...options
    });
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    return this.request({
      method: 'DELETE',
      url,
      ...options
    });
  }

  /**
   * Request principal com retry automático
   */
  async request(options) {
    const requestId = Math.random().toString(36).substring(7);
    const timer = this.logger.startTimer?.(`http_request_${requestId}`);

    let lastError;
    const maxRetries = options.maxRetries ?? this.config.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug?.(`HTTP Request attempt ${attempt + 1}/${maxRetries + 1}`, {
          requestId,
          method: options.method,
          url: options.url,
          attempt: attempt + 1
        });

        const response = await this._executeRequest(options, requestId);

        timer?.();
        this.logger.info?.(`HTTP Request successful`, {
          requestId,
          method: options.method,
          url: options.url,
          status: response.statusCode,
          attempt: attempt + 1
        });

        return response;

      } catch (error) {
        lastError = error;

        // Não tenta retry se não deve
        const retryCondition = options.retryCondition ?? this.config.retryCondition;
        if (attempt >= maxRetries || !retryCondition(error, attempt)) {
          break;
        }

        // Calcula delay para próxima tentativa
        const retryDelay = this._calculateRetryDelay(attempt, options);

        this.logger.warn?.(`HTTP Request failed, retrying in ${retryDelay}ms`, {
          requestId,
          method: options.method,
          url: options.url,
          attempt: attempt + 1,
          error: error.message,
          retryIn: retryDelay
        });

        await this._delay(retryDelay);
      }
    }

    timer?.();
    this.logger.error?.(`HTTP Request failed after ${maxRetries + 1} attempts`, {
      requestId,
      method: options.method,
      url: options.url,
      error: lastError.message
    });

    throw lastError;
  }

  /**
   * Executa uma requisição HTTP
   */
  async _executeRequest(options, requestId) {
    // Aplica interceptors de requisição
    let processedOptions = { ...options };
    for (const interceptor of this.requestInterceptors) {
      processedOptions = await interceptor(processedOptions);
    }

    const urlObj = new URL(processedOptions.url);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: processedOptions.method,
      headers: {
        ...this.defaultHeaders,
        ...processedOptions.headers
      },
      timeout: processedOptions.timeout ?? this.config.timeout
    };

    // Prepara body da requisição
    let requestBody = null;
    if (processedOptions.data) {
      if (processedOptions.data instanceof FormData) {
        // FormData - multipart
        requestBody = processedOptions.data;
        Object.assign(requestOptions.headers, processedOptions.data.getHeaders());
      } else if (typeof processedOptions.data === 'object') {
        // JSON
        requestBody = JSON.stringify(processedOptions.data);
        requestOptions.headers['Content-Type'] = 'application/json';
        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
      } else {
        // String/Buffer
        requestBody = processedOptions.data;
        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
      }
    }

    return new Promise((resolve, reject) => {
      const request = https.request(requestOptions, async (response) => {
        try {
          const responseData = await this._collectResponseData(response);

          const responseObj = {
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            headers: response.headers,
            data: responseData,
            rawData: responseData,
            request: {
              method: processedOptions.method,
              url: processedOptions.url,
              headers: requestOptions.headers
            }
          };

          // Tenta parsear JSON se content-type for application/json
          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('application/json') && responseData) {
            try {
              responseObj.data = JSON.parse(responseData);
            } catch (parseError) {
              this.logger.warn?.(`Failed to parse JSON response`, {
                requestId,
                error: parseError.message,
                contentType,
                responseLength: responseData.length
              });
            }
          }

          // Aplica interceptors de resposta
          let processedResponse = responseObj;
          for (const interceptor of this.responseInterceptors) {
            processedResponse = await interceptor(processedResponse);
          }

          // Verifica se é erro HTTP
          if (response.statusCode >= 400) {
            const apiError = new APIError(
              `HTTP ${response.statusCode}: ${response.statusMessage}`,
              response.statusCode,
              processedResponse.data
            );
            apiError.response = processedResponse;
            reject(apiError);
            return;
          }

          resolve(processedResponse);

        } catch (error) {
          reject(error);
        }
      });

      // Error handlers
      request.on('error', (error) => {
        reject(new NetworkError(`Network error: ${error.message}`, error));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new TimeoutError(`Request timeout after ${requestOptions.timeout}ms`));
      });

      // Envia body se existir
      if (requestBody) {
        if (requestBody instanceof FormData) {
          requestBody.pipe(request);
        } else {
          request.write(requestBody);
          request.end();
        }
      } else {
        request.end();
      }
    });
  }

  /**
   * Coleta dados da resposta
   */
  _collectResponseData(response) {
    return new Promise((resolve, reject) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(data);
      });

      response.on('error', (error) => {
        reject(new NetworkError(`Response error: ${error.message}`, error));
      });
    });
  }

  /**
   * Condição de retry padrão
   */
  _defaultRetryCondition(error, attempt) {
    // Retry em errors de rede
    if (error instanceof NetworkError || error instanceof TimeoutError) {
      return true;
    }

    // Retry em alguns códigos HTTP específicos
    if (error instanceof APIError) {
      const retryStatusCodes = [429, 500, 502, 503, 504];
      return retryStatusCodes.includes(error.statusCode);
    }

    return false;
  }

  /**
   * Calcula delay para retry com backoff exponencial
   */
  _calculateRetryDelay(attempt, options) {
    const baseDelay = options.retryDelay ?? this.config.retryDelay;
    const multiplier = options.retryMultiplier ?? this.config.retryMultiplier;

    return Math.min(baseDelay * Math.pow(multiplier, attempt), 30000); // Max 30s
  }

  /**
   * Delay assíncrono
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cria FormData para upload de arquivos
   */
  createFormData() {
    return new FormData();
  }

  /**
   * Helper para adicionar arquivo ao FormData
   */
  addFileToFormData(formData, fieldName, filePath, filename = null) {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const actualFilename = filename || path.basename(filePath);
    formData.append(fieldName, fs.createReadStream(filePath), actualFilename);

    return formData;
  }

  /**
   * Configuração atual do cliente
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Atualiza configuração
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this;
  }
}

module.exports = HttpClient;
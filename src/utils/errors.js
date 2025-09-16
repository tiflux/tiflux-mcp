/**
 * Custom Error Classes
 * Hierarquia de erros específicos do sistema TiFlux MCP
 */

/**
 * Erro base do TiFlux MCP
 */
class TiFluxError extends Error {
  constructor(message, code = 'TIFLUX_ERROR', statusCode = 500, details = {}) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Capturar stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converte erro para objeto JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Converte erro para formato MCP response
   * @returns {Object}
   */
  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: `**❌ ${this.name}**\n\n` +
                `**Erro:** ${this.message}\n` +
                `**Código:** ${this.code}\n` +
                (Object.keys(this.details).length > 0 ?
                  `**Detalhes:** ${JSON.stringify(this.details, null, 2)}\n` : '') +
                `**Timestamp:** ${this.timestamp}\n\n` +
                `*Entre em contato com o suporte se o problema persistir.*`
        }
      ]
    };
  }
}

/**
 * Erro de validação de entrada
 */
class ValidationError extends TiFluxError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', 400, { field, value });
  }

  toMCPResponse() {
    const fieldInfo = this.details.field ? `**Campo:** ${this.details.field}\n` : '';
    const valueInfo = this.details.value !== null ? `**Valor:** ${this.details.value}\n` : '';

    return {
      content: [
        {
          type: 'text',
          text: `**⚠️ Erro de Validação**\n\n` +
                `**Mensagem:** ${this.message}\n` +
                fieldInfo + valueInfo +
                `\n*Verifique os parâmetros informados e tente novamente.*`
        }
      ]
    };
  }
}

/**
 * Erro de configuração
 */
class ConfigError extends TiFluxError {
  constructor(message, configKey = null) {
    super(message, 'CONFIG_ERROR', 500, { configKey });
  }

  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: `**⚙️ Erro de Configuração**\n\n` +
                `**Problema:** ${this.message}\n` +
                (this.details.configKey ? `**Configuração:** ${this.details.configKey}\n` : '') +
                `\n*Verifique as configurações do sistema e variáveis de ambiente.*`
        }
      ]
    };
  }
}

/**
 * Erro de API externa (TiFlux API)
 */
class APIError extends TiFluxError {
  constructor(message, statusCode = 500, responseData = null, endpoint = null) {
    super(message, 'API_ERROR', statusCode, { responseData, endpoint });
  }

  toMCPResponse() {
    const statusText = this.getStatusText(this.statusCode);

    return {
      content: [
        {
          type: 'text',
          text: `**🌐 Erro da API TiFlux**\n\n` +
                `**Status:** ${this.statusCode} ${statusText}\n` +
                `**Mensagem:** ${this.message}\n` +
                (this.details.endpoint ? `**Endpoint:** ${this.details.endpoint}\n` : '') +
                `**Timestamp:** ${this.timestamp}\n\n` +
                this.getSuggestion() +
                `\n*Se o problema persistir, verifique o status da API TiFlux.*`
        }
      ]
    };
  }

  /**
   * Obtém texto descritivo do status HTTP
   * @param {number} status - Status code
   * @returns {string}
   */
  getStatusText(status) {
    const statusTexts = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };

    return statusTexts[status] || 'Unknown Status';
  }

  /**
   * Obtém sugestão baseada no status code
   * @returns {string}
   */
  getSuggestion() {
    switch (this.statusCode) {
      case 401:
        return '**Sugestão:** Verifique se a TIFLUX_API_KEY está configurada corretamente.';
      case 403:
        return '**Sugestão:** Você não tem permissão para acessar este recurso.';
      case 404:
        return '**Sugestão:** O recurso solicitado não foi encontrado. Verifique os IDs informados.';
      case 422:
        return '**Sugestão:** Verifique se todos os campos obrigatórios foram informados corretamente.';
      case 429:
        return '**Sugestão:** Muitas requisições. Aguarde alguns segundos antes de tentar novamente.';
      case 500:
      case 502:
      case 503:
      case 504:
        return '**Sugestão:** Erro interno da API. Tente novamente em alguns minutos.';
      default:
        return '**Sugestão:** Verifique os parâmetros e tente novamente.';
    }
  }
}

/**
 * Erro de timeout ou conexão
 */
class ConnectionError extends TiFluxError {
  constructor(message, originalError = null) {
    super(message, 'CONNECTION_ERROR', 503, { originalError: originalError?.message });
  }

  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: `**📡 Erro de Conexão**\n\n` +
                `**Problema:** ${this.message}\n` +
                `**Timestamp:** ${this.timestamp}\n\n` +
                `**Possíveis causas:**\n` +
                `• Problema de conectividade com a internet\n` +
                `• Instabilidade na API TiFlux\n` +
                `• Timeout da requisição\n\n` +
                `**Sugestões:**\n` +
                `• Verifique sua conexão com a internet\n` +
                `• Tente novamente em alguns minutos\n` +
                `• Contate o suporte se o problema persistir`
        }
      ]
    };
  }
}

/**
 * Erro de rate limiting
 */
class RateLimitError extends TiFluxError {
  constructor(message, retryAfter = null) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
  }

  toMCPResponse() {
    const retryInfo = this.details.retryAfter ?
      `**Tente novamente após:** ${this.details.retryAfter} segundos\n` : '';

    return {
      content: [
        {
          type: 'text',
          text: `**⏱️ Limite de Requisições Atingido**\n\n` +
                `**Mensagem:** ${this.message}\n` +
                retryInfo +
                `**Timestamp:** ${this.timestamp}\n\n` +
                `*Aguarde alguns segundos antes de fazer nova requisição.*`
        }
      ]
    };
  }
}

/**
 * Erro de autenticação
 */
class AuthenticationError extends TiFluxError {
  constructor(message = 'Token de API inválido ou expirado') {
    super(message, 'AUTH_ERROR', 401);
  }

  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: `**🔐 Erro de Autenticação**\n\n` +
                `**Problema:** ${this.message}\n` +
                `**Timestamp:** ${this.timestamp}\n\n` +
                `**Como resolver:**\n` +
                `1. Verifique se a variável TIFLUX_API_KEY está definida\n` +
                `2. Confirme se o token está válido e não expirou\n` +
                `3. Entre em contato com o administrador para obter novo token\n\n` +
                `*Configure a variável de ambiente: TIFLUX_API_KEY=seu_token_aqui*`
        }
      ]
    };
  }
}

/**
 * Erro de recurso não encontrado
 */
class NotFoundError extends TiFluxError {
  constructor(resource, identifier = null) {
    const message = identifier ?
      `${resource} com ID '${identifier}' não encontrado` :
      `${resource} não encontrado`;

    super(message, 'NOT_FOUND_ERROR', 404, { resource, identifier });
  }

  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: `**🔍 Recurso Não Encontrado**\n\n` +
                `**Recurso:** ${this.details.resource}\n` +
                (this.details.identifier ? `**Identificador:** ${this.details.identifier}\n` : '') +
                `**Mensagem:** ${this.message}\n\n` +
                `**Sugestões:**\n` +
                `• Verifique se o ID/identificador está correto\n` +
                `• Confirme se você tem permissão para acessar o recurso\n` +
                `• Use a ferramenta de busca para localizar o recurso correto`
        }
      ]
    };
  }
}

/**
 * Factory para criar erros baseados em responses HTTP
 * @param {Object} response - Response da API
 * @param {string} endpoint - Endpoint que falhou
 * @returns {TiFluxError} - Erro apropriado
 */
function createErrorFromResponse(response, endpoint = null) {
  const { status, error } = response;

  switch (status) {
    case 401:
      return new AuthenticationError(error);

    case 404:
      return new NotFoundError('Recurso', null);

    case 422:
      return new ValidationError(error);

    case 429:
      return new RateLimitError(error);

    case 'CONNECTION_ERROR':
    case 'PARSE_ERROR':
      return new ConnectionError(error);

    default:
      return new APIError(error, status, null, endpoint);
  }
}

module.exports = {
  TiFluxError,
  ValidationError,
  ConfigError,
  APIError,
  ConnectionError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  createErrorFromResponse
};
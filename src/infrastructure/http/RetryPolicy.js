/**
 * Políticas de retry inteligentes para requisições HTTP
 *
 * Fornece diferentes estratégias de retry com configurações flexíveis:
 * - Exponential backoff
 * - Linear backoff
 * - Fixed delay
 * - Custom conditions
 */
class RetryPolicy {
  constructor(options = {}) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      strategy: 'exponential', // 'exponential', 'linear', 'fixed'
      multiplier: 2,
      jitter: true,
      ...options
    };
  }

  /**
   * Determina se deve fazer retry baseado no erro
   */
  shouldRetry(error, attempt) {
    // Máximo de tentativas atingido
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // Verifica condição customizada se fornecida
    if (this.config.retryCondition) {
      return this.config.retryCondition(error, attempt);
    }

    return this._defaultRetryCondition(error, attempt);
  }

  /**
   * Calcula delay para próxima tentativa
   */
  calculateDelay(attempt) {
    let delay;

    switch (this.config.strategy) {
      case 'exponential':
        delay = this._exponentialBackoff(attempt);
        break;
      case 'linear':
        delay = this._linearBackoff(attempt);
        break;
      case 'fixed':
        delay = this.config.baseDelay;
        break;
      default:
        delay = this._exponentialBackoff(attempt);
    }

    // Aplica jitter se habilitado
    if (this.config.jitter) {
      delay = this._addJitter(delay);
    }

    // Garante delay máximo
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * Condição de retry padrão
   */
  _defaultRetryCondition(error, attempt) {
    // Network errors - sempre retry
    if (error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP errors retryables
    if (error.statusCode) {
      const retryableStatusCodes = [
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504, // Gateway Timeout
        507, // Insufficient Storage
        508, // Loop Detected
        510, // Not Extended
        511  // Network Authentication Required
      ];
      return retryableStatusCodes.includes(error.statusCode);
    }

    // Timeout errors
    if (error.message && error.message.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * Backoff exponencial
   */
  _exponentialBackoff(attempt) {
    return this.config.baseDelay * Math.pow(this.config.multiplier, attempt);
  }

  /**
   * Backoff linear
   */
  _linearBackoff(attempt) {
    return this.config.baseDelay * (attempt + 1);
  }

  /**
   * Adiciona jitter aleatório para evitar thundering herd
   */
  _addJitter(delay) {
    // Jitter between 50% and 150% of original delay
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(delay * jitterFactor);
  }

  /**
   * Cria política de retry para API TiFlux
   */
  static forTiFluxAPI() {
    return new RetryPolicy({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      strategy: 'exponential',
      multiplier: 2,
      jitter: true,
      retryCondition: (error, attempt) => {
        // Sempre retry em network errors
        if (error.code === 'ECONNRESET' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT') {
          return true;
        }

        // Rate limiting - retry com delay maior
        if (error.statusCode === 429) {
          return true;
        }

        // Server errors - retry apenas 2 vezes
        if (error.statusCode >= 500 && attempt < 2) {
          return true;
        }

        return false;
      }
    });
  }

  /**
   * Cria política agressiva para operações críticas
   */
  static aggressive() {
    return new RetryPolicy({
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 15000,
      strategy: 'exponential',
      multiplier: 1.5,
      jitter: true
    });
  }

  /**
   * Cria política conservadora para operações pesadas
   */
  static conservative() {
    return new RetryPolicy({
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 8000,
      strategy: 'linear',
      jitter: false
    });
  }

  /**
   * Política sem retry
   */
  static noRetry() {
    return new RetryPolicy({
      maxRetries: 0
    });
  }

  /**
   * Política customizada para upload de arquivos
   */
  static forFileUpload() {
    return new RetryPolicy({
      maxRetries: 2,
      baseDelay: 3000,
      maxDelay: 20000,
      strategy: 'exponential',
      multiplier: 2,
      jitter: true,
      retryCondition: (error, attempt) => {
        // Não retry em errors de validação (4xx exceto timeout)
        if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
          return false;
        }

        // Retry apenas em network/server errors
        return error.statusCode >= 500 ||
               error.statusCode === 429 ||
               error.code === 'ETIMEDOUT' ||
               error.code === 'ECONNRESET';
      }
    });
  }

  /**
   * Executa uma função com retry
   */
  async execute(asyncFn, logger = null) {
    let lastError;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await asyncFn();
      } catch (error) {
        lastError = error;

        if (!this.shouldRetry(error, attempt)) {
          break;
        }

        const delay = this.calculateDelay(attempt);

        if (logger) {
          logger.warn(`Retry attempt ${attempt + 1} in ${delay}ms`, {
            error: error.message,
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            delay
          });
        }

        await this._delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Delay helper
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configuração atual
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

module.exports = RetryPolicy;
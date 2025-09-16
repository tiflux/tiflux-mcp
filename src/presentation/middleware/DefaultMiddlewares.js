/**
 * DefaultMiddlewares - Middlewares padrão para o pipeline MCP
 *
 * Middlewares essenciais que são aplicados por padrão:
 * - Request logging
 * - Response formatting
 * - Error handling
 * - Performance monitoring
 * - Rate limiting
 * - Authentication/authorization
 */

class DefaultMiddlewares {
  /**
   * Middleware de logging de request
   */
  static requestLogging(context, meta) {
    const { operation, logger } = meta;

    logger.info('MCP Request started', {
      operation,
      hasArgs: !!context.args,
      argsKeys: context.args ? Object.keys(context.args) : [],
      timestamp: new Date().toISOString(),
      requestId: context.requestId || 'unknown'
    });

    // Adiciona timestamp de início
    context.startTime = Date.now();

    // Log específico por operação
    if (context.args) {
      const sensitiveFields = ['password', 'token', 'secret', 'key'];
      const safeArgs = { ...context.args };

      // Remove campos sensíveis do log
      sensitiveFields.forEach(field => {
        if (safeArgs[field]) {
          safeArgs[field] = '[REDACTED]';
        }
      });

      logger.debug('Request arguments', {
        operation,
        args: safeArgs
      });
    }
  }

  /**
   * Middleware de validação de rate limiting
   */
  static rateLimiting(context, meta) {
    const { operation, logger } = meta;

    // Rate limiting básico por operação
    const rateLimits = {
      create_ticket: { max: 10, window: 60000 }, // 10 requests por minuto
      create_internal_communication: { max: 20, window: 60000 }, // 20 requests por minuto
      list_tickets: { max: 60, window: 60000 }, // 60 requests por minuto
      search_client: { max: 30, window: 60000 }, // 30 requests por minuto
      default: { max: 100, window: 60000 } // 100 requests por minuto para outras operações
    };

    const limit = rateLimits[operation] || rateLimits.default;

    // Implementação simples de rate limiting em memória
    // Em produção, seria melhor usar Redis ou similar
    if (!DefaultMiddlewares._rateLimitStore) {
      DefaultMiddlewares._rateLimitStore = new Map();
    }

    const key = `${operation}:${context.clientId || 'anonymous'}`;
    const now = Date.now();
    const window = DefaultMiddlewares._rateLimitStore.get(key) || { count: 0, resetTime: now + limit.window };

    // Reset do contador se janela expirou
    if (now > window.resetTime) {
      window.count = 0;
      window.resetTime = now + limit.window;
    }

    window.count++;
    DefaultMiddlewares._rateLimitStore.set(key, window);

    // Verifica se excedeu limite
    if (window.count > limit.max) {
      const resetIn = Math.ceil((window.resetTime - now) / 1000);

      logger.warn('Rate limit exceeded', {
        operation,
        clientId: context.clientId,
        count: window.count,
        limit: limit.max,
        resetIn
      });

      throw new RateLimitError(`Rate limit exceeded. Try again in ${resetIn} seconds.`);
    }

    // Adiciona headers de rate limit ao contexto
    context.rateLimitHeaders = {
      'X-Rate-Limit': limit.max,
      'X-Rate-Limit-Remaining': Math.max(0, limit.max - window.count),
      'X-Rate-Limit-Reset': Math.ceil(window.resetTime / 1000)
    };

    logger.debug('Rate limit check passed', {
      operation,
      count: window.count,
      limit: limit.max,
      remaining: limit.max - window.count
    });
  }

  /**
   * Middleware de validação de argumentos básica
   */
  static argumentValidation(context, meta) {
    const { operation, logger } = meta;

    // Validações básicas por operação
    const requiredArgs = {
      get_ticket: ['ticket_id'],
      create_ticket: ['title', 'description'],
      update_ticket: ['ticket_id'],
      list_tickets: [], // Sem argumentos obrigatórios
      search_client: ['client_name'],
      get_client: ['client_id'],
      resolve_client_name: ['client_name'],
      create_internal_communication: ['ticket_number', 'text'],
      list_internal_communications: ['ticket_number'],
      get_internal_communication: ['ticket_number', 'communication_id']
    };

    const required = requiredArgs[operation] || [];
    const missing = [];

    for (const arg of required) {
      if (!context.args || context.args[arg] === undefined || context.args[arg] === null || context.args[arg] === '') {
        missing.push(arg);
      }
    }

    if (missing.length > 0) {
      logger.warn('Missing required arguments', {
        operation,
        missing,
        provided: context.args ? Object.keys(context.args) : []
      });

      throw new ValidationError(`Argumentos obrigatórios ausentes: ${missing.join(', ')}`);
    }

    logger.debug('Argument validation passed', {
      operation,
      validated: required
    });
  }

  /**
   * Middleware de sanitização de dados
   */
  static dataSanitization(context, meta) {
    const { operation, logger } = meta;

    if (!context.args) {
      return;
    }

    const sanitizedArgs = { ...context.args };
    let sanitized = false;

    // Sanitização de strings
    for (const [key, value] of Object.entries(sanitizedArgs)) {
      if (typeof value === 'string') {
        // Trim whitespace
        const trimmed = value.trim();

        // Remove caracteres de controle
        const cleaned = trimmed.replace(/[\x00-\x1F\x7F]/g, '');

        if (cleaned !== value) {
          sanitizedArgs[key] = cleaned;
          sanitized = true;
        }
      }
    }

    if (sanitized) {
      context.args = sanitizedArgs;
      logger.debug('Data sanitized', {
        operation,
        sanitizedFields: Object.keys(sanitizedArgs)
      });
    }
  }

  /**
   * Middleware de performance monitoring
   */
  static performanceMonitoring(context, meta) {
    const { operation, logger } = meta;

    // Inicia timer de performance
    context.performanceTimer = {
      start: process.hrtime.bigint(),
      operation,
      checkpoints: []
    };

    // Adiciona checkpoint
    context.addCheckpoint = (name) => {
      const checkpoint = {
        name,
        time: process.hrtime.bigint(),
        elapsed: Number(process.hrtime.bigint() - context.performanceTimer.start) / 1000000 // ms
      };

      context.performanceTimer.checkpoints.push(checkpoint);

      logger.debug('Performance checkpoint', {
        operation,
        checkpoint: name,
        elapsed: checkpoint.elapsed
      });
    };

    context.addCheckpoint('middleware_start');
  }

  /**
   * Middleware de response enhancement
   */
  static responseEnhancement(context, meta) {
    const { operation, logger } = meta;

    // Função para adicionar metadados à resposta
    context.enhanceResponse = (response) => {
      const enhanced = { ...response };

      // Adiciona metadados de performance se disponível
      if (context.performanceTimer) {
        const totalElapsed = Number(process.hrtime.bigint() - context.performanceTimer.start) / 1000000;

        enhanced.metadata = {
          operation,
          performance: {
            total_time_ms: Math.round(totalElapsed),
            checkpoints: context.performanceTimer.checkpoints
          },
          timestamp: new Date().toISOString(),
          request_id: context.requestId
        };
      }

      // Adiciona headers de rate limit se disponível
      if (context.rateLimitHeaders) {
        enhanced.headers = {
          ...enhanced.headers,
          ...context.rateLimitHeaders
        };
      }

      logger.debug('Response enhanced with metadata', {
        operation,
        hasMetadata: !!enhanced.metadata,
        hasHeaders: !!enhanced.headers
      });

      return enhanced;
    };
  }

  /**
   * Middleware de error handling
   */
  static errorHandling(context, meta) {
    const { operation, logger } = meta;

    // Wrapper para capturar erros não tratados
    const originalHandler = context.handler;

    if (typeof originalHandler === 'function') {
      context.handler = async (...args) => {
        try {
          return await originalHandler(...args);
        } catch (error) {
          logger.error('Unhandled error in handler', {
            operation,
            error: error.message,
            stack: error.stack,
            args: context.args
          });

          // Re-throw para que seja tratado pelo handler principal
          throw error;
        }
      };
    }
  }

  /**
   * Registra todos os middlewares padrão em um pipeline
   */
  static registerDefaults(pipeline) {
    // Middlewares globais na ordem de execução
    const globalMiddlewares = [
      { fn: DefaultMiddlewares.requestLogging, name: 'requestLogging' },
      { fn: DefaultMiddlewares.argumentValidation, name: 'argumentValidation' },
      { fn: DefaultMiddlewares.dataSanitization, name: 'dataSanitization' },
      { fn: DefaultMiddlewares.rateLimiting, name: 'rateLimiting' },
      { fn: DefaultMiddlewares.performanceMonitoring, name: 'performanceMonitoring' },
      { fn: DefaultMiddlewares.responseEnhancement, name: 'responseEnhancement' },
      { fn: DefaultMiddlewares.errorHandling, name: 'errorHandling' }
    ];

    for (const middleware of globalMiddlewares) {
      pipeline.addGlobalMiddleware(middleware.fn);
    }

    pipeline.logger.info('Default middlewares registered', {
      count: globalMiddlewares.length,
      middlewares: globalMiddlewares.map(m => m.name)
    });
  }

  /**
   * Limpa store de rate limiting (útil para testes)
   */
  static clearRateLimitStore() {
    DefaultMiddlewares._rateLimitStore = new Map();
  }
}

// Classes de erro específicas
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = {
  DefaultMiddlewares,
  RateLimitError
};
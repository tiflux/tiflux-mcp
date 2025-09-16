/**
 * MiddlewarePipeline - Pipeline de middleware para handlers MCP
 *
 * Responsabilidades:
 * - Executar middlewares em ordem definida
 * - Suporte a middleware async/await
 * - Error handling e propagação
 * - Logging de execução do pipeline
 * - Suporte a middleware condicional
 * - Performance tracking
 */

class MiddlewarePipeline {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.middlewares = [];
    this.globalMiddlewares = [];
  }

  /**
   * Adiciona middleware global (executado em todos os handlers)
   */
  addGlobalMiddleware(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware deve ser uma função');
    }

    this.globalMiddlewares.push({
      fn: middleware,
      name: middleware.name || 'anonymous',
      type: 'global'
    });

    this.logger.debug('Global middleware added', {
      name: middleware.name || 'anonymous',
      totalGlobal: this.globalMiddlewares.length
    });
  }

  /**
   * Adiciona middleware específico para uma operação
   */
  addOperationMiddleware(operation, middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware deve ser uma função');
    }

    if (!this.middlewares[operation]) {
      this.middlewares[operation] = [];
    }

    this.middlewares[operation].push({
      fn: middleware,
      name: middleware.name || 'anonymous',
      type: 'operation',
      operation
    });

    this.logger.debug('Operation middleware added', {
      operation,
      name: middleware.name || 'anonymous',
      totalForOperation: this.middlewares[operation].length
    });
  }

  /**
   * Executa pipeline de middlewares para uma operação
   */
  async execute(operation, context) {
    const timer = this.logger.startTimer('middleware_pipeline');
    const executionLog = [];

    try {
      this.logger.debug('Starting middleware pipeline', {
        operation,
        globalMiddlewares: this.globalMiddlewares.length,
        operationMiddlewares: (this.middlewares[operation] || []).length
      });

      // 1. Executa middlewares globais primeiro
      for (const middleware of this.globalMiddlewares) {
        const middlewareTimer = this.logger.startTimer(`middleware_${middleware.name}`);

        try {
          const result = await this._executeMiddleware(middleware, context, operation);
          const middlewareDuration = middlewareTimer();

          executionLog.push({
            name: middleware.name,
            type: middleware.type,
            duration: middlewareDuration,
            success: true,
            modified: result !== undefined
          });

          // Se middleware retornou valor, atualiza contexto
          if (result !== undefined) {
            Object.assign(context, result);
          }

        } catch (error) {
          const middlewareDuration = middlewareTimer();

          executionLog.push({
            name: middleware.name,
            type: middleware.type,
            duration: middlewareDuration,
            success: false,
            error: error.message
          });

          this.logger.error('Global middleware failed', {
            middleware: middleware.name,
            operation,
            error: error.message
          });

          throw error;
        }
      }

      // 2. Executa middlewares específicos da operação
      const operationMiddlewares = this.middlewares[operation] || [];

      for (const middleware of operationMiddlewares) {
        const middlewareTimer = this.logger.startTimer(`middleware_${middleware.name}`);

        try {
          const result = await this._executeMiddleware(middleware, context, operation);
          const middlewareDuration = middlewareTimer();

          executionLog.push({
            name: middleware.name,
            type: middleware.type,
            duration: middlewareDuration,
            success: true,
            modified: result !== undefined
          });

          // Se middleware retornou valor, atualiza contexto
          if (result !== undefined) {
            Object.assign(context, result);
          }

        } catch (error) {
          const middlewareDuration = middlewareTimer();

          executionLog.push({
            name: middleware.name,
            type: middleware.type,
            duration: middlewareDuration,
            success: false,
            error: error.message
          });

          this.logger.error('Operation middleware failed', {
            middleware: middleware.name,
            operation,
            error: error.message
          });

          throw error;
        }
      }

      const totalDuration = timer();

      this.logger.debug('Middleware pipeline completed', {
        operation,
        totalMiddlewares: executionLog.length,
        totalDuration,
        execution: executionLog
      });

      return context;

    } catch (error) {
      const totalDuration = timer();

      this.logger.error('Middleware pipeline failed', {
        operation,
        totalDuration,
        execution: executionLog,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Executa um middleware individual
   */
  async _executeMiddleware(middleware, context, operation) {
    const { fn } = middleware;

    // Middleware pode ser síncrono ou assíncrono
    const result = fn(context, {
      operation,
      logger: this.logger,
      container: this.container
    });

    // Se retornou Promise, aguarda
    if (result && typeof result.then === 'function') {
      return await result;
    }

    return result;
  }

  /**
   * Remove middleware global
   */
  removeGlobalMiddleware(middlewareName) {
    const initialCount = this.globalMiddlewares.length;
    this.globalMiddlewares = this.globalMiddlewares.filter(m => m.name !== middlewareName);

    const removed = initialCount - this.globalMiddlewares.length;
    this.logger.debug('Global middleware removed', {
      name: middlewareName,
      removed,
      remaining: this.globalMiddlewares.length
    });

    return removed > 0;
  }

  /**
   * Remove middleware de operação específica
   */
  removeOperationMiddleware(operation, middlewareName) {
    if (!this.middlewares[operation]) {
      return false;
    }

    const initialCount = this.middlewares[operation].length;
    this.middlewares[operation] = this.middlewares[operation].filter(m => m.name !== middlewareName);

    const removed = initialCount - this.middlewares[operation].length;
    this.logger.debug('Operation middleware removed', {
      operation,
      name: middlewareName,
      removed,
      remaining: this.middlewares[operation].length
    });

    return removed > 0;
  }

  /**
   * Limpa todos os middlewares
   */
  clear() {
    const totalGlobal = this.globalMiddlewares.length;
    const totalOperation = Object.values(this.middlewares).reduce((total, arr) => total + arr.length, 0);

    this.globalMiddlewares = [];
    this.middlewares = [];

    this.logger.info('All middlewares cleared', {
      globalCleared: totalGlobal,
      operationCleared: totalOperation
    });
  }

  /**
   * Estatísticas do pipeline
   */
  getStats() {
    const operationStats = {};

    for (const [operation, middlewares] of Object.entries(this.middlewares)) {
      operationStats[operation] = {
        count: middlewares.length,
        middlewares: middlewares.map(m => ({
          name: m.name,
          type: m.type
        }))
      };
    }

    return {
      global: {
        count: this.globalMiddlewares.length,
        middlewares: this.globalMiddlewares.map(m => ({
          name: m.name,
          type: m.type
        }))
      },
      operations: operationStats,
      totalMiddlewares: this.globalMiddlewares.length +
                      Object.values(this.middlewares).reduce((total, arr) => total + arr.length, 0)
    };
  }

  /**
   * Lista todos os middlewares configurados
   */
  listMiddlewares() {
    const result = {
      global: this.globalMiddlewares.map(m => ({
        name: m.name,
        type: m.type
      })),
      operations: {}
    };

    for (const [operation, middlewares] of Object.entries(this.middlewares)) {
      result.operations[operation] = middlewares.map(m => ({
        name: m.name,
        type: m.type,
        operation: m.operation
      }));
    }

    return result;
  }

  /**
   * Verifica se pipeline tem middlewares para uma operação
   */
  hasMiddlewares(operation) {
    const hasGlobal = this.globalMiddlewares.length > 0;
    const hasOperation = this.middlewares[operation] && this.middlewares[operation].length > 0;

    return hasGlobal || hasOperation;
  }
}

module.exports = MiddlewarePipeline;
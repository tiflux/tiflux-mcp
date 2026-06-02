/**
 * PresentationBootstrap - Bootstrap da camada de apresentação
 *
 * Registra todos os componentes de apresentação no Container DI:
 * - Handlers limpos que usam domain services
 * - Pipeline de middleware com middlewares padrão
 * - Response formatters consistentes
 * - Configurações específicas da camada
 */

class PresentationBootstrap {
  static register(container) {
    const logger = container.resolve('logger');

    // ============ MIDDLEWARE ============

    // MiddlewarePipeline - Pipeline de execução de middlewares
    container.registerFactory('middlewarePipeline', () => {
      const MiddlewarePipeline = require('./middleware/MiddlewarePipeline');
      const pipeline = new MiddlewarePipeline(container);

      // Registra middlewares padrão
      const { DefaultMiddlewares } = require('./middleware/DefaultMiddlewares');
      DefaultMiddlewares.registerDefaults(pipeline);

      return pipeline;
    });

    // DefaultMiddlewares - Utilitários de middleware
    container.registerFactory('defaultMiddlewares', () => {
      const { DefaultMiddlewares } = require('./middleware/DefaultMiddlewares');
      return DefaultMiddlewares;
    });

    // ============ FORMATTERS ============

    // ResponseFormatter - Formatador de respostas consistente
    container.registerFactory('responseFormatter', () => {
      const ResponseFormatter = require('./formatters/ResponseFormatter');
      return new ResponseFormatter(container);
    });

    // ============ PRESENTATION ORCHESTRATOR ============

    // PresentationOrchestrator - Orquestrador da camada de apresentação
    container.registerFactory('presentationOrchestrator', () => {
      return {
        /**
         * Executa handler com pipeline completo
         */
        async executeHandler(operation, args, requestContext = {}) {
          const timer = logger.startTimer('presentation_orchestrator_execute');

          try {
            logger.info('Executing handler with full pipeline', {
              operation,
              hasArgs: !!args,
              requestId: requestContext.requestId
            });

            // 1. Resolve componentes necessários
            const middlewarePipeline = container.resolve('middlewarePipeline');
            const responseFormatter = container.resolve('responseFormatter');

            // 2. Prepara contexto para middleware
            const context = {
              operation,
              args,
              requestId: requestContext.requestId || this._generateRequestId(),
              clientId: requestContext.clientId || 'anonymous',
              timestamp: new Date().toISOString(),
              ...requestContext
            };

            // 3. Executa pipeline de middleware
            let processedContext;
            try {
              processedContext = await middlewarePipeline.execute(operation, context);
            } catch (middlewareError) {
              logger.error('Middleware pipeline failed', {
                operation,
                error: middlewareError.message
              });

              // Formata erro de middleware
              const errorResponse = responseFormatter.formatError(middlewareError, operation, context);
              timer();
              return errorResponse;
            }

            // 4. Resolve handler + metodo via registry (self-describing)
            const registry = container.resolve('registry');
            const entry = registry.handlers[operation];
            if (!entry) {
              throw new Error(`No handler found for operation: ${operation}`);
            }
            const handler = entry.instance;
            const handlerMethod = entry.method;

            if (!handler || typeof handler[handlerMethod] !== 'function') {
              throw new Error(`Handler method ${handlerMethod} not found for operation ${operation}`);
            }

            // 5. Executa handler com contexto processado
            let handlerResult;
            try {
              handlerResult = await handler[handlerMethod](processedContext.args);
            } catch (handlerError) {
              logger.error('Handler execution failed', {
                operation,
                handler: handler.constructor.name,
                method: handlerMethod,
                error: handlerError.message
              });

              // Formata erro do handler
              const errorResponse = responseFormatter.formatError(handlerError, operation, processedContext);
              timer();
              return errorResponse;
            }

            // 6. Aplica formatação se resultado ainda não está formatado
            let finalResult = handlerResult;
            if (!handlerResult || !handlerResult.content) {
              finalResult = responseFormatter.formatSuccess(handlerResult, operation, processedContext);
            }

            // 7. Adiciona metadados finais
            if (processedContext.enhanceResponse && typeof processedContext.enhanceResponse === 'function') {
              finalResult = processedContext.enhanceResponse(finalResult);
            }

            const executionTime = timer();

            logger.info('Handler execution completed successfully', {
              operation,
              executionTime,
              hasContent: !!(finalResult && finalResult.content && finalResult.content.length > 0)
            });

            return finalResult;

          } catch (error) {
            const executionTime = timer();

            logger.error('Presentation orchestrator failed', {
              operation,
              executionTime,
              error: error.message,
              stack: error.stack
            });

            // Fallback para erro crítico
            const responseFormatter = container.resolve('responseFormatter');
            return responseFormatter.formatError(error, operation, { requestId: requestContext.requestId });
          }
        },

        /**
         * Gera ID único para request
         */
        _generateRequestId() {
          return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        /**
         * Estatisticas da camada de apresentacao — operacoes vem do registry.
         */
        async getStats() {
          try {
            const stats = {
              handlers: {},
              middleware: {},
              formatters: {},
              operations: []
            };

            // Operacoes e handlers vem do registry
            try {
              const registry = container.resolve('registry');
              stats.operations = registry.listOperations();
              const seen = new Set();
              for (const op of stats.operations) {
                const entry = registry.handlers[op];
                const className = entry && entry.instance && entry.instance.constructor
                  ? entry.instance.constructor.name
                  : 'UnknownHandler';
                if (!seen.has(className)) {
                  seen.add(className);
                  stats.handlers[className] = { operations: [] };
                }
                stats.handlers[className].operations.push(op);
              }
            } catch (error) {
              stats.handlers = { error: error.message };
            }

            try {
              const middlewarePipeline = container.resolve('middlewarePipeline');
              stats.middleware = middlewarePipeline.getStats();
            } catch (error) {
              stats.middleware = { error: error.message };
            }

            try {
              const responseFormatter = container.resolve('responseFormatter');
              stats.formatters = {
                responseFormatter: {
                  available: true,
                  theme: responseFormatter.theme,
                  locale: responseFormatter.locale
                }
              };
            } catch (error) {
              stats.formatters = { error: error.message };
            }

            return stats;
          } catch (error) {
            logger.error('Failed to get presentation stats', { error: error.message });
            return { error: error.message };
          }
        }
      };
    });

    // ============ PRESENTATION HEALTH CHECKER ============

    // PresentationHealthChecker - Health check da camada de apresentação
    container.registerFactory('presentationHealthChecker', () => {
      return {
        async checkHealth() {
          const results = {
            registry: { available: container.has('registry'), operations: 0 },
            middleware: {
              pipeline: container.has('middlewarePipeline'),
              defaultMiddlewares: container.has('defaultMiddlewares')
            },
            formatters: {
              responseFormatter: container.has('responseFormatter')
            },
            orchestrator: {
              presentationOrchestrator: container.has('presentationOrchestrator')
            },
            timestamp: new Date().toISOString()
          };

          try {
            const registry = container.resolve('registry');
            results.registry.operations = registry.listOperations().length;
          } catch (error) {
            results.registry.error = error.message;
          }

          try {
            const middlewarePipeline = container.resolve('middlewarePipeline');
            results.middleware.pipelineStats = middlewarePipeline.getStats();
          } catch (error) {
            results.middleware.pipelineError = error.message;
          }

          logger.debug('Presentation health check completed', results);
          return results;
        },

        async getDetailedStats() {
          const presentationOrchestrator = container.resolve('presentationOrchestrator');
          return await presentationOrchestrator.getStats();
        }
      };
    });

    logger.info('Presentation layer registered successfully', {
      middleware: ['middlewarePipeline', 'defaultMiddlewares'],
      formatters: ['responseFormatter'],
      utilities: ['presentationOrchestrator', 'presentationHealthChecker']
    });
  }

  /**
   * Configurações específicas de apresentação por ambiente
   */
  static getEnvironmentConfig(environment = 'development') {
    const configs = {
      development: {
        formatting: {
          theme: 'default',
          locale: 'pt-BR',
          includeMetadata: true,
          includeTimestamps: true,
          verboseErrors: true
        },
        middleware: {
          rateLimiting: {
            enabled: false // Desabilitado em dev
          },
          logging: {
            verbose: true,
            includeArgs: true
          },
          performance: {
            trackCheckpoints: true,
            warnSlowRequests: 1000 // 1 segundo
          }
        },
        handlers: {
          errorStackTraces: true,
          detailedValidation: true
        }
      },

      production: {
        formatting: {
          theme: 'compact',
          locale: 'pt-BR',
          includeMetadata: false,
          includeTimestamps: false,
          verboseErrors: false
        },
        middleware: {
          rateLimiting: {
            enabled: true,
            strictLimits: true
          },
          logging: {
            verbose: false,
            includeArgs: false // Não logga args em produção por segurança
          },
          performance: {
            trackCheckpoints: false,
            warnSlowRequests: 2000 // 2 segundos
          }
        },
        handlers: {
          errorStackTraces: false,
          detailedValidation: false
        }
      },

      test: {
        formatting: {
          theme: 'compact',
          locale: 'pt-BR',
          includeMetadata: false,
          includeTimestamps: false,
          verboseErrors: true
        },
        middleware: {
          rateLimiting: {
            enabled: false // Desabilitado para testes
          },
          logging: {
            verbose: false,
            includeArgs: false
          },
          performance: {
            trackCheckpoints: true,
            warnSlowRequests: 5000 // 5 segundos para testes
          }
        },
        handlers: {
          errorStackTraces: true,
          detailedValidation: true
        }
      }
    };

    return configs[environment] || configs.development;
  }

  /**
   * Registra configurações específicas do ambiente para apresentação
   */
  static registerEnvironmentConfig(container, environment = null) {
    const config = container.resolve('config');
    const env = environment || config.get('environment', 'development');
    const envConfig = this.getEnvironmentConfig(env);

    container.registerFactory('environmentPresentationConfig', () => envConfig);

    container.resolve('logger').info('Environment-specific presentation config registered', {
      environment: env,
      config: envConfig
    });
  }

  /**
   * Registra todos os middlewares customizados adicionais
   */
  static registerCustomMiddlewares(container, customMiddlewares = []) {
    if (!Array.isArray(customMiddlewares) || customMiddlewares.length === 0) {
      return;
    }

    const middlewarePipeline = container.resolve('middlewarePipeline');
    const logger = container.resolve('logger');

    for (const middleware of customMiddlewares) {
      const { type, operation, fn, name } = middleware;

      if (type === 'global') {
        middlewarePipeline.addGlobalMiddleware(fn);
      } else if (type === 'operation' && operation) {
        middlewarePipeline.addOperationMiddleware(operation, fn);
      }

      logger.info('Custom middleware registered', {
        name: name || 'anonymous',
        type,
        operation: operation || 'all'
      });
    }

    logger.info('Custom middlewares registration completed', {
      count: customMiddlewares.length
    });
  }
}

module.exports = PresentationBootstrap;
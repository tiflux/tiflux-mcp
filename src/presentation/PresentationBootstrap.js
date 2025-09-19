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

    // ============ HANDLERS ============

    // TicketHandler - Handler limpo para operações de ticket
    container.registerFactory('ticketHandler', () => {
      const TicketHandler = require('./handlers/TicketHandler');
      return new TicketHandler(container);
    });

    // ClientHandler - Handler limpo para operações de cliente
    container.registerFactory('clientHandler', () => {
      const ClientHandler = require('./handlers/ClientHandler');
      return new ClientHandler(container);
    });

    // CommunicationHandler - Handler limpo para comunicações internas
    container.registerFactory('communicationHandler', () => {
      const CommunicationHandler = require('./handlers/CommunicationHandler');
      return new CommunicationHandler(container);
    });

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

            // 4. Resolve e executa handler apropriado
            const handler = this._resolveHandler(operation, container);
            const handlerMethod = this._resolveHandlerMethod(operation);

            if (!handler || !handler[handlerMethod]) {
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
         * Resolve handler apropriado para operação
         */
        _resolveHandler(operation, container) {
          // Mapeamento de operações para handlers
          const handlerMap = {
            // Ticket operations
            get_ticket: 'ticketHandler',
            create_ticket: 'ticketHandler',
            update_ticket: 'ticketHandler',
            list_tickets: 'ticketHandler',
            close_ticket: 'ticketHandler',
            create_ticket_answer: 'ticketHandler',

            // Client operations
            search_client: 'clientHandler',
            get_client: 'clientHandler',
            resolve_client_name: 'clientHandler',

            // Communication operations
            create_internal_communication: 'communicationHandler',
            list_internal_communications: 'communicationHandler',
            get_internal_communication: 'communicationHandler'
          };

          const handlerName = handlerMap[operation];
          if (!handlerName) {
            throw new Error(`No handler found for operation: ${operation}`);
          }

          return container.resolve(handlerName);
        },

        /**
         * Resolve método do handler para operação
         */
        _resolveHandlerMethod(operation) {
          // Mapeamento de operações para métodos
          const methodMap = {
            // Ticket operations
            get_ticket: 'handleGetTicket',
            create_ticket: 'handleCreateTicket',
            update_ticket: 'handleUpdateTicket',
            list_tickets: 'handleListTickets',
            close_ticket: 'handleCloseTicket',
            create_ticket_answer: 'handleCreateTicketAnswer',

            // Client operations
            search_client: 'handleSearchClient',
            get_client: 'handleGetClient',
            resolve_client_name: 'handleResolveClientName',

            // Communication operations
            create_internal_communication: 'handleCreateInternalCommunication',
            list_internal_communications: 'handleListInternalCommunications',
            get_internal_communication: 'handleGetInternalCommunication'
          };

          const method = methodMap[operation];
          if (!method) {
            throw new Error(`No handler method found for operation: ${operation}`);
          }

          return method;
        },

        /**
         * Gera ID único para request
         */
        _generateRequestId() {
          return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        /**
         * Obtém estatísticas da camada de apresentação
         */
        async getStats() {
          try {
            const handlers = ['ticketHandler', 'clientHandler', 'communicationHandler'];
            const stats = {
              handlers: {},
              middleware: {},
              formatters: {},
              operations: []
            };

            // Estatísticas dos handlers
            for (const handlerName of handlers) {
              try {
                const handler = container.resolve(handlerName);
                if (handler.getStats) {
                  stats.handlers[handlerName] = handler.getStats();
                  if (stats.handlers[handlerName].operations) {
                    stats.operations.push(...stats.handlers[handlerName].operations);
                  }
                }
              } catch (error) {
                stats.handlers[handlerName] = { error: error.message };
              }
            }

            // Estatísticas do middleware
            try {
              const middlewarePipeline = container.resolve('middlewarePipeline');
              stats.middleware = middlewarePipeline.getStats();
            } catch (error) {
              stats.middleware = { error: error.message };
            }

            // Estatísticas dos formatters
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

            // Remove duplicatas das operações
            stats.operations = [...new Set(stats.operations)];

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
            handlers: {
              ticketHandler: container.has('ticketHandler'),
              clientHandler: container.has('clientHandler'),
              communicationHandler: container.has('communicationHandler')
            },
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

          // Testa funcionalidade básica dos componentes
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
      handlers: ['ticketHandler', 'clientHandler', 'communicationHandler'],
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
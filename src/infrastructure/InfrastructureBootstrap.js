/**
 * Bootstrap da camada de infraestrutura
 *
 * Registra todos os serviços de infraestrutura no Container DI:
 * - HttpClient com retry policy
 * - Cache managers e estratégias
 * - Configurações específicas para TiFlux API
 */
class InfrastructureBootstrap {
  static register(container) {
    const config = container.resolve('config');
    const logger = container.resolve('logger');

    // ============ HTTP CLIENT ============

    // HttpClient principal
    container.registerFactory('httpClient', () => {
      const HttpClient = require('./http/HttpClient');

      return new HttpClient({
        timeout: config.get('api.timeout', 30000),
        maxRetries: config.get('api.maxRetries', 3),
        retryDelay: config.get('api.retryDelay', 1000),
        retryMultiplier: config.get('api.retryMultiplier', 2),
        defaultHeaders: {
          'Authorization': `Bearer ${config.get('api.key')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TiFlux-MCP-Client/2.0'
        }
      }, container);
    });

    // HttpClient específico para TiFlux API
    container.registerFactory('tifluxHttpClient', () => {
      const HttpClient = require('./http/HttpClient');
      const RetryPolicy = require('./http/RetryPolicy');

      const retryPolicy = RetryPolicy.forTiFluxAPI();

      const client = new HttpClient({
        timeout: config.get('api.timeout', 30000),
        maxRetries: retryPolicy.config.maxRetries,
        retryDelay: retryPolicy.config.baseDelay,
        retryMultiplier: retryPolicy.config.multiplier,
        retryCondition: retryPolicy.config.retryCondition,
        defaultHeaders: {
          'Authorization': `Bearer ${config.get('api.key')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TiFlux-MCP-Client/2.0'
        }
      }, container);

      // Adiciona interceptors de logging
      client.addRequestInterceptor(async (options) => {
        logger.info('HTTP Request started', {
          method: options.method,
          url: options.url,
          hasData: !!options.data
        });
        return options;
      });

      client.addResponseInterceptor(async (response) => {
        logger.info('HTTP Response received', {
          status: response.statusCode,
          url: response.request.url,
          method: response.request.method
        });
        return response;
      });

      return client;
    });

    // ============ CACHE MANAGERS ============

    // Cache manager para respostas da API
    container.registerFactory('apiCacheManager', () => {
      const CacheManager = require('./cache/CacheManager');
      return CacheManager.forAPIResponses();
    });

    // Cache manager para metadados
    container.registerFactory('metadataCacheManager', () => {
      const CacheManager = require('./cache/CacheManager');
      return CacheManager.forMetadata();
    });

    // ============ CACHE STRATEGIES ============

    // Estratégia de cache principal
    container.registerFactory('cacheStrategy', () => {
      const CacheStrategy = require('./cache/CacheStrategy');
      const apiCache = container.resolve('apiCacheManager');
      return new CacheStrategy(apiCache, logger);
    });

    // Estratégia de cache para metadados
    container.registerFactory('metadataCacheStrategy', () => {
      const CacheStrategy = require('./cache/CacheStrategy');
      const metadataCache = container.resolve('metadataCacheManager');
      return new CacheStrategy(metadataCache, logger);
    });

    // ============ RETRY POLICIES ============

    // Política de retry para API TiFlux
    container.registerFactory('tifluxRetryPolicy', () => {
      const RetryPolicy = require('./http/RetryPolicy');
      return RetryPolicy.forTiFluxAPI();
    });

    // Política de retry para upload de arquivos
    container.registerFactory('fileUploadRetryPolicy', () => {
      const RetryPolicy = require('./http/RetryPolicy');
      return RetryPolicy.forFileUpload();
    });

    // Política agressiva para operações críticas
    container.registerFactory('aggressiveRetryPolicy', () => {
      const RetryPolicy = require('./http/RetryPolicy');
      return RetryPolicy.aggressive();
    });

    // ============ FACTORIES ============

    // Factory para criar novos HttpClients customizados
    container.registerFactory('httpClientFactory', () => {
      return (customConfig = {}) => {
        const HttpClient = require('./http/HttpClient');
        const defaultConfig = {
          timeout: config.get('api.timeout', 30000),
          maxRetries: config.get('api.maxRetries', 3),
          ...customConfig
        };
        return new HttpClient(defaultConfig, container);
      };
    });

    // Factory para criar cache managers customizados
    container.registerFactory('cacheManagerFactory', () => {
      return (customConfig = {}) => {
        const CacheManager = require('./cache/CacheManager');
        return new CacheManager(customConfig);
      };
    });

    // ============ HEALTH CHECKS ============

    // Health checker para infraestrutura
    container.registerFactory('infrastructureHealthChecker', () => {
      const apiCache = container.resolve('apiCacheManager');
      const metadataCache = container.resolve('metadataCacheManager');
      const httpClient = container.resolve('tifluxHttpClient');

      return {
        async checkHealth() {
          const results = {
            cache: {
              api: apiCache.getStats(),
              metadata: metadataCache.getStats()
            },
            http: {
              configured: !!httpClient,
              hasAuthToken: !!config.get('api.key')
            },
            timestamp: new Date().toISOString()
          };

          logger.debug('Infrastructure health check', results);
          return results;
        },

        async cleanup() {
          logger.info('Cleaning up infrastructure...');

          try {
            apiCache.cleanup();
            metadataCache.cleanup();
            logger.info('Infrastructure cleanup completed');
            return { success: true };
          } catch (error) {
            logger.error('Infrastructure cleanup failed', { error: error.message });
            return { success: false, error: error.message };
          }
        }
      };
    });

    logger.info('Infrastructure layer registered successfully', {
      services: [
        'httpClient',
        'tifluxHttpClient',
        'apiCacheManager',
        'metadataCacheManager',
        'cacheStrategy',
        'metadataCacheStrategy',
        'tifluxRetryPolicy',
        'fileUploadRetryPolicy',
        'aggressiveRetryPolicy',
        'httpClientFactory',
        'cacheManagerFactory',
        'infrastructureHealthChecker'
      ]
    });
  }

  /**
   * Configurações específicas para diferentes ambientes
   */
  static getEnvironmentConfig(environment = 'development') {
    const configs = {
      development: {
        cache: {
          defaultTTL: 60000, // 1 minuto em dev
          cleanupInterval: 30000 // Cleanup mais frequente
        },
        http: {
          timeout: 10000,
          maxRetries: 2
        }
      },

      production: {
        cache: {
          defaultTTL: 300000, // 5 minutos em prod
          cleanupInterval: 120000
        },
        http: {
          timeout: 30000,
          maxRetries: 3
        }
      },

      test: {
        cache: {
          defaultTTL: 1000, // TTL baixo para testes
          cleanupInterval: 0 // Sem cleanup automático em testes
        },
        http: {
          timeout: 5000,
          maxRetries: 1
        }
      }
    };

    return configs[environment] || configs.development;
  }

  /**
   * Registra configurações específicas do ambiente
   */
  static registerEnvironmentConfig(container, environment = null) {
    const config = container.resolve('config');
    const env = environment || config.get('environment', 'development');
    const envConfig = this.getEnvironmentConfig(env);

    container.registerFactory('environmentInfraConfig', () => envConfig);

    container.resolve('logger').info('Environment-specific infrastructure config registered', {
      environment: env,
      config: envConfig
    });
  }
}

module.exports = InfrastructureBootstrap;
/**
 * DomainBootstrap - Bootstrap da camada de domínio
 *
 * Registra todos os serviços de domínio no Container DI:
 * - Services (lógica de negócio)
 * - Repositories (acesso a dados)
 * - Validators (validações específicas)
 * - Mappers (transformação de dados)
 * - Configurações específicas de domínio
 */
class DomainBootstrap {
  static register(container) {
    const logger = container.resolve('logger');

    // ============ TICKET DOMAIN ============

    // TicketMapper - Transformação de dados
    container.registerFactory('ticketMapper', () => {
      const TicketMapper = require('./tickets/TicketMapper');
      return new TicketMapper(container);
    });

    // TicketValidator - Validações específicas
    container.registerFactory('ticketValidator', () => {
      const TicketValidator = require('./tickets/TicketValidator');
      return new TicketValidator(container);
    });

    // TicketRepository - Acesso a dados
    container.registerFactory('ticketRepository', () => {
      const TicketRepository = require('./tickets/TicketRepository');
      return new TicketRepository(container);
    });

    // TicketService - Lógica de negócio
    container.registerFactory('ticketService', () => {
      const TicketService = require('./tickets/TicketService');
      return new TicketService(container);
    });

    // ============ CLIENT DOMAIN ============

    // ClientMapper - Transformação de dados
    container.registerFactory('clientMapper', () => {
      const ClientMapper = require('./clients/ClientMapper');
      return new ClientMapper(container);
    });

    // ClientRepository - Acesso a dados
    container.registerFactory('clientRepository', () => {
      const ClientRepository = require('./clients/ClientRepository');
      return new ClientRepository(container);
    });

    // ClientService - Lógica de negócio
    container.registerFactory('clientService', () => {
      const ClientService = require('./clients/ClientService');
      return new ClientService(container);
    });

    // ============ COMMUNICATION DOMAIN ============

    // CommunicationMapper - Transformação de dados
    container.registerFactory('communicationMapper', () => {
      const CommunicationMapper = require('./communications/CommunicationMapper');
      return new CommunicationMapper(container);
    });

    // CommunicationValidator - Validações específicas
    container.registerFactory('communicationValidator', () => {
      const CommunicationValidator = require('./communications/CommunicationValidator');
      return new CommunicationValidator(container);
    });

    // CommunicationRepository - Acesso a dados
    container.registerFactory('communicationRepository', () => {
      const CommunicationRepository = require('./communications/CommunicationRepository');
      return new CommunicationRepository(container);
    });

    // CommunicationService - Lógica de negócio
    container.registerFactory('communicationService', () => {
      const CommunicationService = require('./communications/CommunicationService');
      return new CommunicationService(container);
    });

    // ============ DOMAIN AGGREGATES ============

    // DomainHealthChecker - Health check da camada de domínio
    container.registerFactory('domainHealthChecker', () => {
      return {
        async checkHealth() {
          const results = {
            tickets: {
              service: container.has('ticketService'),
              repository: container.has('ticketRepository'),
              validator: container.has('ticketValidator'),
              mapper: container.has('ticketMapper')
            },
            clients: {
              service: container.has('clientService'),
              repository: container.has('clientRepository'),
              mapper: container.has('clientMapper')
            },
            communications: {
              service: container.has('communicationService'),
              repository: container.has('communicationRepository'),
              validator: container.has('communicationValidator'),
              mapper: container.has('communicationMapper')
            },
            timestamp: new Date().toISOString()
          };

          logger.debug('Domain health check completed', results);
          return results;
        },

        async getStats() {
          const stats = {};

          // Ticket domain stats
          try {
            const ticketService = container.resolve('ticketService');
            stats.tickets = ticketService.getStats();
          } catch (error) {
            stats.tickets = { error: error.message };
          }

          // Client domain stats
          try {
            const clientService = container.resolve('clientService');
            stats.clients = clientService.getStats();
          } catch (error) {
            stats.clients = { error: error.message };
          }

          // Communication domain stats
          try {
            const communicationService = container.resolve('communicationService');
            stats.communications = communicationService.getStats();
          } catch (error) {
            stats.communications = { error: error.message };
          }

          return stats;
        }
      };
    });

    // DomainOrchestrator - Orquestrador de operações cross-domain
    container.registerFactory('domainOrchestrator', () => {
      return {
        /**
         * Cria ticket com resolução automática de cliente
         */
        async createTicketWithClientResolution(ticketData) {
          const ticketService = container.resolve('ticketService');
          const clientService = container.resolve('clientService');

          // Se foi fornecido client_name mas não client_id, resolve automaticamente
          if (ticketData.client_name && !ticketData.client_id) {
            try {
              const clientId = await clientService.resolveClientNameToId(ticketData.client_name);
              if (clientId) {
                ticketData.client_id = clientId;
                logger.debug('Client resolved automatically', {
                  clientName: ticketData.client_name,
                  clientId
                });
              }
            } catch (error) {
              logger.warn('Failed to resolve client automatically', {
                clientName: ticketData.client_name,
                error: error.message
              });
            }
          }

          return ticketService.createTicket(ticketData);
        },

        /**
         * Busca ticket com dados de cliente expandidos
         */
        async getTicketWithExpandedClient(ticketId) {
          const ticketService = container.resolve('ticketService');
          const clientService = container.resolve('clientService');

          const ticket = await ticketService.getTicket(ticketId);

          // Expande dados do cliente se disponível
          if (ticket && ticket.client && ticket.client.id) {
            try {
              const expandedClient = await clientService.getClientById(ticket.client.id);
              ticket.client = { ...ticket.client, ...expandedClient };
            } catch (error) {
              logger.warn('Failed to expand client data', {
                ticketId,
                clientId: ticket.client.id,
                error: error.message
              });
            }
          }

          return ticket;
        },

        /**
         * Invalida cache relacionado quando ticket é atualizado
         */
        async invalidateRelatedCache(ticketId) {
          const cacheStrategy = container.resolve('cacheStrategy');

          // Invalida ticket
          await cacheStrategy.invalidateTicket(ticketId);

          // Invalida comunicações relacionadas (se ticket number disponível)
          try {
            const ticketService = container.resolve('ticketService');
            const ticket = await ticketService.getTicket(ticketId);
            if (ticket && ticket.number) {
              await cacheStrategy.invalidateCommunications(ticket.number);
            }
          } catch (error) {
            logger.warn('Failed to invalidate communication cache', {
              ticketId,
              error: error.message
            });
          }

          logger.debug('Related cache invalidated', { ticketId });
        }
      };
    });

    // ============ DOMAIN UTILITIES ============

    // DomainValidator - Validador agregado para operações cross-domain
    container.registerFactory('domainValidator', () => {
      return {
        async validateTicketCreation(ticketData) {
          const ticketValidator = container.resolve('ticketValidator');
          await ticketValidator.validateCreateData(ticketData);
        },

        async validateTicketUpdate(ticketId, updateData) {
          const ticketValidator = container.resolve('ticketValidator');
          await ticketValidator.validateUpdateData(updateData);
        },

        async validateClientSearch(clientName) {
          if (!clientName || typeof clientName !== 'string' || clientName.trim().length < 2) {
            throw new ValidationError('client_name deve ter pelo menos 2 caracteres');
          }
        },

        async validateCommunicationCreation(ticketNumber, communicationData) {
          const communicationValidator = container.resolve('communicationValidator');
          await communicationValidator.validateCreateData(ticketNumber, communicationData);
        }
      };
    });

    // DomainMapper - Mapper agregado para transformações complexas
    container.registerFactory('domainMapper', () => {
      return {
        /**
         * Mapeia resposta unificada para múltiplos tickets com clientes
         */
        mapTicketListWithClients(tickets, clients = []) {
          const ticketMapper = container.resolve('ticketMapper');
          const clientMapper = container.resolve('clientMapper');

          const clientMap = new Map();
          clients.forEach(client => {
            const mappedClient = clientMapper.mapFromAPI(client);
            if (mappedClient && mappedClient.id) {
              clientMap.set(mappedClient.id, mappedClient);
            }
          });

          return tickets.map(ticket => {
            const mappedTicket = ticketMapper.mapFromAPI(ticket);

            // Expande dados do cliente se disponível
            if (mappedTicket.client && mappedTicket.client.id) {
              const expandedClient = clientMap.get(mappedTicket.client.id);
              if (expandedClient) {
                mappedTicket.client = { ...mappedTicket.client, ...expandedClient };
              }
            }

            return mappedTicket;
          });
        },

        /**
         * Mapeia comunicação com dados de autor expandidos
         */
        mapCommunicationWithAuthor(communication, users = []) {
          const communicationMapper = container.resolve('communicationMapper');
          const mappedComm = communicationMapper.mapFromAPI(communication);

          // Expande dados do autor se disponível
          if (mappedComm.author && mappedComm.author.id) {
            const expandedAuthor = users.find(user => user.id === mappedComm.author.id);
            if (expandedAuthor) {
              mappedComm.author = { ...mappedComm.author, ...expandedAuthor };
            }
          }

          return mappedComm;
        }
      };
    });

    logger.info('Domain layer registered successfully', {
      services: [
        'ticketService', 'ticketRepository', 'ticketValidator', 'ticketMapper',
        'clientService', 'clientRepository', 'clientMapper',
        'communicationService', 'communicationRepository', 'communicationValidator', 'communicationMapper',
        'domainHealthChecker', 'domainOrchestrator', 'domainValidator', 'domainMapper'
      ],
      domains: ['tickets', 'clients', 'communications'],
      utilities: ['healthChecker', 'orchestrator', 'validator', 'mapper']
    });
  }

  /**
   * Configurações específicas de domínio por ambiente
   */
  static getEnvironmentConfig(environment = 'development') {
    const configs = {
      development: {
        validation: {
          strict: false,
          validateTicketExists: false,
          validateClientExists: false
        },
        cache: {
          defaultTTL: 60000, // 1 minuto em dev
          aggressiveInvalidation: true
        },
        files: {
          maxFileSize: 10 * 1024 * 1024, // 10MB em dev
          maxFiles: 5,
          validateContent: false
        }
      },

      production: {
        validation: {
          strict: true,
          validateTicketExists: true,
          validateClientExists: true
        },
        cache: {
          defaultTTL: 300000, // 5 minutos em prod
          aggressiveInvalidation: false
        },
        files: {
          maxFileSize: 25 * 1024 * 1024, // 25MB em prod
          maxFiles: 10,
          validateContent: true
        }
      },

      test: {
        validation: {
          strict: true,
          validateTicketExists: false, // Para não depender de dados externos
          validateClientExists: false
        },
        cache: {
          defaultTTL: 1000, // TTL baixo para testes
          aggressiveInvalidation: true
        },
        files: {
          maxFileSize: 1 * 1024 * 1024, // 1MB para testes
          maxFiles: 2,
          validateContent: false
        }
      }
    };

    return configs[environment] || configs.development;
  }

  /**
   * Registra configurações específicas do ambiente para domínio
   */
  static registerEnvironmentConfig(container, environment = null) {
    const config = container.resolve('config');
    const env = environment || config.get('environment', 'development');
    const envConfig = this.getEnvironmentConfig(env);

    container.registerFactory('environmentDomainConfig', () => envConfig);

    container.resolve('logger').info('Environment-specific domain config registered', {
      environment: env,
      config: envConfig
    });
  }
}

// Import das classes de erro
const { ValidationError } = require('../utils/errors');

module.exports = DomainBootstrap;
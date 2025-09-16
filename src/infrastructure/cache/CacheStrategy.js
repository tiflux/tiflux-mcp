/**
 * Estratégias de cache específicas para TiFlux MCP
 *
 * Define como diferentes tipos de dados devem ser cacheados:
 * - Tickets
 * - Clientes
 * - Comunicações internas
 * - Metadados do sistema
 */
class CacheStrategy {
  constructor(cacheManager, logger = null) {
    this.cache = cacheManager;
    this.logger = logger;
  }

  /**
   * Cache para tickets individuais
   */
  async cacheTicket(ticketId, ticketData, options = {}) {
    const key = `ticket:${ticketId}`;
    const ttl = options.ttl || 300000; // 5 minutos

    return this.cache.set(key, ticketData, {
      namespace: 'tickets',
      ttl,
      ...options
    });
  }

  /**
   * Recupera ticket do cache
   */
  async getTicket(ticketId) {
    const key = `ticket:${ticketId}`;
    return this.cache.get(key, 'tickets');
  }

  /**
   * Cache para listas de tickets (com filtros)
   */
  async cacheTicketList(filters, tickets, options = {}) {
    const key = this._buildFilterKey('list', filters);
    const ttl = options.ttl || 60000; // 1 minuto (listas mudam mais frequentemente)

    return this.cache.set(key, tickets, {
      namespace: 'ticket_lists',
      ttl,
      ...options
    });
  }

  /**
   * Recupera lista de tickets do cache
   */
  async getTicketList(filters) {
    const key = this._buildFilterKey('list', filters);
    return this.cache.get(key, 'ticket_lists');
  }

  /**
   * Cache para cliente por ID
   */
  async cacheClient(clientId, clientData, options = {}) {
    const key = `client:${clientId}`;
    const ttl = options.ttl || 1800000; // 30 minutos (dados de cliente mudam pouco)

    return this.cache.set(key, clientData, {
      namespace: 'clients',
      ttl,
      ...options
    });
  }

  /**
   * Recupera cliente do cache
   */
  async getClient(clientId) {
    const key = `client:${clientId}`;
    return this.cache.get(key, 'clients');
  }

  /**
   * Cache para busca de cliente por nome
   */
  async cacheClientSearch(searchTerm, results, options = {}) {
    const key = `search:${searchTerm.toLowerCase().trim()}`;
    const ttl = options.ttl || 300000; // 5 minutos

    return this.cache.set(key, results, {
      namespace: 'client_searches',
      ttl,
      ...options
    });
  }

  /**
   * Recupera busca de cliente do cache
   */
  async getClientSearch(searchTerm) {
    const key = `search:${searchTerm.toLowerCase().trim()}`;
    return this.cache.get(key, 'client_searches');
  }

  /**
   * Cache para comunicações internas de um ticket
   */
  async cacheCommunications(ticketNumber, communications, options = {}) {
    const key = `communications:${ticketNumber}`;
    const ttl = options.ttl || 180000; // 3 minutos

    return this.cache.set(key, communications, {
      namespace: 'communications',
      ttl,
      ...options
    });
  }

  /**
   * Recupera comunicações do cache
   */
  async getCommunications(ticketNumber) {
    const key = `communications:${ticketNumber}`;
    return this.cache.get(key, 'communications');
  }

  /**
   * Cache para comunicação interna específica
   */
  async cacheCommunication(ticketNumber, communicationId, data, options = {}) {
    const key = `comm:${ticketNumber}:${communicationId}`;
    const ttl = options.ttl || 600000; // 10 minutos (comunicação específica raramente muda)

    return this.cache.set(key, data, {
      namespace: 'communication_details',
      ttl,
      ...options
    });
  }

  /**
   * Recupera comunicação específica do cache
   */
  async getCommunication(ticketNumber, communicationId) {
    const key = `comm:${ticketNumber}:${communicationId}`;
    return this.cache.get(key, 'communication_details');
  }

  /**
   * Invalida cache relacionado a um ticket
   */
  async invalidateTicket(ticketId) {
    const invalidated = [];

    // Remove ticket específico
    if (this.cache.delete(`ticket:${ticketId}`, 'tickets')) {
      invalidated.push(`ticket:${ticketId}`);
    }

    // Invalida listas de tickets (dados podem ter mudado)
    this.cache.clear('ticket_lists');
    invalidated.push('all_ticket_lists');

    this.logger?.info?.('Cache invalidated for ticket', {
      ticketId,
      invalidated
    });

    return invalidated;
  }

  /**
   * Invalida cache relacionado a um cliente
   */
  async invalidateClient(clientId) {
    const invalidated = [];

    // Remove cliente específico
    if (this.cache.delete(`client:${clientId}`, 'clients')) {
      invalidated.push(`client:${clientId}`);
    }

    // Limpa buscas de cliente (podem ter resultado diferente)
    this.cache.clear('client_searches');
    invalidated.push('all_client_searches');

    this.logger?.info?.('Cache invalidated for client', {
      clientId,
      invalidated
    });

    return invalidated;
  }

  /**
   * Invalida comunicações de um ticket
   */
  async invalidateCommunications(ticketNumber) {
    const invalidated = [];

    // Remove lista de comunicações
    if (this.cache.delete(`communications:${ticketNumber}`, 'communications')) {
      invalidated.push(`communications:${ticketNumber}`);
    }

    // Remove comunicações específicas deste ticket
    const communicationKeys = this.cache.keys('communication_details');
    const ticketCommKeys = communicationKeys.filter(key => key.startsWith(`comm:${ticketNumber}:`));

    ticketCommKeys.forEach(key => {
      const fullKey = key.replace(/^comm:/, '');
      const [ticket, commId] = fullKey.split(':');
      if (this.cache.delete(`comm:${ticket}:${commId}`, 'communication_details')) {
        invalidated.push(`comm:${ticket}:${commId}`);
      }
    });

    this.logger?.info?.('Cache invalidated for ticket communications', {
      ticketNumber,
      invalidated
    });

    return invalidated;
  }

  /**
   * Estratégia de cache inteligente com fallback
   */
  async getOrFetch(key, fetchFn, options = {}) {
    const namespace = options.namespace || 'default';
    const cached = this.cache.get(key, namespace);

    if (cached !== null) {
      this.logger?.debug?.('Cache hit', { key, namespace });
      return cached;
    }

    this.logger?.debug?.('Cache miss, fetching data', { key, namespace });

    try {
      const data = await fetchFn();

      if (data !== null && data !== undefined) {
        this.cache.set(key, data, options);
        this.logger?.debug?.('Data cached', { key, namespace });
      }

      return data;
    } catch (error) {
      this.logger?.error?.('Failed to fetch data for cache', {
        key,
        namespace,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Constrói chave baseada em filtros
   */
  _buildFilterKey(prefix, filters) {
    // Ordena os filtros para garantir chave consistente
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {});

    const filterString = JSON.stringify(sortedFilters);
    const hash = this._simpleHash(filterString);

    return `${prefix}:${hash}`;
  }

  /**
   * Hash simples para gerar chaves determinísticas
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Limpa todos os caches
   */
  async clearAll() {
    const namespaces = ['tickets', 'ticket_lists', 'clients', 'client_searches',
                       'communications', 'communication_details'];

    const cleared = [];
    for (const namespace of namespaces) {
      this.cache.clear(namespace);
      cleared.push(namespace);
    }

    this.logger?.info?.('All caches cleared', { cleared });
    return cleared;
  }

  /**
   * Estatísticas do cache por namespace
   */
  getStats() {
    return {
      global: this.cache.getStats(),
      byNamespace: {
        tickets: this.cache.keys('tickets').length,
        ticket_lists: this.cache.keys('ticket_lists').length,
        clients: this.cache.keys('clients').length,
        client_searches: this.cache.keys('client_searches').length,
        communications: this.cache.keys('communications').length,
        communication_details: this.cache.keys('communication_details').length
      }
    };
  }
}

module.exports = CacheStrategy;
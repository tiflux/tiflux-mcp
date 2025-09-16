/**
 * ClientService - Lógica de negócio para clientes
 *
 * Centraliza operações relacionadas a clientes:
 * - Busca de clientes por nome
 * - Cache inteligente de resultados
 * - Normalização de dados
 * - Business rules específicas
 */

class ClientService {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
    this.cacheStrategy = container.resolve('cacheStrategy');
    this.clientRepository = null; // Lazy loading
  }

  /**
   * Busca clientes por nome com cache inteligente
   */
  async searchClients(clientName) {
    const timer = this.logger.startTimer(`search_clients_${this._hashString(clientName)}`);

    try {
      this.logger.info('Searching clients', { clientName: clientName?.substring(0, 50) });

      // Validação básica
      if (!clientName || typeof clientName !== 'string' || clientName.trim() === '') {
        throw new ValidationError('client_name é obrigatório para busca');
      }

      const searchTerm = clientName.trim();

      // Validação de tamanho mínimo
      if (searchTerm.length < 2) {
        throw new ValidationError('client_name deve ter pelo menos 2 caracteres para busca');
      }

      // Tenta buscar no cache primeiro
      const cached = await this.cacheStrategy.getClientSearch(searchTerm);
      if (cached) {
        this.logger.debug('Client search found in cache', {
          searchTerm: searchTerm.substring(0, 30),
          resultCount: cached.length
        });
        timer();
        return this._formatClientSearchResponse(cached, searchTerm);
      }

      // Busca no repository
      this.logger.debug('Searching clients in API', { searchTerm: searchTerm.substring(0, 30) });
      const clients = await this._getClientRepository().searchByName(searchTerm);

      // Aplica business rules
      const processedClients = this._applySearchBusinessRules(clients, searchTerm);

      // Cache o resultado
      await this.cacheStrategy.cacheClientSearch(searchTerm, processedClients);

      timer();
      this.logger.info('Client search completed', {
        searchTerm: searchTerm.substring(0, 30),
        resultCount: processedClients.length
      });

      return this._formatClientSearchResponse(processedClients, searchTerm);

    } catch (error) {
      timer();
      this.logger.error('Failed to search clients', {
        clientName: clientName?.substring(0, 50),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Busca cliente por ID
   */
  async getClientById(clientId) {
    const timer = this.logger.startTimer(`get_client_${clientId}`);

    try {
      this.logger.info('Getting client by ID', { clientId });

      // Validação
      if (!clientId || isNaN(parseInt(clientId))) {
        throw new ValidationError('client_id deve ser um número válido');
      }

      const normalizedId = parseInt(clientId);

      // Tenta buscar no cache
      const cached = await this.cacheStrategy.getClient(normalizedId);
      if (cached) {
        this.logger.debug('Client found in cache', { clientId: normalizedId });
        timer();
        return cached;
      }

      // Busca no repository
      const client = await this._getClientRepository().getById(normalizedId);

      if (!client) {
        throw new NotFoundError(`Cliente #${normalizedId} não encontrado`);
      }

      // Cache o resultado
      await this.cacheStrategy.cacheClient(normalizedId, client);

      timer();
      this.logger.info('Client retrieved successfully', {
        clientId: normalizedId,
        clientName: client.name?.substring(0, 50)
      });

      return client;

    } catch (error) {
      timer();
      this.logger.error('Failed to get client', {
        clientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resolve nome de cliente para ID (para uso em tickets)
   */
  async resolveClientNameToId(clientName) {
    try {
      this.logger.debug('Resolving client name to ID', {
        clientName: clientName?.substring(0, 30)
      });

      const clients = await this.searchClients(clientName);

      if (clients.length === 0) {
        this.logger.warn('No clients found for name resolution', { clientName });
        return null;
      }

      if (clients.length === 1) {
        this.logger.debug('Single client resolved', {
          clientName: clientName?.substring(0, 30),
          clientId: clients[0].id
        });
        return clients[0].id;
      }

      // Múltiplos clientes encontrados - tenta match exato
      const exactMatch = clients.find(client =>
        client.name.toLowerCase() === clientName.toLowerCase()
      );

      if (exactMatch) {
        this.logger.debug('Exact client match found', {
          clientName: clientName?.substring(0, 30),
          clientId: exactMatch.id
        });
        return exactMatch.id;
      }

      // Se não há match exato, retorna o primeiro (com warning)
      this.logger.warn('Multiple clients found, using first match', {
        clientName: clientName?.substring(0, 30),
        matchCount: clients.length,
        selectedClientId: clients[0].id
      });

      return clients[0].id;

    } catch (error) {
      this.logger.error('Failed to resolve client name to ID', {
        clientName: clientName?.substring(0, 30),
        error: error.message
      });
      return null; // Não propaga erro para não quebrar criação de ticket
    }
  }

  /**
   * Aplica business rules na busca de clientes
   */
  _applySearchBusinessRules(clients, searchTerm) {
    // 1. Remove clientes inativos se configurado
    let processedClients = clients;

    if (this.config.get('clients.hideInactive', false)) {
      processedClients = processedClients.filter(client => client.active !== false);
      this.logger.debug('Filtered inactive clients', {
        originalCount: clients.length,
        filteredCount: processedClients.length
      });
    }

    // 2. Ordena por relevância
    processedClients = this._sortByRelevance(processedClients, searchTerm);

    // 3. Limita resultados
    const maxResults = this.config.get('clients.maxSearchResults', 50);
    if (processedClients.length > maxResults) {
      processedClients = processedClients.slice(0, maxResults);
      this.logger.debug('Limited search results', {
        originalCount: clients.length,
        limitedCount: processedClients.length,
        maxResults
      });
    }

    return processedClients;
  }

  /**
   * Ordena clientes por relevância em relação ao termo de busca
   */
  _sortByRelevance(clients, searchTerm) {
    const term = searchTerm.toLowerCase();

    return clients.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();

      // 1. Prioriza matches exatos
      if (nameA === term && nameB !== term) return -1;
      if (nameB === term && nameA !== term) return 1;

      // 2. Prioriza matches que começam com o termo
      const startsWithA = nameA.startsWith(term);
      const startsWithB = nameB.startsWith(term);

      if (startsWithA && !startsWithB) return -1;
      if (startsWithB && !startsWithA) return 1;

      // 3. Prioriza matches que contêm o termo no início de palavras
      const wordStartA = nameA.includes(' ' + term) || nameA.startsWith(term);
      const wordStartB = nameB.includes(' ' + term) || nameB.startsWith(term);

      if (wordStartA && !wordStartB) return -1;
      if (wordStartB && !wordStartA) return 1;

      // 4. Ordena alfabeticamente
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }

  /**
   * Formata resposta da busca de clientes
   */
  _formatClientSearchResponse(clients, searchTerm) {
    if (clients.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `**🔍 Busca por Cliente**\n\n` +
                `**Termo buscado:** "${searchTerm}"\n` +
                `**Resultado:** Nenhum cliente encontrado.\n\n` +
                `💡 *Dica: Tente usar um termo mais genérico ou verifique a grafia.*`
        }]
      };
    }

    let text = `**🔍 Busca por Cliente**\n\n` +
               `**Termo buscado:** "${searchTerm}"\n` +
               `**${clients.length} cliente(s) encontrado(s):**\n\n`;

    clients.forEach((client, index) => {
      const isActive = client.active !== false;
      const statusIcon = isActive ? '✅' : '❌';

      text += `**${index + 1}. ${statusIcon} ${client.name}**\n` +
              `   **ID:** ${client.id}\n`;

      if (client.email) {
        text += `   **Email:** ${client.email}\n`;
      }

      if (client.phone) {
        text += `   **Telefone:** ${client.phone}\n`;
      }

      if (client.document) {
        text += `   **Documento:** ${client.document}\n`;
      }

      if (!isActive) {
        text += `   ⚠️ *Cliente inativo*\n`;
      }

      text += '\n';
    });

    if (clients.length >= this.config.get('clients.maxSearchResults', 50)) {
      text += `📄 *Mostrando os primeiros ${clients.length} resultados. ` +
              `Para resultados mais específicos, refine sua busca.*`;
    }

    return {
      content: [{
        type: 'text',
        text: text
      }]
    };
  }

  /**
   * Invalida cache relacionado a um cliente
   */
  async invalidateClientCache(clientId) {
    if (clientId) {
      await this.cacheStrategy.invalidateClient(clientId);
      this.logger.debug('Client cache invalidated', { clientId });
    }
  }

  /**
   * Limpa cache de buscas de cliente
   */
  async clearSearchCache() {
    await this.cacheStrategy.clearAll();
    this.logger.debug('Client search cache cleared');
  }

  /**
   * Gera hash simples de uma string
   */
  _hashString(str) {
    if (!str) return 'empty';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
  }

  /**
   * Lazy loading do ClientRepository
   */
  _getClientRepository() {
    if (!this.clientRepository) {
      this.clientRepository = this.container.resolve('clientRepository');
    }
    return this.clientRepository;
  }

  /**
   * Estatísticas do service
   */
  getStats() {
    return {
      cache: {
        strategy: 'client_search',
        ttl: '5 minutes'
      },
      business_rules: {
        hide_inactive: this.config.get('clients.hideInactive', false),
        max_results: this.config.get('clients.maxSearchResults', 50),
        min_search_length: 2
      },
      search: {
        relevance_sorting: true,
        exact_match_priority: true,
        word_start_priority: true
      }
    };
  }
}

// Import das classes de erro
const { ValidationError, NotFoundError } = require('../../utils/errors');

module.exports = ClientService;
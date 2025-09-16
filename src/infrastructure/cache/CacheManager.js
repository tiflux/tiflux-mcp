/**
 * Cache Manager em memória com TTL e estratégias flexíveis
 *
 * Features:
 * - TTL (Time To Live) configurável
 * - Diferentes estratégias de invalidação (LRU, LFU, TTL)
 * - Namespaces para organização
 * - Métricas de performance
 * - Cleanup automático
 */
class CacheManager {
  constructor(options = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 300000, // 5 minutos
      cleanupInterval: 60000, // 1 minuto
      strategy: 'lru', // 'lru', 'lfu', 'ttl'
      ...options
    };

    this.cache = new Map();
    this.accessTimes = new Map();
    this.accessCounts = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0
    };

    this.cleanupTimer = null;
    this._startCleanup();
  }

  /**
   * Armazena valor no cache
   */
  set(key, value, options = {}) {
    const ttl = options.ttl ?? this.config.defaultTTL;
    const namespace = options.namespace || 'default';

    const cacheKey = this._buildKey(namespace, key);
    const expiresAt = Date.now() + ttl;

    const cacheEntry = {
      value,
      expiresAt,
      createdAt: Date.now(),
      namespace,
      originalKey: key
    };

    // Remove entrada existente se houver
    if (this.cache.has(cacheKey)) {
      this._removeKey(cacheKey);
    }

    // Verifica se precisa fazer eviction
    if (this.cache.size >= this.config.maxSize) {
      this._evictEntries(1);
    }

    // Adiciona nova entrada
    this.cache.set(cacheKey, cacheEntry);
    this.accessTimes.set(cacheKey, Date.now());
    this.accessCounts.set(cacheKey, 0);

    this.metrics.sets++;
    this.metrics.size = this.cache.size;

    return true;
  }

  /**
   * Recupera valor do cache
   */
  get(key, namespace = 'default') {
    const cacheKey = this._buildKey(namespace, key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    // Verifica se expirou
    if (Date.now() > entry.expiresAt) {
      this._removeKey(cacheKey);
      this.metrics.misses++;
      return null;
    }

    // Atualiza estatísticas de acesso
    this.accessTimes.set(cacheKey, Date.now());
    this.accessCounts.set(cacheKey, (this.accessCounts.get(cacheKey) || 0) + 1);

    this.metrics.hits++;
    return entry.value;
  }

  /**
   * Verifica se chave existe no cache
   */
  has(key, namespace = 'default') {
    const cacheKey = this._buildKey(namespace, key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return false;
    }

    // Verifica se expirou
    if (Date.now() > entry.expiresAt) {
      this._removeKey(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Remove entrada do cache
   */
  delete(key, namespace = 'default') {
    const cacheKey = this._buildKey(namespace, key);
    const existed = this.cache.has(cacheKey);

    if (existed) {
      this._removeKey(cacheKey);
      this.metrics.deletes++;
    }

    return existed;
  }

  /**
   * Limpa todo o cache ou namespace específico
   */
  clear(namespace = null) {
    if (namespace) {
      const prefix = `${namespace}:`;
      const keysToDelete = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.namespace === namespace) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this._removeKey(key));
    } else {
      this.cache.clear();
      this.accessTimes.clear();
      this.accessCounts.clear();
      this.metrics.size = 0;
    }

    return true;
  }

  /**
   * Obtém ou define valor (get com fallback)
   */
  async getOrSet(key, factory, options = {}) {
    const namespace = options.namespace || 'default';
    const cached = this.get(key, namespace);

    if (cached !== null) {
      return cached;
    }

    // Executa factory para gerar valor
    let value;
    if (typeof factory === 'function') {
      value = await factory();
    } else {
      value = factory;
    }

    this.set(key, value, options);
    return value;
  }

  /**
   * Atualiza TTL de uma entrada existente
   */
  touch(key, ttl = null, namespace = 'default') {
    const cacheKey = this._buildKey(namespace, key);
    const entry = this.cache.get(cacheKey);

    if (!entry || Date.now() > entry.expiresAt) {
      return false;
    }

    const newTTL = ttl ?? this.config.defaultTTL;
    entry.expiresAt = Date.now() + newTTL;
    this.accessTimes.set(cacheKey, Date.now());

    return true;
  }

  /**
   * Lista todas as chaves de um namespace
   */
  keys(namespace = null) {
    const keys = [];

    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() <= entry.expiresAt) {
        if (!namespace || entry.namespace === namespace) {
          keys.push(entry.originalKey);
        }
      }
    }

    return keys;
  }

  /**
   * Estatísticas do cache
   */
  getStats() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests * 100).toFixed(2) : 0;

    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      maxSize: this.config.maxSize,
      currentSize: this.cache.size,
      memoryUsage: this._calculateMemoryUsage()
    };
  }

  /**
   * Força limpeza de entradas expiradas
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this._removeKey(key));

    return keysToDelete.length;
  }

  /**
   * Remove entrada e limpa metadados
   */
  _removeKey(cacheKey) {
    this.cache.delete(cacheKey);
    this.accessTimes.delete(cacheKey);
    this.accessCounts.delete(cacheKey);
    this.metrics.size = this.cache.size;
  }

  /**
   * Constrói chave com namespace
   */
  _buildKey(namespace, key) {
    return `${namespace}:${key}`;
  }

  /**
   * Evict entries baseado na estratégia configurada
   */
  _evictEntries(count) {
    const candidates = [];

    for (const [key, entry] of this.cache.entries()) {
      candidates.push({
        key,
        entry,
        accessTime: this.accessTimes.get(key) || 0,
        accessCount: this.accessCounts.get(key) || 0
      });
    }

    // Ordena baseado na estratégia
    switch (this.config.strategy) {
      case 'lru': // Least Recently Used
        candidates.sort((a, b) => a.accessTime - b.accessTime);
        break;
      case 'lfu': // Least Frequently Used
        candidates.sort((a, b) => a.accessCount - b.accessCount);
        break;
      case 'ttl': // Shortest TTL
        candidates.sort((a, b) => a.entry.expiresAt - b.entry.expiresAt);
        break;
      default:
        candidates.sort((a, b) => a.accessTime - b.accessTime);
    }

    // Remove as primeiras 'count' entradas
    for (let i = 0; i < count && i < candidates.length; i++) {
      this._removeKey(candidates[i].key);
      this.metrics.evictions++;
    }
  }

  /**
   * Inicia cleanup automático
   */
  _startCleanup() {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }
  }

  /**
   * Para cleanup automático
   */
  _stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Calcula uso aproximado de memória
   */
  _calculateMemoryUsage() {
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      totalSize += this._getObjectSize(key);
      totalSize += this._getObjectSize(entry);
    }

    return this._formatBytes(totalSize);
  }

  /**
   * Calcula tamanho aproximado de um objeto
   */
  _getObjectSize(obj) {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size || jsonString.length;
  }

  /**
   * Formata bytes em formato legível
   */
  _formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Destroi o cache manager
   */
  destroy() {
    this._stopCleanup();
    this.clear();
  }

  /**
   * Factory para cache de API responses
   */
  static forAPIResponses() {
    return new CacheManager({
      maxSize: 500,
      defaultTTL: 300000, // 5 minutos
      cleanupInterval: 120000, // 2 minutos
      strategy: 'lru'
    });
  }

  /**
   * Factory para cache de metadados (longa duração)
   */
  static forMetadata() {
    return new CacheManager({
      maxSize: 200,
      defaultTTL: 1800000, // 30 minutos
      cleanupInterval: 300000, // 5 minutos
      strategy: 'lfu'
    });
  }
}

module.exports = CacheManager;
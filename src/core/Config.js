/**
 * Configuration Manager
 * Gerencia configurações por ambiente com validação
 */

const fs = require('fs');
const path = require('path');

class Config {
  constructor(environment = null) {
    this.environment = environment || process.env.NODE_ENV || 'development';
    this.config = {};
    this.loaded = false;

    this.load();
  }

  /**
   * Carrega configurações do arquivo correspondente ao ambiente
   */
  load() {
    try {
      // Carregar configuração padrão
      const defaultConfigPath = path.join(__dirname, '../../config/default.json');
      const defaultConfig = this.loadConfigFile(defaultConfigPath);

      // Carregar configuração específica do ambiente
      const envConfigPath = path.join(__dirname, `../../config/${this.environment}.json`);
      let envConfig = {};

      if (fs.existsSync(envConfigPath)) {
        envConfig = this.loadConfigFile(envConfigPath);
      }

      // Merge das configurações (env sobrescreve default)
      this.config = this.deepMerge(defaultConfig, envConfig);

      // Aplicar variáveis de ambiente
      this.applyEnvironmentVariables();

      // Validar configuração
      this.validate();

      this.loaded = true;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Carrega um arquivo de configuração JSON
   * @param {string} filePath - Caminho do arquivo
   * @returns {Object} - Objeto de configuração
   */
  loadConfigFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${filePath}`);
      }
      throw new Error(`Invalid JSON in configuration file: ${filePath}`);
    }
  }

  /**
   * Merge profundo de dois objetos
   * @param {Object} target - Objeto base
   * @param {Object} source - Objeto a ser mesclado
   * @returns {Object} - Objeto resultante
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Aplica variáveis de ambiente sobre a configuração
   */
  applyEnvironmentVariables() {
    // API Key (obrigatória)
    if (process.env.TIFLUX_API_KEY) {
      this.set('api.apiKey', process.env.TIFLUX_API_KEY);
    }

    // URL base da API
    if (process.env.TIFLUX_API_BASE_URL) {
      this.set('api.baseUrl', process.env.TIFLUX_API_BASE_URL);
    }

    // Valores padrão
    if (process.env.TIFLUX_DEFAULT_CLIENT_ID) {
      this.set('defaults.clientId', parseInt(process.env.TIFLUX_DEFAULT_CLIENT_ID));
    }

    if (process.env.TIFLUX_DEFAULT_DESK_ID) {
      this.set('defaults.deskId', parseInt(process.env.TIFLUX_DEFAULT_DESK_ID));
    }

    if (process.env.TIFLUX_DEFAULT_PRIORITY_ID) {
      this.set('defaults.priorityId', parseInt(process.env.TIFLUX_DEFAULT_PRIORITY_ID));
    }

    if (process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID) {
      this.set('defaults.catalogItemId', parseInt(process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID));
    }

    // Configurações de logging
    if (process.env.LOG_LEVEL) {
      this.set('logging.level', process.env.LOG_LEVEL.toLowerCase());
    }

    if (process.env.LOG_FILE) {
      this.set('logging.fileName', process.env.LOG_FILE);
      this.set('logging.enableFile', true);
    }
  }

  /**
   * Valida configuração carregada
   */
  validate() {
    const required = [
      'server.name',
      'server.version',
      'api.baseUrl',
      'api.timeout'
    ];

    for (const path of required) {
      if (this.get(path) === undefined) {
        throw new Error(`Missing required configuration: ${path}`);
      }
    }

    // Validações específicas
    if (this.get('api.timeout') <= 0) {
      throw new Error('api.timeout must be greater than 0');
    }

    if (this.get('api.retries') < 0) {
      throw new Error('api.retries must be 0 or greater');
    }

    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(this.get('logging.level'))) {
      throw new Error(`Invalid logging.level. Must be one of: ${validLogLevels.join(', ')}`);
    }
  }

  /**
   * Obtém valor de configuração usando path notation
   * @param {string} path - Caminho da configuração (ex: 'api.timeout')
   * @param {*} defaultValue - Valor padrão se não encontrado
   * @returns {*} - Valor da configuração
   */
  get(path, defaultValue = undefined) {
    return this.getNestedValue(this.config, path, defaultValue);
  }

  /**
   * Define valor de configuração usando path notation
   * @param {string} path - Caminho da configuração
   * @param {*} value - Valor a ser definido
   */
  set(path, value) {
    this.setNestedValue(this.config, path, value);
  }

  /**
   * Obtém valor aninhado de um objeto usando path notation
   * @param {Object} obj - Objeto base
   * @param {string} path - Caminho (ex: 'a.b.c')
   * @param {*} defaultValue - Valor padrão
   * @returns {*} - Valor encontrado ou padrão
   */
  getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Define valor aninhado em um objeto usando path notation
   * @param {Object} obj - Objeto base
   * @param {string} path - Caminho (ex: 'a.b.c')
   * @param {*} value - Valor a ser definido
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  /**
   * Verifica se uma configuração existe
   * @param {string} path - Caminho da configuração
   * @returns {boolean}
   */
  has(path) {
    return this.get(path) !== undefined;
  }

  /**
   * Retorna toda a configuração
   * @returns {Object} - Objeto completo de configuração
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Obtém informações sobre o ambiente atual
   * @returns {Object} - Informações do ambiente
   */
  getEnvironmentInfo() {
    return {
      environment: this.environment,
      nodeEnv: process.env.NODE_ENV,
      loaded: this.loaded,
      configKeys: Object.keys(this.config)
    };
  }

  /**
   * Recarrega a configuração
   */
  reload() {
    this.loaded = false;
    this.config = {};
    this.load();
  }
}

module.exports = Config;
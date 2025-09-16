/**
 * Structured Logger
 * Sistema de logging estruturado com diferentes níveis e formatos
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      format: config.format || 'json',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile || false,
      fileName: config.fileName || 'logs/tiflux-mcp.log',
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles || 5,
      ...config
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    this.currentLevel = this.levels[this.config.level] || this.levels.info;

    // Criar diretório de logs se necessário
    if (this.config.enableFile) {
      this.ensureLogDirectory();
    }
  }

  /**
   * Garante que o diretório de logs existe
   */
  ensureLogDirectory() {
    const logDir = path.dirname(this.config.fileName);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Verifica se o log deve ser processado baseado no nível
   * @param {string} level - Nível do log
   * @returns {boolean}
   */
  shouldLog(level) {
    const levelValue = this.levels[level];
    return levelValue !== undefined && levelValue <= this.currentLevel;
  }

  /**
   * Log de erro
   * @param {string} message - Mensagem
   * @param {Object} meta - Metadados opcionais
   * @param {Error} error - Objeto de erro opcional
   */
  error(message, meta = {}, error = null) {
    if (!this.shouldLog('error')) return;

    const logData = {
      ...meta,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    this.log('error', message, logData);
  }

  /**
   * Log de warning
   * @param {string} message - Mensagem
   * @param {Object} meta - Metadados opcionais
   */
  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;
    this.log('warn', message, meta);
  }

  /**
   * Log de informação
   * @param {string} message - Mensagem
   * @param {Object} meta - Metadados opcionais
   */
  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;
    this.log('info', message, meta);
  }

  /**
   * Log de debug
   * @param {string} message - Mensagem
   * @param {Object} meta - Metadados opcionais
   */
  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;
    this.log('debug', message, meta);
  }

  /**
   * Log principal que processa a saída
   * @param {string} level - Nível do log
   * @param {string} message - Mensagem
   * @param {Object} meta - Metadados
   */
  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();

    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      service: 'tiflux-mcp',
      pid: process.pid,
      ...meta
    };

    // Output para console
    if (this.config.enableConsole) {
      this.writeToConsole(level, logEntry);
    }

    // Output para arquivo
    if (this.config.enableFile) {
      this.writeToFile(logEntry);
    }
  }

  /**
   * Escreve log no console com formatação
   * @param {string} level - Nível do log
   * @param {Object} logEntry - Entrada de log
   */
  writeToConsole(level, logEntry) {
    if (this.config.format === 'json') {
      console.error(JSON.stringify(logEntry));
    } else {
      // Formato texto legível
      const levelColors = {
        error: '\x1b[31m', // Vermelho
        warn: '\x1b[33m',  // Amarelo
        info: '\x1b[36m',  // Ciano
        debug: '\x1b[90m'  // Cinza
      };

      const reset = '\x1b[0m';
      const color = levelColors[level] || '';

      const metaStr = Object.keys(logEntry)
        .filter(key => !['timestamp', 'level', 'message', 'service', 'pid'].includes(key))
        .map(key => `${key}=${JSON.stringify(logEntry[key])}`)
        .join(' ');

      const output = `${color}[${logEntry.timestamp}] ${logEntry.level}${reset} ${logEntry.message}${metaStr ? ` ${metaStr}` : ''}`;

      // Usar stderr para logs de erro/warn, stdout para outros
      if (level === 'error' || level === 'warn') {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }

  /**
   * Escreve log no arquivo
   * @param {Object} logEntry - Entrada de log
   */
  writeToFile(logEntry) {
    try {
      // Verificar rotação de arquivo
      this.rotateLogIfNeeded();

      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.config.fileName, logLine, 'utf8');
    } catch (error) {
      // Fallback para console se não conseguir escrever no arquivo
      console.error('Failed to write to log file:', error.message);
      this.writeToConsole('error', {
        ...logEntry,
        logFileError: error.message
      });
    }
  }

  /**
   * Rotaciona arquivo de log se necessário
   */
  rotateLogIfNeeded() {
    try {
      if (!fs.existsSync(this.config.fileName)) {
        return;
      }

      const stats = fs.statSync(this.config.fileName);
      if (stats.size < this.config.maxFileSize) {
        return;
      }

      // Rotacionar arquivos existentes
      for (let i = this.config.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.config.fileName}.${i}`;
        const newFile = `${this.config.fileName}.${i + 1}`;

        if (fs.existsSync(oldFile)) {
          if (i === this.config.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Deletar o mais antigo
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Mover arquivo atual para .1
      fs.renameSync(this.config.fileName, `${this.config.fileName}.1`);

    } catch (error) {
      console.error('Failed to rotate log file:', error.message);
    }
  }

  /**
   * Cria um logger filho com contexto adicional
   * @param {Object} context - Contexto a ser adicionado a todos os logs
   * @returns {Logger} - Nova instância de logger
   */
  child(context) {
    const childLogger = new Logger(this.config);
    childLogger.defaultContext = { ...this.defaultContext, ...context };
    return childLogger;
  }

  /**
   * Log de request HTTP
   * @param {Object} request - Dados da requisição
   * @param {number} duration - Duração em ms
   * @param {number} status - Status code
   */
  logRequest(request, duration, status) {
    const level = status >= 400 ? 'warn' : 'info';
    this.log(level, 'HTTP Request', {
      method: request.method,
      url: request.url,
      duration: `${duration}ms`,
      status,
      userAgent: request.headers?.['user-agent'],
      ip: request.ip || request.connection?.remoteAddress
    });
  }

  /**
   * Log de performance
   * @param {string} operation - Nome da operação
   * @param {number} duration - Duração em ms
   * @param {Object} meta - Metadados opcionais
   */
  logPerformance(operation, duration, meta = {}) {
    const level = duration > 1000 ? 'warn' : 'info';
    this.log(level, `Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...meta
    });
  }

  /**
   * Log de início de operação
   * @param {string} operation - Nome da operação
   * @param {Object} meta - Metadados opcionais
   * @returns {Function} - Função para finalizar o log
   */
  startTimer(operation, meta = {}) {
    const startTime = Date.now();
    this.debug(`Starting: ${operation}`, meta);

    return (additionalMeta = {}) => {
      const duration = Date.now() - startTime;
      this.logPerformance(operation, duration, { ...meta, ...additionalMeta });
      return duration;
    };
  }

  /**
   * Define novo nível de log
   * @param {string} level - Novo nível
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.config.level = level;
      this.currentLevel = this.levels[level];
    }
  }

  /**
   * Obtém estatísticas do logger
   * @returns {Object} - Estatísticas
   */
  getStats() {
    let fileSize = 0;
    if (this.config.enableFile && fs.existsSync(this.config.fileName)) {
      try {
        fileSize = fs.statSync(this.config.fileName).size;
      } catch (error) {
        // Ignora erro
      }
    }

    return {
      level: this.config.level,
      enableConsole: this.config.enableConsole,
      enableFile: this.config.enableFile,
      fileName: this.config.fileName,
      fileSize,
      maxFileSize: this.config.maxFileSize
    };
  }
}

module.exports = Logger;
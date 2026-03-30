/**
 * EventParser - Parser para eventos Lambda Function URL
 *
 * Extrai e valida dados de eventos HTTP recebidos via Lambda Function URL.
 * Function URL fornece formato diferente do API Gateway.
 *
 * Formato do evento Lambda Function URL:
 * {
 *   version: '2.0',
 *   routeKey: '$default',
 *   rawPath: '/mcp',
 *   rawQueryString: '',
 *   headers: { 'x-tiflux-api-key': 'abc123', ... },
 *   requestContext: { http: { method: 'POST', path: '/mcp', ... } },
 *   body: '{"jsonrpc":"2.0",...}',
 *   isBase64Encoded: false
 * }
 */

class EventParser {
  /**
   * Extrai dados do evento Lambda Function URL
   * @param {Object} event - Evento Lambda Function URL
   * @returns {Object} - Dados extraidos: { method, path, headers, body, apiKey }
   * @throws {Error} - Se evento invalido ou API key ausente
   */
  static async parse(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('Evento Lambda invalido');
    }

    // Extrair method e path do requestContext (Function URL format)
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const path = event.requestContext?.http?.path || event.path || event.rawPath || '/';

    // Extrair headers (case-insensitive)
    const headers = this.normalizeHeaders(event.headers || {});

    // Extrair body
    let body = null;
    if (event.body) {
      try {
        // Decodificar base64 se necessario
        const rawBody = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;

        // Parse JSON se content-type for application/json
        if (headers['content-type']?.includes('application/json')) {
          body = JSON.parse(rawBody);
        } else {
          body = rawBody;
        }
      } catch (error) {
        throw new Error(`Body JSON invalido: ${error.message}`);
      }
    }

    // Extrair API key: header direto OU Bearer token (OAuth)
    const apiKey = headers['x-tiflux-api-key'] || await this.resolveApiKeyFromBearer(headers);
    if (!apiKey) {
      throw new Error('Header x-tiflux-api-key ou Authorization Bearer obrigatorio');
    }

    // Extrair session ID (se presente)
    const sessionId = headers['mcp-session-id'] || this.generateSessionId();

    return {
      method,
      path,
      headers,
      body,
      apiKey,
      sessionId,
      rawEvent: event // Manter evento original para debug
    };
  }

  /**
   * Normaliza headers para lowercase (HTTP headers sao case-insensitive)
   * @param {Object} headers - Headers originais
   * @returns {Object} - Headers normalizados
   */
  static normalizeHeaders(headers) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  /**
   * Gera session ID unico para tracking
   * @returns {string} - Session ID
   */
  static generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Valida se evento e um request MCP valido
   * @param {Object} parsedEvent - Evento parseado
   * @returns {boolean} - True se valido
   */
  static isValidMCPRequest(parsedEvent) {
    if (!parsedEvent.body) {
      return false;
    }

    // Validar estrutura JSON-RPC do MCP
    const body = parsedEvent.body;
    return (
      body.jsonrpc === '2.0' &&
      body.method &&
      typeof body.method === 'string'
      // Nota: id e opcional (notificacoes JSON-RPC nao tem id)
    );
  }

  /**
   * Resolve API key a partir de um Bearer token OAuth
   * @param {Object} headers - Headers normalizados
   * @returns {string|null} - API key ou null
   */
  static async resolveApiKeyFromBearer(headers) {
    const authHeader = headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    if (!token) return null;

    try {
      const DynamoStore = require('../oauth/DynamoStore');
      const tokenData = await DynamoStore.getAccessToken(token);
      if (tokenData && tokenData.apiKey) {
        return tokenData.apiKey;
      }
    } catch (error) {
      console.error('[EventParser] Erro ao resolver Bearer token', { error: error.message });
    }

    return null;
  }

  /**
   * Parse body JSON de um evento Lambda (sem validar API key)
   * Usado para rotas OAuth que nao precisam de autenticacao
   * @param {Object} event - Evento Lambda
   * @returns {Object} - Body parseado
   */
  static parseBody(event) {
    if (!event.body) return {};

    try {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  /**
   * Parse body form-urlencoded de um evento Lambda
   * Usado para POST /authorize (form submission)
   * @param {Object} event - Evento Lambda
   * @returns {Object} - Dados do formulario
   */
  static parseFormBody(event) {
    if (!event.body) return {};

    try {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;

      // Tentar JSON primeiro (caso o client envie JSON)
      try {
        return JSON.parse(rawBody);
      } catch {
        // Parse form-urlencoded
        const params = new URLSearchParams(rawBody);
        const result = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        return result;
      }
    } catch {
      return {};
    }
  }

  /**
   * Extrai hash da API key para logging (seguranca)
   * Nunca loga a API key completa
   * @param {string} apiKey - API key
   * @returns {string} - Hash parcial para identificacao
   */
  static getApiKeyHash(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return 'invalid';
    }
    // Mostrar apenas primeiros 4 e ultimos 4 caracteres
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
  }
}

module.exports = EventParser;

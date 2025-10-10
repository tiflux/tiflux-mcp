/**
 * ResponseBuilder - Builder para respostas Lambda Function URL
 *
 * Formata respostas HTTP no formato esperado pela Lambda Function URL.
 * Inclui tratamento de erros, headers CORS, e headers MCP.
 *
 * Formato de resposta Lambda Function URL:
 * {
 *   statusCode: 200,
 *   headers: { 'content-type': 'application/json', ... },
 *   body: '{"result": ...}'
 * }
 */

class ResponseBuilder {
  /**
   * Cria resposta de sucesso (200 OK)
   * @param {Object} data - Dados a retornar
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static success(data, sessionId = null) {
    const headers = this.getDefaultHeaders();

    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  }

  /**
   * Cria resposta de erro 400 (Bad Request)
   * @param {string} message - Mensagem de erro
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static badRequest(message, sessionId = null) {
    return this.error(400, message, 'BAD_REQUEST', sessionId);
  }

  /**
   * Cria resposta de erro 401 (Unauthorized)
   * @param {string} message - Mensagem de erro
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static unauthorized(message = 'Header x-tiflux-api-key obrigatorio', sessionId = null) {
    return this.error(401, message, 'UNAUTHORIZED', sessionId);
  }

  /**
   * Cria resposta de erro 404 (Not Found)
   * @param {string} message - Mensagem de erro
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static notFound(message = 'Endpoint nao encontrado', sessionId = null) {
    return this.error(404, message, 'NOT_FOUND', sessionId);
  }

  /**
   * Cria resposta de erro 500 (Internal Server Error)
   * @param {string} message - Mensagem de erro
   * @param {Error} error - Erro original (opcional, para logging)
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static internalError(message = 'Erro interno do servidor', error = null, sessionId = null) {
    // Log do erro completo (sera capturado pelo CloudWatch)
    if (error) {
      console.error('[ResponseBuilder] Internal Error:', {
        message: error.message,
        stack: error.stack,
        sessionId
      });
    }

    // Nao expor detalhes internos do erro ao cliente
    return this.error(500, message, 'INTERNAL_ERROR', sessionId);
  }

  /**
   * Cria resposta de erro generica
   * @param {number} statusCode - Codigo HTTP
   * @param {string} message - Mensagem de erro
   * @param {string} code - Codigo de erro customizado
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static error(statusCode, message, code = 'ERROR', sessionId = null) {
    const headers = this.getDefaultHeaders();

    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: {
          code,
          message,
          statusCode
        }
      })
    };
  }

  /**
   * Cria resposta de health check
   * @returns {Object} - Resposta Lambda formatada
   */
  static health() {
    return {
      statusCode: 200,
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        status: 'healthy',
        service: 'tiflux-mcp',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        transport: 'streamable-http',
        deployment: 'aws-lambda'
      })
    };
  }

  /**
   * Cria resposta de informacoes do servidor MCP
   * Endpoint GET /mcp para compatibilidade com MCP clients
   * @returns {Object} - Resposta Lambda formatada
   */
  static serverInfo() {
    return {
      statusCode: 200,
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        name: 'tiflux-mcp',
        version: '2.0.0',
        vendor: 'TiFlux',
        transport: 'streamable-http',
        deployment: 'aws-lambda',
        protocol: 'mcp',
        description: 'TiFlux MCP Server - AWS Lambda deployment',
        endpoint: '/mcp',
        methods: {
          GET: 'Server information',
          POST: 'MCP JSON-RPC requests'
        },
        headers: {
          required: ['x-tiflux-api-key'],
          optional: ['mcp-session-id']
        },
        timestamp: new Date().toISOString()
      })
    };
  }

  /**
   * Cria resposta MCP JSON-RPC
   * @param {Object} result - Resultado MCP
   * @param {string|number} id - ID da requisicao JSON-RPC
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static mcpResponse(result, id, sessionId = null) {
    const mcpData = {
      jsonrpc: '2.0',
      id,
      result
    };

    return this.success(mcpData, sessionId);
  }

  /**
   * Cria resposta de erro MCP JSON-RPC
   * @param {string} message - Mensagem de erro
   * @param {number} code - Codigo de erro JSON-RPC
   * @param {string|number} id - ID da requisicao JSON-RPC
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static mcpError(message, code = -32603, id = null, sessionId = null) {
    const headers = this.getDefaultHeaders();

    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const mcpErrorData = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };

    return {
      statusCode: 200, // JSON-RPC sempre retorna 200, erro vai no body
      headers,
      body: JSON.stringify(mcpErrorData)
    };
  }

  /**
   * Retorna headers HTTP padrao
   * @returns {Object} - Headers padrao
   */
  static getDefaultHeaders() {
    return {
      'content-type': 'application/json',
      'x-powered-by': 'TiFlux MCP Lambda',
      // CORS headers (ajustar conforme necessidade)
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-tiflux-api-key, mcp-session-id',
      'access-control-max-age': '86400'
    };
  }

  /**
   * Cria resposta para preflight CORS (OPTIONS)
   * @returns {Object} - Resposta Lambda formatada
   */
  static corsPreFlight() {
    return {
      statusCode: 200,
      headers: this.getDefaultHeaders(),
      body: ''
    };
  }

  /**
   * Cria resposta 204 No Content (para notificacoes JSON-RPC)
   * Notificacoes nao esperam resposta, entao retornamos 204
   * @param {string} sessionId - Session ID para tracking
   * @returns {Object} - Resposta Lambda formatada
   */
  static noContent(sessionId = null) {
    const headers = this.getDefaultHeaders();

    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }
}

module.exports = ResponseBuilder;

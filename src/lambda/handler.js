/**
 * Lambda MCP Handler - Logica principal HTTP para MCP sobre Lambda
 *
 * Este handler processa requisicoes HTTP do Lambda Function URL e
 * as traduz para o protocolo MCP usando StreamableHTTPServerTransport.
 *
 * Fluxo:
 * 1. Recebe evento HTTP Lambda
 * 2. Parse do evento (extrai API key, body, headers)
 * 3. Valida API key (401 se ausente)
 * 4. Cria servidor MCP isolado com API key do cliente
 * 5. Processa requisicao MCP
 * 6. Retorna resposta HTTP
 */

const EventParser = require('./EventParser');
const ResponseBuilder = require('./ResponseBuilder');
const ServerFactory = require('./ServerFactory');

class MCPHandler {
  /**
   * Processa requisicao HTTP do Lambda Function URL
   * @param {Object} event - Evento Lambda Function URL
   * @returns {Object} - Resposta HTTP Lambda
   */
  static async handle(event) {
    let parsedEvent = null;
    let sessionId = null;

    try {
      // 1. Extrair path primeiro (antes de validar API key)
      const path = event.requestContext?.http?.path || event.path || event.rawPath || '/';
      const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

      // 2. Roteamento por path (health e 404 nao precisam de API key)
      if (path === '/health' || path === '/health/') {
        return this.handleHealth();
      }

      // Verificar se path é válido antes de exigir API key
      if (path !== '/mcp' && path !== '/mcp/' && path !== '/') {
        // Path desconhecido - retornar 404 sem exigir API key
        return ResponseBuilder.notFound(`Path nao encontrado: ${path}`, null);
      }

      // 3. Parse completo do evento (valida API key) - apenas para /mcp
      parsedEvent = EventParser.parse(event);
      sessionId = parsedEvent.sessionId;

      const { apiKey, body } = parsedEvent;

      console.log('[MCPHandler] Requisicao recebida', {
        sessionId,
        method,
        path,
        apiKeyHash: EventParser.getApiKeyHash(apiKey),
        timestamp: new Date().toISOString()
      });

      // 4. Processar endpoint /mcp

      // 4.1. Tratar preflight CORS
      if (method === 'OPTIONS') {
        return ResponseBuilder.corsPreFlight();
      }

      // 4.2. Apenas POST e permitido no endpoint MCP
      if (method !== 'POST') {
        return ResponseBuilder.badRequest(
          `Metodo ${method} nao permitido. Use POST para /mcp`,
          sessionId
        );
      }

      // 4.3. Validar que body e uma requisicao MCP valida
      if (!EventParser.isValidMCPRequest(parsedEvent)) {
        return ResponseBuilder.badRequest(
          'Body deve ser uma requisicao JSON-RPC 2.0 valida',
          sessionId
        );
      }

      // 5. Processar requisicao MCP
      return await this.handleMCPRequest(apiKey, body, sessionId);

    } catch (error) {
      // Erro de parse ou validacao
      if (error.message.includes('x-tiflux-api-key')) {
        return ResponseBuilder.unauthorized(error.message, sessionId);
      }

      console.error('[MCPHandler] Erro ao processar requisicao', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      return ResponseBuilder.internalError(
        'Erro ao processar requisicao',
        error,
        sessionId
      );
    }
  }

  /**
   * Processa requisicao MCP (tools/list ou tools/call)
   * @param {string} apiKey - API key do cliente
   * @param {Object} body - Body JSON-RPC
   * @param {string} sessionId - Session ID
   * @returns {Object} - Resposta HTTP Lambda
   */
  static async handleMCPRequest(apiKey, body, sessionId) {
    try {
      const { method, id } = body;

      console.log('[MCPHandler] Processando requisicao MCP', {
        sessionId,
        mcpMethod: method,
        mcpId: id,
        timestamp: new Date().toISOString()
      });

      // 1. Criar servidor MCP isolado para este request (stateless)
      const { server } = ServerFactory.createServer(apiKey, sessionId);

      // 2. Processar requisicao MCP
      let result;

      switch (method) {
        case 'tools/list':
          result = await this.handleToolsList(server);
          break;

        case 'tools/call':
          result = await this.handleToolsCall(server, body);
          break;

        case 'initialize':
          result = await this.handleInitialize(server);
          break;

        default:
          return ResponseBuilder.mcpError(
            `Metodo MCP desconhecido: ${method}`,
            -32601, // Method not found
            id,
            sessionId
          );
      }

      console.log('[MCPHandler] Requisicao MCP processada com sucesso', {
        sessionId,
        mcpMethod: method,
        mcpId: id,
        timestamp: new Date().toISOString()
      });

      // 3. Retornar resposta MCP
      return ResponseBuilder.mcpResponse(result, id, sessionId);

    } catch (error) {
      console.error('[MCPHandler] Erro ao processar requisicao MCP', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      return ResponseBuilder.mcpError(
        error.message,
        -32603, // Internal error
        body.id,
        sessionId
      );
    }
  }

  /**
   * Handler para tools/list
   * @param {Object} server - Instancia do servidor MCP
   * @returns {Object} - Lista de tools
   */
  static async handleToolsList(server) {
    // Disparar request tools/list no servidor MCP
    const request = {
      method: 'tools/list',
      params: {}
    };

    // Invocar handler do servidor
    const handlers = server._requestHandlers;
    const listHandler = handlers.get('tools/list');

    if (!listHandler) {
      throw new Error('Handler tools/list nao encontrado no servidor');
    }

    const result = await listHandler(request);
    return result;
  }

  /**
   * Handler para tools/call
   * @param {Object} server - Instancia do servidor MCP
   * @param {Object} body - Body JSON-RPC completo
   * @returns {Object} - Resultado da tool
   */
  static async handleToolsCall(server, body) {
    const { params } = body;

    if (!params || !params.name) {
      throw new Error('Parametro "name" obrigatorio para tools/call');
    }

    // Disparar request tools/call no servidor MCP
    const request = {
      method: 'tools/call',
      params: {
        name: params.name,
        arguments: params.arguments || {}
      }
    };

    // Invocar handler do servidor
    const handlers = server._requestHandlers;
    const callHandler = handlers.get('tools/call');

    if (!callHandler) {
      throw new Error('Handler tools/call nao encontrado no servidor');
    }

    const result = await callHandler(request);
    return result;
  }

  /**
   * Handler para initialize (handshake MCP)
   * @param {Object} server - Instancia do servidor MCP
   * @returns {Object} - Info de inicializacao
   */
  static async handleInitialize(server) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'tiflux-mcp-lambda',
        version: '2.0.0'
      }
    };
  }

  /**
   * Handler para /health
   * @returns {Object} - Resposta HTTP de health check
   */
  static handleHealth() {
    return ResponseBuilder.health();
  }
}

module.exports = MCPHandler;

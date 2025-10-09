/**
 * AWS Lambda Handler - Entry Point
 *
 * Handler principal para AWS Lambda Function URL.
 * Recebe eventos HTTP e delega para o MCPHandler.
 *
 * Formato do evento Lambda Function URL:
 * https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html
 *
 * Deploy:
 * - AWS Lambda Function (Node.js 18.x)
 * - Memory: 512MB
 * - Timeout: 30s
 * - Function URL habilitado
 */

const MCPHandler = require('./src/lambda/handler');

/**
 * Lambda handler para Function URL
 * @param {Object} event - Evento Lambda Function URL
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Resposta HTTP
 */
exports.handler = async (event, context) => {
  // Configurar timeout do Lambda context
  context.callbackWaitsForEmptyEventLoop = false;

  // Log inicial (CloudWatch)
  console.log('[Lambda] Requisicao recebida', {
    requestId: context.requestId,
    path: event.requestContext?.http?.path || event.path,
    method: event.requestContext?.http?.method || event.httpMethod,
    timestamp: new Date().toISOString()
  });

  try {
    // Delegar para MCPHandler
    const response = await MCPHandler.handle(event);

    console.log('[Lambda] Requisicao processada com sucesso', {
      requestId: context.requestId,
      statusCode: response.statusCode,
      timestamp: new Date().toISOString()
    });

    return response;

  } catch (error) {
    // Erro nao tratado (ultima barreira)
    console.error('[Lambda] Erro nao tratado', {
      requestId: context.requestId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Retornar erro 500 generico
    return {
      statusCode: 500,
      headers: {
        'content-type': 'application/json',
        'x-powered-by': 'TiFlux MCP Lambda'
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno do servidor',
          statusCode: 500
        }
      })
    };
  }
};

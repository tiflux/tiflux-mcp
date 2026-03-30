/**
 * OAuthHandler - Endpoints OAuth 2.0 para MCP Connector (Claude.ai)
 *
 * Implementa o fluxo OAuth necessario para que o Claude.ai se conecte
 * ao TiFlux MCP Server como conector remoto.
 *
 * Endpoints:
 * - GET  /.well-known/oauth-authorization-server  (metadata)
 * - POST /register                                 (Dynamic Client Registration)
 * - GET  /authorize                                (pagina de autorizacao)
 * - POST /authorize                                (submit da API key)
 * - POST /token                                    (troca code/refresh por tokens)
 */

const DynamoStore = require('./DynamoStore');
const crypto = require('./crypto');

const ISSUER = process.env.OAUTH_ISSUER || 'https://mcp.tiflux.com';

class OAuthHandler {
  /**
   * GET /.well-known/oauth-authorization-server
   * Retorna metadata do servidor OAuth (RFC 8414)
   */
  static metadata() {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        registration_endpoint: `${ISSUER}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256']
      })
    };
  }

  /**
   * POST /register - Dynamic Client Registration (RFC 7591)
   * Claude.ai se registra automaticamente como cliente OAuth.
   */
  static async register(body) {
    try {
      const clientId = crypto.generateClientId();
      const clientSecret = crypto.generateClientSecret();

      const clientName = body?.client_name || 'MCP Client';
      const redirectUris = body?.redirect_uris || [];

      await DynamoStore.saveClient({
        clientId,
        clientSecret,
        clientName,
        redirectUris
      });

      console.log('[OAuth] Cliente registrado', { clientId, clientName });

      return {
        statusCode: 201,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          client_name: clientName,
          redirect_uris: redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'client_secret_post'
        })
      };
    } catch (error) {
      console.error('[OAuth] Erro ao registrar cliente', { error: error.message });
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'server_error', error_description: 'Erro ao registrar cliente' })
      };
    }
  }

  /**
   * GET /authorize - Pagina HTML para o usuario informar a API key
   * Query params: client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type
   */
  static authorize(queryParams) {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = queryParams || {};

    if (!client_id || !redirect_uri || !state || !code_challenge) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'invalid_request', error_description: 'Parametros obrigatorios: client_id, redirect_uri, state, code_challenge' })
      };
    }

    const html = this._getAuthorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method: code_challenge_method || 'S256', response_type: response_type || 'code' });

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: html
    };
  }

  /**
   * POST /authorize - Recebe a API key do usuario e redireciona com code
   * Body (form-urlencoded): api_key, client_id, redirect_uri, state, code_challenge, code_challenge_method
   */
  static async authorizeSubmit(body) {
    try {
      const { api_key, client_id, redirect_uri, state, code_challenge, code_challenge_method } = body || {};

      if (!api_key || !client_id || !redirect_uri || !state || !code_challenge) {
        return this._authorizeError('Todos os campos sao obrigatorios');
      }

      // Verificar se o client existe
      const client = await DynamoStore.getClient(client_id);
      if (!client) {
        return this._authorizeError('Cliente nao encontrado. Tente novamente.');
      }

      // Gerar authorization code
      const code = crypto.generateAuthorizationCode();

      await DynamoStore.saveAuthorizationCode({
        code,
        clientId: client_id,
        apiKey: api_key,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method || 'S256',
        state,
        redirectUri: redirect_uri
      });

      console.log('[OAuth] Authorization code gerado', { clientId: client_id, codePrefix: code.substring(0, 8) });

      // Redirecionar de volta para o Claude.ai com code e state
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      redirectUrl.searchParams.set('state', state);

      return {
        statusCode: 302,
        headers: { 'location': redirectUrl.toString() },
        body: ''
      };
    } catch (error) {
      console.error('[OAuth] Erro no authorize submit', { error: error.message });
      return this._authorizeError('Erro interno. Tente novamente.');
    }
  }

  /**
   * POST /token - Troca authorization code ou refresh token por access token
   * Body: grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token
   */
  static async token(body) {
    try {
      const { grant_type } = body || {};

      if (grant_type === 'authorization_code') {
        return await this._handleAuthorizationCodeGrant(body);
      }

      if (grant_type === 'refresh_token') {
        return await this._handleRefreshTokenGrant(body);
      }

      return this._tokenError('unsupported_grant_type', `Grant type "${grant_type}" nao suportado`);
    } catch (error) {
      console.error('[OAuth] Erro no token endpoint', { error: error.message });
      return this._tokenError('server_error', 'Erro interno do servidor');
    }
  }

  // --- Private: Grant handlers ---

  static async _handleAuthorizationCodeGrant(body) {
    const { code, redirect_uri, client_id, client_secret, code_verifier } = body;

    if (!code || !client_id || !code_verifier) {
      return this._tokenError('invalid_request', 'Parametros obrigatorios: code, client_id, code_verifier');
    }

    // Validar client
    const client = await DynamoStore.getClient(client_id);
    if (!client || client.clientSecret !== client_secret) {
      return this._tokenError('invalid_client', 'Client ID ou secret invalido');
    }

    // Buscar authorization code
    const authCode = await DynamoStore.getAuthorizationCode(code);
    if (!authCode) {
      return this._tokenError('invalid_grant', 'Authorization code invalido ou expirado');
    }

    // Validar que o code pertence ao client
    if (authCode.clientId !== client_id) {
      return this._tokenError('invalid_grant', 'Authorization code nao pertence a este client');
    }

    // Validar redirect_uri
    if (redirect_uri && authCode.redirectUri !== redirect_uri) {
      return this._tokenError('invalid_grant', 'Redirect URI nao confere');
    }

    // Validar PKCE
    if (!crypto.validatePKCE(code_verifier, authCode.codeChallenge)) {
      return this._tokenError('invalid_grant', 'PKCE code_verifier invalido');
    }

    // Code valido -- consumir (single use)
    await DynamoStore.deleteAuthorizationCode(code);

    // Gerar tokens
    const accessToken = crypto.generateAccessToken();
    const refreshToken = crypto.generateRefreshToken();
    const expiresIn = 3600; // 1 hora

    await Promise.all([
      DynamoStore.saveAccessToken({
        accessToken,
        clientId: client_id,
        apiKey: authCode.apiKey,
        expiresInSeconds: expiresIn
      }),
      DynamoStore.saveRefreshToken({
        refreshToken,
        clientId: client_id,
        apiKey: authCode.apiKey
      })
    ]);

    console.log('[OAuth] Tokens gerados', { clientId: client_id, tokenPrefix: accessToken.substring(0, 8) });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refreshToken
      })
    };
  }

  static async _handleRefreshTokenGrant(body) {
    const { refresh_token, client_id, client_secret } = body;

    if (!refresh_token || !client_id) {
      return this._tokenError('invalid_request', 'Parametros obrigatorios: refresh_token, client_id');
    }

    // Validar client
    const client = await DynamoStore.getClient(client_id);
    if (!client || client.clientSecret !== client_secret) {
      return this._tokenError('invalid_client', 'Client ID ou secret invalido');
    }

    // Buscar refresh token
    const storedRefresh = await DynamoStore.getRefreshToken(refresh_token);
    if (!storedRefresh) {
      return this._tokenError('invalid_grant', 'Refresh token invalido ou expirado');
    }

    if (storedRefresh.clientId !== client_id) {
      return this._tokenError('invalid_grant', 'Refresh token nao pertence a este client');
    }

    // Gerar novo access token (manter mesmo refresh token)
    const accessToken = crypto.generateAccessToken();
    const expiresIn = 3600;

    await DynamoStore.saveAccessToken({
      accessToken,
      clientId: client_id,
      apiKey: storedRefresh.apiKey,
      expiresInSeconds: expiresIn
    });

    console.log('[OAuth] Access token renovado via refresh', { clientId: client_id });

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        refresh_token: refresh_token
      })
    };
  }

  // --- Private: Error helpers ---

  static _tokenError(error, description, statusCode = 400) {
    return {
      statusCode,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error, error_description: description })
    };
  }

  static _authorizeError(message) {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TiFlux - Erro</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
    .error { color: #e74c3c; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>TiFlux MCP</h2>
    <p class="error">${message}</p>
    <p>Feche esta janela e tente novamente.</p>
  </div>
</body>
</html>`;

    return {
      statusCode: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: html
    };
  }

  // --- Private: HTML page ---

  static _getAuthorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type }) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TiFlux - Autorizar Conexao</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0; background: #f0f2f5;
    }
    .card {
      background: white; padding: 2.5rem; border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 100%; max-width: 420px;
    }
    .logo { text-align: center; margin-bottom: 1.5rem; }
    .logo h1 { margin: 0; font-size: 1.8rem; color: #2d3748; }
    .logo p { color: #718096; margin: 0.5rem 0 0; font-size: 0.9rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; color: #2d3748; font-size: 0.9rem; }
    input[type="text"] {
      width: 100%; padding: 0.75rem 1rem; border: 2px solid #e2e8f0;
      border-radius: 8px; font-size: 1rem; transition: border-color 0.2s;
      outline: none;
    }
    input[type="text"]:focus { border-color: #38b2ac; }
    .help { font-size: 0.8rem; color: #a0aec0; margin: 0.5rem 0 1.5rem; }
    button {
      width: 100%; padding: 0.85rem; background: #38b2ac; color: white;
      border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
      cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: #319795; }
    button:disabled { background: #a0aec0; cursor: not-allowed; }
    .info {
      margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;
      font-size: 0.8rem; color: #a0aec0; text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>TiFlux</h1>
      <p>Conectar ao Claude</p>
    </div>
    <form method="POST" action="/authorize" id="authForm">
      <input type="hidden" name="client_id" value="${this._escapeHtml(client_id)}">
      <input type="hidden" name="redirect_uri" value="${this._escapeHtml(redirect_uri)}">
      <input type="hidden" name="state" value="${this._escapeHtml(state)}">
      <input type="hidden" name="code_challenge" value="${this._escapeHtml(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${this._escapeHtml(code_challenge_method)}">
      <input type="hidden" name="response_type" value="${this._escapeHtml(response_type)}">

      <label for="api_key">Chave de API do TiFlux</label>
      <input type="text" id="api_key" name="api_key" placeholder="Cole sua API key aqui" required autocomplete="off">
      <p class="help">Encontre sua API key em TiFlux > Configuracoes > Integracao > API</p>

      <button type="submit" id="submitBtn">Autorizar Conexao</button>
    </form>
    <div class="info">
      Sua API key sera usada para acessar seus dados do TiFlux via Claude.
    </div>
  </div>
  <script>
    document.getElementById('authForm').addEventListener('submit', function() {
      var btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Autorizando...';
    });
  </script>
</body>
</html>`;
  }

  static _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

module.exports = OAuthHandler;

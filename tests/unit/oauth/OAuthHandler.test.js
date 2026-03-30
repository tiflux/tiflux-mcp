// Mock DynamoStore ANTES do require (evitar resolucao do @aws-sdk)
jest.mock('../../../src/oauth/DynamoStore', () => ({
  saveClient: jest.fn(),
  getClient: jest.fn(),
  saveAuthorizationCode: jest.fn(),
  getAuthorizationCode: jest.fn(),
  deleteAuthorizationCode: jest.fn(),
  saveAccessToken: jest.fn(),
  saveRefreshToken: jest.fn(),
  getRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn()
}));

const DynamoStore = require('../../../src/oauth/DynamoStore');
const OAuthHandler = require('../../../src/oauth/OAuthHandler');

const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

beforeEach(() => {
  jest.clearAllMocks();

  // Setup DynamoStore mocks
  DynamoStore.saveClient.mockResolvedValue(undefined);
  DynamoStore.getClient.mockResolvedValue({
    clientId: 'cl_test123',
    clientSecret: 'cs_test456',
    clientName: 'Test Client',
    redirectUris: [REDIRECT_URI]
  });
  DynamoStore.saveAuthorizationCode.mockResolvedValue(undefined);
  DynamoStore.deleteAuthorizationCode.mockResolvedValue(undefined);
  DynamoStore.saveAccessToken.mockResolvedValue(undefined);
  DynamoStore.saveRefreshToken.mockResolvedValue(undefined);
  DynamoStore.deleteRefreshToken.mockResolvedValue(undefined);
});

describe('OAuthHandler', () => {
  describe('metadata', () => {
    it('deve retornar metadata do servidor OAuth', () => {
      const response = OAuthHandler.metadata();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.issuer).toBeDefined();
      expect(body.authorization_endpoint).toContain('/authorize');
      expect(body.token_endpoint).toContain('/token');
      expect(body.registration_endpoint).toContain('/register');
      expect(body.code_challenge_methods_supported).toContain('S256');
      expect(body.grant_types_supported).toContain('authorization_code');
      expect(body.grant_types_supported).toContain('refresh_token');
    });
  });

  describe('register', () => {
    it('deve registrar cliente e retornar client_id + client_secret', async () => {
      const response = await OAuthHandler.register({
        client_name: 'Claude',
        redirect_uris: [REDIRECT_URI]
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.client_id).toMatch(/^cl_/);
      expect(body.client_secret).toMatch(/^cs_/);
      expect(body.client_name).toBe('Claude');
      expect(DynamoStore.saveClient).toHaveBeenCalledTimes(1);
    });

    it('deve usar nome padrao se nao informado', async () => {
      const response = await OAuthHandler.register({});

      const body = JSON.parse(response.body);
      expect(body.client_name).toBe('MCP Client');
    });
  });

  describe('authorize (GET)', () => {
    it('deve retornar HTML com formulario', () => {
      const response = OAuthHandler.authorize({
        client_id: 'cl_test123',
        redirect_uri: REDIRECT_URI,
        state: 'abc123',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        response_type: 'code'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('TiFlux');
      expect(response.body).toContain('api_key');
      expect(response.body).toContain('cl_test123');
    });

    it('deve retornar 400 se parametros obrigatorios faltando', () => {
      const response = OAuthHandler.authorize({});

      expect(response.statusCode).toBe(400);
    });
  });

  describe('authorizeSubmit (POST)', () => {
    it('deve gerar code e redirecionar', async () => {
      const response = await OAuthHandler.authorizeSubmit({
        api_key: 'test-api-key',
        client_id: 'cl_test123',
        redirect_uri: REDIRECT_URI,
        state: 'abc123',
        code_challenge: 'challenge',
        code_challenge_method: 'S256'
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('code=ac_');
      expect(response.headers.location).toContain('state=abc123');
      expect(DynamoStore.saveAuthorizationCode).toHaveBeenCalledTimes(1);
    });

    it('deve retornar erro se campos obrigatorios faltando', async () => {
      const response = await OAuthHandler.authorizeSubmit({});

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('deve retornar erro se client nao existir', async () => {
      DynamoStore.getClient.mockResolvedValue(null);

      const response = await OAuthHandler.authorizeSubmit({
        api_key: 'test-api-key',
        client_id: 'cl_invalid',
        redirect_uri: REDIRECT_URI,
        state: 'abc123',
        code_challenge: 'challenge'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('token (authorization_code)', () => {
    it('deve trocar code por access_token e refresh_token', async () => {
      // Gerar PKCE valido
      const nodeCrypto = require('crypto');
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = nodeCrypto.createHash('sha256').update(codeVerifier).digest('base64url');

      DynamoStore.getAuthorizationCode.mockResolvedValue({
        code: 'ac_testcode',
        clientId: 'cl_test123',
        apiKey: 'test-api-key',
        codeChallenge: codeChallenge,
        codeChallengeMethod: 'S256',
        state: 'test-state',
        redirectUri: REDIRECT_URI,
        expiresAt: new Date(Date.now() + 600000).toISOString()
      });

      const response = await OAuthHandler.token({
        grant_type: 'authorization_code',
        code: 'ac_testcode',
        client_id: 'cl_test123',
        client_secret: 'cs_test456',
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.access_token).toMatch(/^at_/);
      expect(body.refresh_token).toMatch(/^rt_/);
      expect(body.token_type).toBe('Bearer');
      expect(body.expires_in).toBe(3600);
      expect(DynamoStore.deleteAuthorizationCode).toHaveBeenCalledWith('ac_testcode');
      expect(DynamoStore.saveAccessToken).toHaveBeenCalledTimes(1);
      expect(DynamoStore.saveRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('deve rejeitar grant_type invalido', async () => {
      const response = await OAuthHandler.token({
        grant_type: 'password'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('unsupported_grant_type');
    });

    it('deve rejeitar PKCE invalido', async () => {
      DynamoStore.getAuthorizationCode.mockResolvedValue({
        code: 'ac_testcode',
        clientId: 'cl_test123',
        apiKey: 'test-api-key',
        codeChallenge: 'wrong-challenge',
        redirectUri: REDIRECT_URI,
        expiresAt: new Date(Date.now() + 600000).toISOString()
      });

      const response = await OAuthHandler.token({
        grant_type: 'authorization_code',
        code: 'ac_testcode',
        client_id: 'cl_test123',
        client_secret: 'cs_test456',
        code_verifier: 'wrong-verifier',
        redirect_uri: REDIRECT_URI
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('invalid_grant');
    });
  });

  describe('token (refresh_token)', () => {
    it('deve renovar access_token com refresh_token', async () => {
      DynamoStore.getRefreshToken.mockResolvedValue({
        refreshToken: 'rt_testrefresh',
        clientId: 'cl_test123',
        apiKey: 'test-api-key',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });

      const response = await OAuthHandler.token({
        grant_type: 'refresh_token',
        refresh_token: 'rt_testrefresh',
        client_id: 'cl_test123',
        client_secret: 'cs_test456'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.access_token).toMatch(/^at_/);
      expect(body.refresh_token).toBe('rt_testrefresh');
      expect(body.token_type).toBe('Bearer');
    });

    it('deve rejeitar refresh_token invalido', async () => {
      DynamoStore.getRefreshToken.mockResolvedValue(null);

      const response = await OAuthHandler.token({
        grant_type: 'refresh_token',
        refresh_token: 'rt_invalid',
        client_id: 'cl_test123',
        client_secret: 'cs_test456'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('invalid_grant');
    });
  });
});

/**
 * Testes unitários para FeatureFlagChecker
 * Valida cache in-memory, TTL, e cenários de erro
 */

const FeatureFlagChecker = require('../../../src/lambda/FeatureFlagChecker');
const TiFluxAPI = require('../../../src/api/tiflux-api');

jest.mock('../../../src/api/tiflux-api');

describe('FeatureFlagChecker', () => {
  const apiKey = 'test-api-key-12345';

  beforeEach(() => {
    FeatureFlagChecker.clearCache();
    jest.clearAllMocks();
  });

  describe('checkEnableMcp', () => {
    it('retorna enabled true quando enable_mcp é true', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: { id: 1, enable_mcp: true }
        })
      }));

      const result = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result.enabled).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('retorna enabled false quando enable_mcp é false', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: { id: 1, enable_mcp: false }
        })
      }));

      const result = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('MCP não habilitado para este usuário');
    });

    it('retorna enabled false quando response tem erro', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          error: 'Token de API inválido ou expirado',
          status: 401
        })
      }));

      const result = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Erro ao verificar permissão de acesso ao MCP');
    });

    it('retorna enabled false quando fetchCurrentUser lança exceção', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockRejectedValue(new Error('Network error'))
      }));

      const result = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Erro interno ao verificar permissão de acesso ao MCP');
    });

    it('retorna enabled false quando response.data é null', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: null
        })
      }));

      const result = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result.enabled).toBe(false);
    });
  });

  describe('cache in-memory', () => {
    it('usa cache no segundo call com mesma apiKey', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        data: { id: 1, enable_mcp: true }
      });
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: mockFetch
      }));

      await FeatureFlagChecker.checkEnableMcp(apiKey);
      await FeatureFlagChecker.checkEnableMcp(apiKey);

      // TiFluxAPI instanciado apenas 1 vez (segundo call usou cache)
      expect(TiFluxAPI).toHaveBeenCalledTimes(1);
    });

    it('não compartilha cache entre apiKeys diferentes', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        data: { id: 1, enable_mcp: true }
      });
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: mockFetch
      }));

      await FeatureFlagChecker.checkEnableMcp('key-a');
      await FeatureFlagChecker.checkEnableMcp('key-b');

      expect(TiFluxAPI).toHaveBeenCalledTimes(2);
    });

    it('refaz HTTP call após TTL expirar', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        data: { id: 1, enable_mcp: true }
      });
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: mockFetch
      }));

      await FeatureFlagChecker.checkEnableMcp(apiKey);

      // Simula passagem de tempo além do TTL (60s)
      const cachedEntry = FeatureFlagChecker._getCacheEntry(apiKey);
      if (cachedEntry) {
        cachedEntry.timestamp = Date.now() - 61_000;
      }

      await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(TiFluxAPI).toHaveBeenCalledTimes(2);
    });

    it('NAO cacheia resultado de erro transiente (permite retry)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        error: 'timeout',
        status: 500
      });
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: mockFetch
      }));

      const result1 = await FeatureFlagChecker.checkEnableMcp(apiKey);
      const result2 = await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(result1.enabled).toBe(false);
      expect(result2.enabled).toBe(false);
      // Erro NAO é cacheado — 2 HTTP calls (retry imediato)
      expect(TiFluxAPI).toHaveBeenCalledTimes(2);
    });

    it('cacheia resultado de enable_mcp false (negativa explicita)', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: { id: 1, enable_mcp: false }
        })
      }));

      await FeatureFlagChecker.checkEnableMcp(apiKey);
      await FeatureFlagChecker.checkEnableMcp(apiKey);

      // Negativa explicita é cacheada — só 1 HTTP call
      expect(TiFluxAPI).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    it('limpa cache de uma apiKey específica', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: { id: 1, enable_mcp: true }
        })
      }));

      await FeatureFlagChecker.checkEnableMcp(apiKey);
      FeatureFlagChecker.clearCache(apiKey);
      await FeatureFlagChecker.checkEnableMcp(apiKey);

      expect(TiFluxAPI).toHaveBeenCalledTimes(2);
    });

    it('limpa todo o cache quando chamado sem argumento', async () => {
      TiFluxAPI.mockImplementation(() => ({
        fetchCurrentUser: jest.fn().mockResolvedValue({
          data: { id: 1, enable_mcp: true }
        })
      }));

      await FeatureFlagChecker.checkEnableMcp('key-a');
      await FeatureFlagChecker.checkEnableMcp('key-b');
      FeatureFlagChecker.clearCache();
      await FeatureFlagChecker.checkEnableMcp('key-a');
      await FeatureFlagChecker.checkEnableMcp('key-b');

      expect(TiFluxAPI).toHaveBeenCalledTimes(4);
    });
  });
});

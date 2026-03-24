/**
 * FeatureFlagChecker - Verifica feature flags via GET /users/me
 *
 * A feature flag `enable_mcp` é verificada no Rails via OrganizationPreference:
 *   key: "enable_mcp", value: "<user_id>", organization_id: <id_da_org>
 *
 * O endpoint GET /users/me retorna { enable_mcp: true|false } resolvido pelo
 * current_user do Devise, sem necessidade de lógica adicional no MCP.
 *
 * Cache in-memory: Evita HTTP call redundante ao Rails em warm starts do Lambda.
 * TTL de 60 segundos garante que revogação de acesso reflete rapidamente.
 */

const TiFluxAPI = require('../api/tiflux-api');

const CACHE_TTL_MS = 60_000;
const flagCache = new Map();

class FeatureFlagChecker {
  /**
   * Verifica se a feature flag `enable_mcp` está habilitada para o usuário
   * autenticado pela API key informada.
   *
   * Usa cache in-memory com TTL de 60s para evitar HTTP call em cada request.
   * Em cold starts o cache está vazio e o HTTP call acontece normalmente.
   *
   * @param {string} apiKey - API key do cliente TiFlux
   * @returns {Promise<{ enabled: boolean, reason: string|null }>}
   */
  static async checkEnableMcp(apiKey) {
    const cached = flagCache.get(apiKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.result;
    }

    const result = await this._fetchEnableMcp(apiKey);

    flagCache.set(apiKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * Faz o HTTP call real ao Rails para verificar a feature flag.
   * @param {string} apiKey
   * @returns {Promise<{ enabled: boolean, reason: string|null }>}
   * @private
   */
  static async _fetchEnableMcp(apiKey) {
    try {
      const api = new TiFluxAPI(apiKey);
      const response = await api.fetchCurrentUser();

      if (response.error) {
        console.warn('[FeatureFlagChecker] Erro ao consultar usuário atual', {
          error: response.error,
          status: response.status
        });
        return { enabled: false, reason: 'Erro ao verificar permissão de acesso ao MCP' };
      }

      if (!response.data?.enable_mcp) {
        return { enabled: false, reason: 'MCP não habilitado para este usuário' };
      }

      return { enabled: true, reason: null };

    } catch (error) {
      console.error('[FeatureFlagChecker] Exceção ao verificar enable_mcp', {
        error: error.message
      });
      return { enabled: false, reason: 'Erro interno ao verificar permissão de acesso ao MCP' };
    }
  }

  /**
   * Limpa o cache de uma apiKey específica ou todo o cache.
   * Útil para testes ou para forçar re-verificação.
   * @param {string|null} apiKey - Se null, limpa todo o cache
   */
  static clearCache(apiKey = null) {
    if (apiKey) {
      flagCache.delete(apiKey);
    } else {
      flagCache.clear();
    }
  }

  /**
   * Retorna entrada do cache para uma apiKey (usado em testes).
   * @param {string} apiKey
   * @returns {{ result: Object, timestamp: number }|undefined}
   */
  static _getCacheEntry(apiKey) {
    return flagCache.get(apiKey);
  }
}

module.exports = FeatureFlagChecker;

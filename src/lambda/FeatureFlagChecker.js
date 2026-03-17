/**
 * FeatureFlagChecker - Verifica feature flags via GET /users/me
 *
 * A feature flag `enable_mcp` é verificada no Rails via OrganizationPreference:
 *   key: "enable_mcp", value: "<user_id>", organization_id: <id_da_org>
 *
 * O endpoint GET /users/me retorna { enable_mcp: true|false } resolvido pelo
 * current_user do Devise, sem necessidade de lógica adicional no MCP.
 */

const TiFluxAPI = require('../api/tiflux-api');

class FeatureFlagChecker {
  /**
   * Verifica se a feature flag `enable_mcp` está habilitada para o usuário
   * autenticado pela API key informada.
   *
   * @param {string} apiKey - API key do cliente TiFlux
   * @returns {Promise<{ enabled: boolean, reason: string|null }>}
   */
  static async checkEnableMcp(apiKey) {
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
}

module.exports = FeatureFlagChecker;

/**
 * ClientFingerprint — telemetria minima via User-Agent
 *
 * Injeta metadados tecnicos em toda requisicao para a API v2 do TiFlux.
 * Sem dependencias externas. Cacheia o resultado na primeira chamada
 * (mode + versao + Node nao mudam durante o processo).
 *
 * Privacidade por modo:
 * - server (Lambda da TiFlux, infra propria): UA inclui a versao do Node
 *   para diagnostico de runtime.
 * - sdk (roda na maquina do cliente): UA leva APENAS a versao do pacote.
 *   Nao coletamos detalhe do ambiente local do cliente (ex: versao do Node).
 */

'use strict';

let _cachedUserAgent = null;

/**
 * Detecta o modo de execucao: 'server' (Lambda) ou 'sdk' (local/stdio).
 * @returns {'server'|'sdk'}
 */
function detectMode() {
  return process.env.AWS_LAMBDA_FUNCTION_NAME ? 'server' : 'sdk';
}

/**
 * Monta a string User-Agent. O formato depende do modo:
 *   server: TiFlux-MCP-server/<pkg-version> (node/<node-version>)
 *   sdk:    TiFlux-MCP-sdk/<pkg-version>
 *
 * No modo sdk a versao do Node e omitida de proposito — o processo roda na
 * maquina do cliente e nao coletamos detalhe do ambiente local dele.
 *
 * Leitura de package.json feita via require() — resolvido em runtime
 * relativo a este arquivo (../../package.json).
 *
 * @returns {string}
 */
function userAgent() {
  if (_cachedUserAgent) return _cachedUserAgent;

  const pkg = require('../../package.json');
  const mode = detectMode();
  const pkgVersion = pkg.version || 'unknown';

  _cachedUserAgent = mode === 'server'
    ? `TiFlux-MCP-server/${pkgVersion} (node/${process.version})`
    : `TiFlux-MCP-sdk/${pkgVersion}`;
  return _cachedUserAgent;
}

/**
 * Limpa o cache (util apenas em testes que precisam simular mudanca de mode).
 */
function _resetCache() {
  _cachedUserAgent = null;
}

module.exports = { detectMode, userAgent, _resetCache };

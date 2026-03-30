/**
 * OAuth Crypto Utilities
 *
 * Geracao de tokens, client IDs, authorization codes e validacao PKCE.
 * Usa apenas crypto nativo do Node.js (sem dependencias externas).
 */

const crypto = require('crypto');

/**
 * Gera um client_id unico
 * @returns {string}
 */
function generateClientId() {
  return `cl_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Gera um client_secret
 * @returns {string}
 */
function generateClientSecret() {
  return `cs_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Gera um authorization code
 * @returns {string}
 */
function generateAuthorizationCode() {
  return `ac_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Gera um access token
 * @returns {string}
 */
function generateAccessToken() {
  return `at_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Gera um refresh token
 * @returns {string}
 */
function generateRefreshToken() {
  return `rt_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Valida PKCE code_verifier contra code_challenge (S256)
 * @param {string} codeVerifier - O code_verifier enviado pelo cliente
 * @param {string} codeChallenge - O code_challenge salvo durante /authorize
 * @returns {boolean}
 */
function validatePKCE(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) {
    return false;
  }

  const hash = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return hash === codeChallenge;
}

module.exports = {
  generateClientId,
  generateClientSecret,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  validatePKCE
};

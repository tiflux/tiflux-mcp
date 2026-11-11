/**
 * requestorCountry.js — guarda local de `country` compartilhada entre
 * create_requestor e update_requestor. NAO e um slice (o agregador lista os
 * slices explicitamente).
 *
 * A API so usa o pais para validar/normalizar o telefone (nao grava o campo) e
 * so quando `telephone` vem junto — `country` sozinho seria aceito e ignorado em
 * silencio. Por isso recusamos localmente `country` sem `telephone` e valores
 * fora do ISO 3166-1 alfa-2.
 */

const { errorResponse } = require('../_shared/errors');

// ISO 3166-1 alfa-2 (ex.: BR, US) — o país do telefone.
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

/**
 * @param {object} args - argumentos da tool
 * @returns {object|null} resposta MCP de erro, ou null se `country` esta ok/ausente
 */
function countryError(args) {
  if (args.country === undefined) return null;
  if (args.telephone === undefined || args.telephone === null || args.telephone === '') {
    return errorResponse(
      `**⚠️ \`country\` exige \`telephone\`**\n\n` +
      `\`country\` é o país do telefone e só vale junto com \`telephone\` — sozinho, a API ignora o campo.\n\n` +
      `*Envie o telefone junto (ex.: telephone "+1 202 555 0101", country "US").*`
    );
  }
  if (typeof args.country !== 'string' || !COUNTRY_PATTERN.test(args.country.trim().toUpperCase())) {
    return errorResponse(
      `**⚠️ \`country\` inválido**\n\n` +
      `Recebido: ${JSON.stringify(args.country)}. Use o código ISO de 2 letras do país do telefone (ex.: BR, US, PT).`
    );
  }
  return null;
}

/** Normaliza um `country` ja validado ("us " → "US"). */
function normalizeCountry(country) {
  return country.trim().toUpperCase();
}

module.exports = { countryError, normalizeCountry };

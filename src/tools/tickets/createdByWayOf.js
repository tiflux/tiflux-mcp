/**
 * Mapa de origens de ticket (created_by_way_of).
 *
 * A API v2 aceita inteiros (0..12) no FILTRO de `GET /tickets` para identificar
 * como o ticket foi criado. Este modulo centraliza:
 *   - CREATED_BY_WAY_OF_MAP: slug legivel (string) → numero da API
 *
 * Atencao a assimetria request/response: o filtro e numerico, mas o RESPONSE
 * devolve `created_by_way_of` como string ja legivel ("Tiflux Web", "Tiflux API",
 * "Whatsapp", "Email" — confirmado em payload real de producao em 2026-08-28).
 * Por isso nao existe aqui um mapa numero→label: `getTicket.js` exibe a string
 * da API direto, sem conversao.
 *
 * Decisao D3 da spec: o schema do MCP aceita slugs legiveis (ex: 'ai_agent',
 * 'ticket_group') em vez do numero cru, porque um numero errado filtra a
 * origem errada silenciosamente (API responde 200 com lista incorreta, sem erro).
 *
 * Consumidor: listTickets.js (schema + conversao slug→numero).
 *
 * Regra de promover a _shared: exige >=3 consumidores. Aqui e 1 (em tickets/),
 * por isso este arquivo fica como modulo-local.
 */

const CREATED_BY_WAY_OF_MAP = {
  web: 0,
  agent: 1,
  chat_widget: 2,
  whatsapp: 3,
  email: 4,
  external_form: 5,
  mobile: 6,
  api: 7,
  chat: 8,
  recurrent_activity: 9,
  trigger: 10,
  ticket_group: 11,
  ai_agent: 12
};

/**
 * Converte um slug legivel para o numero da API.
 * Retorna null se o slug nao estiver no mapa.
 *
 * @param {string} slug - ex: 'ai_agent', 'web'
 * @returns {number|null}
 */
function slugToNumber(slug) {
  if (slug === undefined || slug === null) return null;
  const num = CREATED_BY_WAY_OF_MAP[String(slug)];
  return num !== undefined ? num : null;
}

/**
 * Retorna a lista de slugs validos para uso no schema MCP.
 *
 * @returns {string[]}
 */
function validSlugs() {
  return Object.keys(CREATED_BY_WAY_OF_MAP);
}

module.exports = { CREATED_BY_WAY_OF_MAP, slugToNumber, validSlugs };

/**
 * fuzzyMatch.js — Utilitario puro de matching por nome (entity-agnostic).
 *
 * Exporta:
 *   normalizeText(text)            — trim + lowercase + accent-stripping
 *   tokenize(text)                 — split por delimitadores, remove tokens vazios
 *   calculateMatchScore(searchTerm, candidateName) — retorna 0-100
 *   fuzzyMatchItems(searchTerm, items, nameExtractor) — retorna { matches, bestMatch }
 *
 * Zero dependencias externas. Pode ser reutilizado para qualquer entidade.
 */

/**
 * Normaliza texto: trim + lowercase + remove acentos.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Tokeniza texto por espaco, hifen, underscore e barra.
 * Remove tokens vazios resultantes.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split(/[\s\-_/]+/).filter(t => t.length > 0);
}

/**
 * Calcula o score de matching entre o termo de busca e um nome candidato.
 *
 * Tabela de scores:
 *   100 — match exato (normalizado)
 *    95 — termo multi-palavra: todos os tokens do termo casam exatamente com tokens do nome
 *    90 — nome comeca com o termo
 *    80 — algum token do nome e exatamente igual ao termo
 *    75 — termo multi-palavra: todos os tokens do termo sao prefixo de algum token do nome
 *    70 — algum token do nome comeca com o termo
 *    60 — o nome contem o termo como substring
 *    50 — algum token do nome contem o termo como substring
 *     0 — sem match
 *
 * Termos multi-palavra (ex.: "dev experimentos") sao casados por conjunto de
 * tokens — caso contrario um termo com separador diferente do nome (espaco vs
 * hifen) nunca casaria como substring (ex.: "dev experimentos" vs "DEV - Experimentos").
 *
 * @param {string} searchTerm
 * @param {string} candidateName
 * @returns {number} 0-100
 */
function calculateMatchScore(searchTerm, candidateName) {
  if (!searchTerm || !candidateName) return 0;

  const normTerm = normalizeText(searchTerm);
  const normName = normalizeText(candidateName);

  if (!normTerm || !normName) return 0;

  // 100 — match exato
  if (normName === normTerm) return 100;

  // 90 — nome comeca com o termo
  if (normName.startsWith(normTerm)) return 90;

  const tokens = tokenize(normName);
  const termTokens = tokenize(normTerm);

  // --- termo multi-palavra (ex.: "dev experimentos" vs "DEV - Experimentos") ---
  // Casa por conjunto de tokens (ordem-independente), pois separadores diferentes
  // (espaco vs hifen) impedem o match por substring acima.
  if (termTokens.length > 1) {
    // 95 — todos os tokens do termo casam exatamente com tokens do nome
    if (termTokens.every(tt => tokens.includes(tt))) return 95;
    // 75 — todos os tokens do termo sao prefixo de algum token do nome
    if (termTokens.every(tt => tokens.some(nt => nt.startsWith(tt)))) return 75;
    // senao, cai nos checks de substring abaixo
  }

  // 80 — algum token e exatamente igual
  if (tokens.some(t => t === normTerm)) return 80;

  // 70 — algum token comeca com o termo
  if (tokens.some(t => t.startsWith(normTerm))) return 70;

  // 60 — substring no nome completo
  if (normName.includes(normTerm)) return 60;

  // 50 — substring em algum token
  if (tokens.some(t => t.includes(normTerm))) return 50;

  return 0;
}

/**
 * Faz fuzzy matching do searchTerm contra uma lista de items.
 *
 * @param {string} searchTerm — termo a buscar
 * @param {Array}  items — lista de objetos qualquer
 * @param {Function} nameExtractor — (item) => string  — extrai o texto para comparar
 * @returns {{ matches: Array<{item, score}>, bestMatch: object|null }}
 *   matches: todos os items com score > 0, ordenados por score desc
 *   bestMatch: item com maior score (ou null se nenhum)
 */
function fuzzyMatchItems(searchTerm, items, nameExtractor) {
  if (!searchTerm || !items || !Array.isArray(items) || items.length === 0) {
    return { matches: [], bestMatch: null };
  }

  const scored = [];
  for (const item of items) {
    const name = nameExtractor ? nameExtractor(item) : String(item);
    const score = calculateMatchScore(searchTerm, name);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    matches: scored,
    bestMatch: scored.length > 0 ? scored[0].item : null
  };
}

module.exports = { normalizeText, tokenize, calculateMatchScore, fuzzyMatchItems };

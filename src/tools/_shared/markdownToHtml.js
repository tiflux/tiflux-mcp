/**
 * Helper compartilhado: markdownToHtml
 *
 * Converte Markdown para HTML usando a biblioteca `marked`.
 * Idempotente: se a entrada já contém tags HTML reconhecíveis,
 * retorna sem alteração.
 *
 * @param {string|null|undefined} input
 * @returns {string}
 */

const { marked } = require('marked');

// Tags HTML que indicam que o conteúdo já está em HTML.
// Inclui tags de layout rico (tabelas, blockquote, span, img, figure) que a API
// v2 pode devolver em campos de descrição — assim um round-trip
// get_ticket → update_ticket não reprocessa HTML já formatado (idempotência).
const HTML_TAG_PATTERN = /<(p|div|br|strong|h[1-6]|ul|ol|li|code|pre|a|em|b|i|table|thead|tbody|tfoot|tr|td|th|span|img|figure|figcaption|blockquote|hr|sub|sup|mark|s|u|small)[\s/>]/i;

// Quebra de linha única dentro de parágrafo vira <br> (breaks: true). A API v2
// armazena/exibe os campos como HTML e não preserva \n de texto puro; sem isso,
// "linha 1\nlinha 2" colapsaria numa linha só na UI/portal.
const MARKED_OPTIONS = { breaks: true };

/**
 * Converte Markdown para HTML.
 * - Input vazio/null/undefined → retorna ""
 * - Input que já contém tags HTML → retorna sem alteração (idempotência)
 * - Input em Markdown puro → converte com `marked`
 *
 * NOTA DE SEGURANÇA: este helper NÃO sanitiza o HTML gerado (ver threat model
 * documentado na spec 2026-05-28-markdown-to-html-text-fields). O conteúdo é
 * enviado a um sistema autenticado (TiFlux), que é responsável por sanitizar
 * no render (DOMPurify/CSP). Não confie nesta função para neutralizar XSS.
 *
 * @param {string|null|undefined} input
 * @returns {string}
 */
function markdownToHtml(input) {
  if (input == null || input === '') {
    return '';
  }

  const str = String(input);

  // Idempotência: se já contém HTML, retorna sem converter
  if (HTML_TAG_PATTERN.test(str)) {
    return str;
  }

  // Converte Markdown → HTML com marked (síncrono por padrão em v4)
  return marked.parse(str, MARKED_OPTIONS);
}

module.exports = { markdownToHtml };

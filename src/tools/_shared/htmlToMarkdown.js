/**
 * Helper compartilhado: htmlToMarkdown
 *
 * Converte HTML para Markdown usando a biblioteca `turndown` (com plugin GFM
 * para suporte a tabelas). Idempotente: se a entrada nao contiver tags HTML
 * reconheciveis, retorna sem alteracao (passthrough).
 *
 * @param {string|null|undefined} input
 * @returns {string}
 */

const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

// Tags HTML que indicam que o conteudo e HTML (espelho do HTML_TAG_PATTERN de markdownToHtml.js).
// Se a entrada nao bater nesse padrao, e devolvida sem conversao (idempotencia).
const HTML_TAG_PATTERN = /<(p|div|br|strong|h[1-6]|ul|ol|li|code|pre|a|em|b|i|table|thead|tbody|tfoot|tr|td|th|span|img|figure|figcaption|blockquote|hr|sub|sup|mark|s|u|small)[\s/>]/i;

// Esquemas de URI que executam codigo quando o Markdown gerado e renderizado
// como HTML clicavel pelo cliente MCP. O turndown ja descarta atributos de
// evento (onerror/onclick) e o conteudo de <script>, mas preserva href/src crus:
// `<a href="javascript:alert(1)">x</a>` viraria `[x](javascript:alert(1))`.
// `data:` entra na lista para <a> (um `data:text/html;base64,...` clicado navega
// para HTML atacante), mas NAO para <img> — base64 inline e uso legitimo comum
// de editores HTML e a imagem em si e inerte.
const SCRIPT_SCHEME = /^(javascript|vbscript):/i;
const LINK_SCHEME_BLOCKLIST = /^(javascript|vbscript|data):/i;

/**
 * Testa o esquema da URI ignorando ruido que o browser tambem ignora
 * (espacos e caracteres de controle dentro do esquema: `java\tscript:` executa).
 */
function schemeMatches(url, pattern) {
  if (!url) return false;
  // eslint-disable-next-line no-control-regex
  return pattern.test(String(url).replace(/[\u0000-\u0020]/g, ''));
}

// Instancia reutilizavel (sem estado mutavel por chamada).
const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
});
td.use(gfm);

// Regras adicionadas DEPOIS do gfm tem precedencia sobre as built-in de <a>/<img>.
// Link perigoso: preserva o texto visivel, descarta a URL.
td.addRule('unsafeLink', {
  filter: node => node.nodeName === 'A' && schemeMatches(node.getAttribute('href'), LINK_SCHEME_BLOCKLIST),
  replacement: content => content
});

// Imagem com esquema executavel: sobra so o alt (nenhuma URL).
td.addRule('unsafeImage', {
  filter: node => node.nodeName === 'IMG' && schemeMatches(node.getAttribute('src'), SCRIPT_SCHEME),
  replacement: (_content, node) => node.getAttribute('alt') || ''
});

/**
 * Converte HTML para Markdown.
 * - Input vazio/null/undefined → retorna ""
 * - Input sem tags HTML reconheciveis → retorna sem alteracao (idempotencia)
 * - Input com HTML → converte para Markdown com turndown + GFM (tabelas)
 *
 * NOTA DE SEGURANCA: este helper NAO e um sanitizador de HTML de proposito geral
 * — a responsabilidade final de sanitizacao e do renderizador do cliente MCP.
 * Ele faz apenas defense-in-depth sobre o vetor que sobrevive a conversao:
 * links/imagens com esquema executavel (`javascript:`, `vbscript:` e, em <a>,
 * `data:`) perdem a URL e sobra so o texto/alt. O restante (tags <script>,
 * atributos de evento) ja e descartado pelo turndown.
 *
 * @param {string|null|undefined} input
 * @returns {string}
 */
function htmlToMarkdown(input) {
  if (input == null || input === '') {
    return '';
  }

  const str = String(input);

  // Idempotencia: se nao contiver tags HTML, retorna sem converter
  if (!HTML_TAG_PATTERN.test(str)) {
    return str;
  }

  return td.turndown(str);
}

module.exports = { htmlToMarkdown };

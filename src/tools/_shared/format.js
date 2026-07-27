/**
 * format.js — Helpers de verbosidade para slices MCP.
 *
 * Duas modos de exibicao:
 *   - 'rich'    (default): saida atual, com emoji, rodape e paginacao verbosa.
 *   - 'compact': rodape omitido, paginacao em 1 linha, texto sem emoji.
 *
 * Uso basico:
 *   const { footer, pagination, truncate } = require('../_shared/format');
 *   // No fim de um formatter:
 *   return `${body}\n${footer(v)}`;
 *
 * O ctx de verbosidade e injetado pelo agregador (index.js de cada entidade).
 * Quando ausente (testes legados que injetam so { api }), o default 'rich'
 * preserva retrocompatibilidade byte-a-byte.
 */

const { stripHtml } = require('./markdown');

/**
 * Rodape informativo.
 * - rich:    `*✅ Dados obtidos da API TiFlux em tempo real*`
 * - compact: '' (vazio — zero tokens)
 *
 * @param {string} [v='rich'] - Modo de verbosidade
 * @returns {string}
 */
function footer(v) {
  if (v === 'compact') return '';
  return '*✅ Dados obtidos da API TiFlux em tempo real*';
}

/**
 * Bloco de paginacao.
 *
 * - rich: bloco multilinha atual (4-5 linhas com emojis).
 * - compact: linha unica `[Pág N · K por pág · X nesta pág{· → offset N+1}]`.
 *
 * @param {object} opts
 * @param {number} opts.offset  - Pagina atual (comeca em 1)
 * @param {number} opts.limit   - Itens por pagina
 * @param {number} opts.count   - Itens retornados nesta pagina
 * @param {number} [opts.total] - Total de itens (opcional; quando disponivel, exibido)
 * @param {string} [opts.unit]  - Palavra para o item (ex: 'tickets', 'chats'). Default 'itens'.
 * @param {string} [v='rich']   - Modo de verbosidade
 * @returns {string}
 */
function pagination({ offset, limit, count, total, unit = 'itens' }, v) {
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.max(1, Number.parseInt(limit) || 20);
  const hasMore = count === currentLimit;

  if (v === 'compact') {
    let line = `[Pág ${currentOffset} · ${currentLimit}/${unit} · ${count} nesta pág`;
    if (total !== undefined && total !== null) {
      line += ` · total: ${total}`;
    }
    if (hasMore) {
      line += ` · → offset: ${currentOffset + 1} p/ mais`;
    }
    line += ']';
    return line;
  }

  // rich
  let text = `\n**📊 Paginação:**\n`;
  text += `• Página atual: ${currentOffset}\n`;
  text += `• ${unit.charAt(0).toUpperCase() + unit.slice(1)} por página: ${currentLimit}\n`;
  if (total !== undefined && total !== null) {
    text += `• Total: ${total}\n`;
  }
  text += `• ${unit.charAt(0).toUpperCase() + unit.slice(1)} nesta página: ${count}\n`;

  if (hasMore) {
    text += `• Próxima página: Use \`offset: ${currentOffset + 1}\` para ver mais ${unit}\n`;
  } else {
    text += `• Esta é a última página disponível\n`;
  }

  return text;
}

/**
 * Trunca um texto para `max` caracteres, adicionando '...' se cortado.
 * Tambem aplica stripHtml quando o conteudo parece ter tags HTML.
 *
 * @param {string|null|undefined} str - Texto de entrada
 * @param {number} max - Limite de caracteres (default 800)
 * @returns {string}
 */
function truncate(str, max = 800) {
  if (!str) return '';
  const plain = str.includes('<') ? stripHtml(str) : str;
  if (plain.length <= max) return plain;
  return plain.substring(0, max) + '...';
}

/**
 * Renderiza uma listagem paginada em Markdown com o esqueleto comum a slices de
 * listagem: mensagem de lista vazia, cabecalho com contagem (`N` ou `N de total`),
 * corpo item-a-item e bloco de paginacao.
 *
 * O que varia entre slices (titulo, mensagem de vazio, unidade e o Markdown de cada
 * item) e injetado; o esqueleto identico fica aqui (evita duplicacao entre slices).
 *
 * @param {object} params
 * @param {Array}    params.items        - Itens ja resolvidos (pode ser vazio/nulo)
 * @param {string}   params.title        - Titulo (sem contagem), ex: 'Templates Gupshup'
 * @param {string}   params.emptyMessage - Texto retornado quando nao ha itens
 * @param {function} params.renderItem   - (item) => string Markdown do item (deve terminar com '\n\n')
 * @param {number}   [params.total]      - Total de itens (header X-Total-Items)
 * @param {number}   [params.offset]     - Pagina atual
 * @param {number}   [params.limit]      - Itens por pagina
 * @param {string}   [params.unit]       - Unidade para paginacao (ex: 'templates')
 * @param {string}   [params.verbosity]  - Modo de verbosidade repassado a pagination()
 * @returns {string}
 */
function renderList({ items, title, emptyMessage, renderItem, total, offset, limit, unit, verbosity }) {
  if (!items || items.length === 0) return emptyMessage;

  const hasTotal = total !== undefined && total !== null && total !== items.length;
  const countLabel = hasTotal ? `${items.length} de ${total}` : `${items.length}`;

  let text = `**${title} (${countLabel})**\n\n`;
  items.forEach(item => { text += renderItem(item); });
  text += pagination({ offset, limit, count: items.length, total, unit }, verbosity);

  return text;
}

/**
 * Formata um valor monetario string (ex: "974.30") como "R$ 974,30",
 * com separador de milhar (ex: "28963.20" → "R$ 28.963,20").
 *
 * Nao usa Intl/toLocaleString por dois motivos verificados que falham em silencio:
 *   1. style:'currency' em pt-BR insere U+00A0 (NBSP) entre "R$" e o numero —
 *      quebra qualquer toContain('R$ ...') com espaco normal.
 *   2. Node small-icu (comum em clientes npx) faz toLocaleString('pt-BR') cair
 *      para en-US → ponto/virgula invertidos, sem nenhum erro.
 *
 * Casos de borda:
 *   null / undefined / '' → 'N/A'
 *   nao-numerico (ex: '--') → passthrough (preserva dado original da API)
 *   '0.00' → 'R$ 0,00' (nao 'N/A')
 *
 * @param {string|null|undefined} valueStr
 * @returns {string}
 */
function currencyBRL(valueStr) {
  if (valueStr === null || valueStr === undefined || valueStr === '') return 'N/A';
  const num = Number(valueStr);
  if (!Number.isFinite(num)) return valueStr;
  const [intPart, decPart] = num.toFixed(2).split('.');
  return `R$ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`;
}

module.exports = { footer, pagination, truncate, renderList, currencyBRL };

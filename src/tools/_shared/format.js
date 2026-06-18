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

module.exports = { footer, pagination, truncate };

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

const { stripHtml, escapeCell } = require('./markdown');

// Orcamento de resposta (spec 2026-09-22-response-budget-listagens). Clientes MCP
// externos recusam resultados acima de ~25k tokens; os limites abaixo mantem a
// resposta bem abaixo disso.
//   - RESPONSE_ITEM_BUDGET: teto por listagem, cortado no limite de um item (F3).
//   - RESPONSE_HARD_CAP: rede global em HandlerRegistry.execute, para qualquer tool (F4).
//   - AUTO_COMPACT_LIMIT: sem verbosidade explicita, uma pagina com MAIS itens retornados
//     do que isto liga o compact (F4; decidido apos o fetch, pelo volume real).
const RESPONSE_ITEM_BUDGET = 40000;
const RESPONSE_HARD_CAP = 60000;
const AUTO_COMPACT_LIMIT = 50;
const AUTO_COMPACT_NOTICE =
  '(formato compacto aplicado automaticamente pelo volume; envie x-tiflux-verbosity: rich ' +
  '(ou TIFLUX_MCP_VERBOSITY=rich no SDK) para forçar o formato completo)';
// Teto de itens por pagina da API v2 (limit maximo 200) — o tamanho efetivo da pagina.
const API_MAX_PAGE_SIZE = 200;

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
 * - compact: linha unica `[Pág N · K <unit>/pág · X nesta pág{· → offset N+1}]` (ex.: `200 tickets/pág`).
 *
 * @param {object} opts
 * @param {number} opts.offset  - Pagina atual (comeca em 1)
 * @param {number} opts.limit   - Itens por pagina
 * @param {number} opts.count   - Itens retornados nesta pagina
 * @param {number} [opts.total] - Total de itens (opcional; quando disponivel, exibido e usado
 *   para decidir hasMore: se total conhecido e currentOffset*currentLimit >= total, nao ha
 *   proxima pagina mesmo que a pagina venha cheia. Coercido via Number.parseInt para o
 *   calculo; valor nao-numerico e tratado como total desconhecido)
 * @param {string} [opts.unit]  - Palavra para o item (ex: 'tickets', 'chats'). Default 'itens'.
 * @param {string} [v='rich']   - Modo de verbosidade
 * @returns {string}
 */
function pagination({ offset, limit, count, total, unit = 'itens' }, v) {
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.max(1, Number.parseInt(limit) || 20);
  // offset na API v2 e numero de pagina 1-based: itens ja vistos ao final da pag N = N * limit.
  // Se total e conhecido e ja foi integralmente alcancado, nao ha proxima pagina mesmo com
  // pagina cheia. Se total e desconhecido, mantem a heuristica estrita (pagina cheia = tem mais).
  // Coercao defensiva: pagination() e exportado e chamavel direto por qualquer slice.
  // Se `total` vier como string nao-numerica, NaN cairia silenciosamente em "ultima pagina"
  // (esconderia paginas). Coercao invalida => trata como total desconhecido (direcao segura).
  const totalNum = Number.parseInt(total, 10);
  const knownTotal = !Number.isNaN(totalNum);
  const hasMore = count === currentLimit && (!knownTotal || currentOffset * currentLimit < totalNum);

  if (v === 'compact') {
    let line = `[Pág ${currentOffset} · ${currentLimit} ${unit}/pág · ${count} nesta pág`;
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
function renderList({ items, title, emptyMessage, renderItem, total, offset, limit, unit, verbosity, maxChars = RESPONSE_ITEM_BUDGET }) {
  if (!items || items.length === 0) return emptyMessage;

  const hasTotal = total !== undefined && total !== null && total !== items.length;
  const countLabel = hasTotal ? `${items.length} de ${total}` : `${items.length}`;

  return renderWithinBudget({
    head: `**${title} (${countLabel})**\n\n`,
    truncatedHead: (shown) => `**${title} (${cutCountLabel(shown, total, items.length)})**\n\n`,
    parts: items.map(item => renderItem(item)),
    pagination: pagination({ offset, limit, count: items.length, total, unit }, verbosity),
    maxChars, offset, limit, unit, verbosity, total
  });
}

/**
 * Contagem do cabecalho quando o teto corta a pagina: `K de <total>, página cortada`
 * (sem total conhecido, `K de <tamanho da página>`). `noun` entra depois do total
 * (ex.: 'encontrados' → `K de N encontrados, página cortada`). Usado como
 * `truncatedHead` do `renderWithinBudget` por todas as listagens com contagem no
 * cabecalho, para que o numero bata com os itens exibidos.
 *
 * @param {number} shown - itens mostrados
 * @param {number} [total] - total geral do filtro (X-Total-Items), quando conhecido
 * @param {number} pageCount - itens da pagina (usado sem total)
 * @param {string} [noun=''] - palavra apos o total
 * @returns {string}
 */
function cutCountLabel(shown, total, pageCount, noun = '') {
  // total ausente/vazio/nao numerico, ou 0 com itens na pagina → desconhecido: usa a pagina
  const totalNum = Number.parseInt(total, 10);
  const of = (!Number.isNaN(totalNum) && totalNum > 0) ? totalNum : pageCount;
  return `${shown} de ${of}${noun ? ` ${noun}` : ''}, página cortada`;
}

/**
 * Linha de corte com a instrucao de continuacao exata.
 *
 * A API v2 pagina por NUMERO de pagina (`offset` = pagina 1-based, `limit` =
 * tamanho). A pagina atual comeca no item S = (offset-1)*limit; mostrados K
 * itens, o proximo e o S+K. Com `limit: K`, a pagina que comeca em S+K e a
 * (S+K)/K + 1 — valida so quando S e divisivel por K (sempre na pagina 1).
 * Caso contrario, nenhum par (offset, limit: K) continua sem pular/repetir:
 * a linha sugere refinar o recorte ou refazer desde offset 1 com limit K.
 *
 * `count` e o tamanho DESTA pagina (nao o total do filtro): o texto diz isso
 * explicitamente e cita o total geral quando conhecido (`total`), para nao
 * conflitar com o cabecalho "N de total" da listagem.
 */
function continuationLine({ shown, count, offset, limit, unit = 'itens', verbosity, total }) {
  const page = Math.max(1, Number.parseInt(offset, 10) || 1);
  const pageSize = Math.min(API_MAX_PAGE_SIZE, Math.max(1, Number.parseInt(limit, 10) || 20));
  const start = (page - 1) * pageSize;
  const exact = start % shown === 0;
  const nextOffset = (start + shown) / shown + 1;
  const budgetLabel = `~${RESPONSE_ITEM_BUDGET / 1000}k`;
  const totalNum = Number.parseInt(total, 10);
  const knownTotal = !Number.isNaN(totalNum);

  if (verbosity === 'compact') {
    const scope = `${shown}/${count} nesta pág${knownTotal ? ` (total ${totalNum})` : ''}`;
    return exact
      ? `[cortado: ${scope} — offset ${nextOffset} limit ${shown}]\n`
      : `[cortado: ${scope} — refine o recorte ou refaça desde offset 1 limit ${shown}]\n`;
  }
  const totalLabel = knownTotal ? ` (total ${totalNum})` : '';
  const lead = `\n✂️ Mostrando ${shown} dos ${count} ${unit} desta página${totalLabel} — resposta limitada a ${budgetLabel} caracteres.`;
  return exact
    ? `${lead} Para continuar: offset ${nextOffset}, limit ${shown}\n`
    : `${lead} Para continuar sem pular nem repetir itens, refine o recorte (mesa, período) ou refaça desde offset 1 com limit ${shown}\n`;
}

/**
 * Concatena os blocos de item ate o teto `maxChars`, cortando sempre no limite
 * de um item (nunca no meio). Mostra no minimo 1 item (garante progresso na
 * continuacao; o excesso de um item gigante fica para a rede global de 60k).
 *
 * @param {string[]} parts - blocos ja renderizados, 1 por item, na ordem da pagina
 * @param {object} [opts]
 * @param {number} [opts.maxChars=RESPONSE_ITEM_BUDGET] - teto para itens + linha de corte
 * @param {number} [opts.offset] - pagina atual (1-based), para a continuacao
 * @param {number} [opts.limit] - tamanho da pagina pedida, para a continuacao
 * @param {string} [opts.unit] - unidade exibida na linha de corte (rich)
 * @param {string} [opts.verbosity] - 'rich' | 'compact'
 * @param {number} [opts.total] - total geral do filtro (X-Total-Items), citado na linha de corte
 * @returns {{ text: string, shown: number, truncated: boolean }} `text` inclui a
 *   linha de corte quando `truncated`
 */
function appendWithinBudget(parts, { maxChars = RESPONSE_ITEM_BUDGET, offset, limit, unit, verbosity, total } = {}) {
  const list = parts || [];
  const full = list.join('');
  if (full.length <= maxChars || list.length <= 1) {
    return { text: full, shown: list.length, truncated: false };
  }

  const cut = (k) => continuationLine({ shown: k, count: list.length, offset, limit, unit, verbosity, total });
  let used = list[0].length;
  let shown = 1;
  while (shown < list.length && used + list[shown].length + cut(shown + 1).length <= maxChars) {
    used += list[shown].length;
    shown++;
  }

  return { text: list.slice(0, shown).join('') + cut(shown), shown, truncated: true };
}

/**
 * Esqueleto de listagem com orcamento: `head + itens (+ linha de corte) + middle +
 * pagination + tail`, com o total limitado a `maxChars`. Quando corta, a linha de
 * corte substitui o bloco de paginacao — o "proxima pagina: offset N+1" dele
 * pularia os itens nao mostrados.
 *
 * @param {object} params
 * @param {string}   [params.head='']       - texto antes dos itens (titulo, cabecalho de tabela)
 * @param {function} [params.truncatedHead] - `(shown) => string`: substitui `head` quando corta
 *   (ex.: cabecalho que conta os itens mostrados). O orcamento reserva o maior dos dois.
 * @param {string[]} params.parts           - blocos de item ja renderizados
 * @param {string}   [params.middle='']     - texto entre os itens e a paginacao (filtros, somas, avisos)
 * @param {string}   [params.pagination=''] - bloco de paginacao (omitido quando corta)
 * @param {string}   [params.tail='']       - texto final (rodape)
 * @param {string}   [params.truncatedTail] - substitui `tail` quando corta (ex.: um aviso que
 *   so faz sentido sem a linha de corte). O orcamento reserva o maior dos dois.
 * @param {number}   [params.total]         - total geral do filtro, citado na linha de corte
 * @param {number}   [params.maxChars=RESPONSE_ITEM_BUDGET]
 * @param {number}   [params.offset]
 * @param {number}   [params.limit]
 * @param {string}   [params.unit]
 * @param {string}   [params.verbosity]
 * @returns {string}
 */
function renderWithinBudget({ head = '', truncatedHead, parts, middle = '', pagination: paginationText = '', tail = '', truncatedTail, maxChars = RESPONSE_ITEM_BUDGET, offset, limit, unit, verbosity, total }) {
  const fixed = middle.length + paginationText.length;
  const fitWith = (headLen, endLen) => appendWithinBudget(parts, { maxChars: maxChars - fixed - headLen - endLen, offset, limit, unit, verbosity, total });
  let fit = fitWith(head.length, tail.length);
  let end = tail;
  let headText = head;
  if (fit.truncated) {
    if (typeof truncatedTail === 'string') end = truncatedTail;
    // Cabecalho de corte: reserva o maior (shown <= parts.length, entao
    // truncatedHead(parts.length) limita o tamanho de qualquer truncatedHead(shown)).
    const hasTruncatedHead = typeof truncatedHead === 'function';
    const headLen = hasTruncatedHead ? Math.max(head.length, truncatedHead((parts || []).length).length) : head.length;
    const endLen = Math.max(tail.length, end.length);
    // Teto menor so corta mais cedo: continua truncado, e o texto final cabe no teto.
    if (headLen > head.length || endLen > tail.length) fit = fitWith(headLen, endLen);
    if (hasTruncatedHead) headText = truncatedHead(fit.shown);
  }
  return `${headText}${fit.text}${middle}${fit.truncated ? '' : paginationText}${end}`;
}

/**
 * Rede global de tamanho (F4): corta `text` no ultimo `\n\n` antes do teto e
 * acrescenta o aviso. Sem `\n\n` aproveitavel, corta seco (sem partir um par
 * surrogate). Texto dentro do teto volta intacto.
 *
 * @param {string} text
 * @param {number} [max=RESPONSE_HARD_CAP]
 * @returns {string} texto com no maximo `max` caracteres
 */
function capResponseText(text, max = RESPONSE_HARD_CAP) {
  if (typeof text !== 'string' || text.length <= max) return text;
  const notice = `\n\n…resposta cortada em ~${Math.round(max / 1000)}k caracteres — reduza limit ou refine o recorte.`;
  const room = max - notice.length;
  let cut = text.lastIndexOf('\n\n', room - 2);
  if (cut <= 0) {
    cut = room;
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  }
  return text.slice(0, cut) + notice;
}

/**
 * Verbosidade efetiva de uma listagem (F4). Sem verbosidade explicita (header
 * ou env) e com MAIS de AUTO_COMPACT_LIMIT itens RETORNADOS na pagina, a
 * listagem sai em `compact` e ganha uma linha de aviso. Decidido apos o fetch,
 * pelo volume real: `limit: 100` que devolve 9 itens segue `rich`, sem aviso
 * (achado do staging — o gatilho por `limit` avisava "pelo volume" sem volume).
 * Verbosidade explicita e respeitada sempre — `rich` explicito sai `rich`,
 * cortado pelo teto se preciso.
 *
 * @param {object} ctx - `{ verbosity, verbosityExplicit }` injetado pelo agregador
 * @param {number} [itemCount] - itens retornados nesta pagina (ausente = sem compact automatico)
 * @returns {{ verbosity: string, autoCompact: boolean, notice: string }} `notice`
 *   ('' quando nao ha compact automatico) ja vem com a quebra de linha inicial
 */
function listVerbosity({ verbosity, verbosityExplicit } = {}, itemCount) {
  const v = verbosity || 'rich';
  const autoCompact = !verbosityExplicit && v !== 'compact' && Number.parseInt(itemCount, 10) > AUTO_COMPACT_LIMIT;
  return {
    verbosity: autoCompact ? 'compact' : v,
    autoCompact,
    notice: autoCompact ? `\n${AUTO_COMPACT_NOTICE}` : ''
  };
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

function money(value, v) {
  if (v !== 'compact') return currencyBRL(value);
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(2);
}

/**
 * Formata data/hora conforme a verbosidade.
 *
 * - compact: SEMPRE UTC com sufixo `Z` (`toISOString().slice(0,16)+'Z'`). O
 *   valor e o mesmo instante em qualquer fuso — o modelo nao perde a
 *   referencia horaria, independente de onde o processo roda.
 * - rich: horario de Brasilia explicito (`timeZone: 'America/Sao_Paulo'`),
 *   nao o fuso do processo. Achado de producao (2026-09-22): o Lambda roda
 *   em UTC e `toLocaleString('pt-BR')` sem `timeZone` mostrava o horario UTC
 *   como se fosse local (ex: "22/09/2026, 18:50:45" quando em Brasilia eram
 *   15:50). Limitacao aceita: orgs em outro fuso do Brasil veem o horario de
 *   Brasilia.
 *
 * @param {string|null|undefined} value - valor de data/hora (ISO 8601 ou parseavel por Date)
 * @param {string} [v='rich'] - modo de verbosidade
 * @returns {string}
 */
function dateTime(value, v) {
  if (!value) return v === 'compact' ? '—' : 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  if (v === 'compact') return `${d.toISOString().slice(0, 16)}Z`;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Formatter reutilizado por dateOnly (criar Intl.DateTimeFormat por chamada e caro em laco).
// en-US + formatToParts: nao depende do locale estar completo (Node small-icu) nem da
// ordem dia/mes do locale — so as partes year/month/day sao usadas.
const SAO_PAULO_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

/**
 * Dia (sem hora) de um instante, no horario de Brasilia, formato ISO `YYYY-MM-DD`.
 * Usa `timeZone: 'America/Sao_Paulo'` (nao o fuso do processo nem o dia UTC): um
 * ticket criado as 22h em Brasilia (01h UTC do dia seguinte) fica no dia de Brasilia.
 *
 * @param {string|null|undefined} value - data/hora (ISO 8601 ou parseavel por Date)
 * Data pura ou data/hora sem fuso ja e tratada como horario de Brasilia (devolve o proprio dia).
 *
 * @returns {string} `YYYY-MM-DD`; `—` quando ausente; o valor original quando invalido (ex.: 02-30)
 */
function dateOnly(value) {
  if (!value) return '—';
  const str = String(value);
  // Data pura (YYYY-MM-DD) ou data/hora sem fuso: ja e o dia local (Brasilia) — usa os
  // 10 primeiros caracteres. `new Date('YYYY-MM-DD')` leria meia-noite UTC (dia anterior
  // em Brasilia) e data/hora sem fuso seria lida no fuso do processo.
  const naive = NAIVE_DATE_PATTERN.exec(str);
  if (naive) return isRealDate(naive[1], naive[2], naive[3]) ? `${naive[1]}-${naive[2]}-${naive[3]}` : str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  const parts = Object.fromEntries(SAO_PAULO_DAY.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// YYYY-MM-DD sozinho ou seguido de hora SEM designador de fuso (Z / ±hh:mm / ±hhmm)
const NAIVE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;

function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d);
}

// Horas sem teto (duração acumulada passa de 24h); minutos/segundos 00–59
const HHMM_PATTERN = /^\d+:[0-5]\d(:[0-5]\d)?$/;

function durationMin(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (!HHMM_PATTERN.test(s)) return null;
  const [h, m] = s.split(':');
  return Number.parseInt(h, 10) * 60 + Number.parseInt(m, 10);
}

function row(cells) {
  return cells.map(c => escapeCell(c === null || c === undefined ? '—' : c)).join('|');
}

module.exports = {
  footer, pagination, truncate, renderList, currencyBRL, money, dateTime, dateOnly, durationMin, row,
  appendWithinBudget, renderWithinBudget, continuationLine, cutCountLabel, capResponseText, listVerbosity,
  RESPONSE_ITEM_BUDGET, RESPONSE_HARD_CAP, AUTO_COMPACT_LIMIT, AUTO_COMPACT_NOTICE
};

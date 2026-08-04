/**
 * chatTicket.js — formatacao da referencia do ticket vinculado a um chat.
 *
 * Extraido porque a mesma linha aparece em 5 slices de chat (list_inbox_chats,
 * list_my_chats, list_in_attendance_chats, list_archived_chats e get_chat) —
 * CLAUDE.md autoriza _shared/ quando ha duplicacao real em >=3 slices.
 *
 * Centralizar aqui tambem da UM ponto de saneamento do `title`, que e conteudo
 * digitado por quem abre o ticket (entrada externa). Sem isso, um titulo com
 * '\n' poderia forjar linhas extras no Markdown que o cliente de IA le como
 * dados legitimos (line-spoofing), e um titulo muito longo infla o output.
 *
 * Contrato da API v2 (Swagger, GET /chats/{id} e GET /chats/{inbox,mine,
 * in_attendance,archived}): `ticket` e `nullable`; quando presente, tem
 * `number` (integer) e `title` (string), ambos required. O saneamento aqui e
 * defensivo: tolera `number` string, `title` ausente/nulo/nao-string.
 */

const { truncate } = require('./format');

/** Limite do titulo no output — mesmo teto usado para `last_client_message`. */
const TITLE_MAX_LENGTH = 150;

/**
 * Normaliza o titulo do ticket para uma unica linha, truncada.
 * Tipo inesperado (objeto, array, boolean) → '' (cai no fallback do chamador).
 *
 * @param {*} title - valor cru de `ticket.title`
 * @returns {string} titulo em uma linha (pode ser '')
 */
function sanitizeTicketTitle(title) {
  const raw = typeof title === 'number' ? String(title) : title;
  if (typeof raw !== 'string') return '';
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  return truncate(singleLine, TITLE_MAX_LENGTH);
}

/**
 * Referencia inline do ticket vinculado: `#N — Titulo`.
 * Usa `!= null` (nao truthiness) para nao suprimir um ticket `#0`.
 *
 * @param {object|null|undefined} ticket - objeto `ticket` do chat
 * @returns {string|null} `#N — Titulo`, ou null quando nao ha ticket vinculado
 */
function ticketReference(ticket) {
  const number = ticket?.number;
  if (number === null || number === undefined || number === '') return null;
  return `#${number} — ${sanitizeTicketTitle(ticket.title) || 'Sem título'}`;
}

/**
 * Linha de ticket vinculado no formato dos itens de listagem de chats
 * (indentada, com '\n' ao final). String vazia quando nao ha ticket — assim o
 * formatter concatena sem condicional e o item fica identico ao de antes.
 *
 * @param {object|null|undefined} ticket - objeto `ticket` do chat
 * @returns {string} `   Ticket: #N — Titulo\n` ou ''
 */
function ticketLine(ticket) {
  const reference = ticketReference(ticket);
  return reference ? `   Ticket: ${reference}\n` : '';
}

module.exports = { ticketReference, ticketLine, sanitizeTicketTitle, TITLE_MAX_LENGTH };

/**
 * chatFields.js — formatadores de campos de chat compartilhados entre slices.
 *
 * Extraido porque os mesmos formatadores aparecem em 5 slices (list_inbox_chats,
 * list_my_chats, list_in_attendance_chats, list_archived_chats e get_chat) —
 * CLAUDE.md autoriza _shared/ quando ha duplicacao real em >=3 slices.
 * Precedente: chatTicket.js (mesmo motivo, mesma contagem de 5 consumidores).
 *
 * --- Sintese de `assumed_at` (correcao H1) ---
 * A premissa antiga deste comentario ("a view :show sintetiza assumed_at com
 * DateTime.now quando a coluna esta null") estava ERRADA — nao existe essa
 * sintese no `:show` (verificado no fonte do backend). O `:show` (get_chat)
 * devolve a mesma coluna crua que o `:index` (as 4 listagens): ambos podem ser
 * null em chats legados (assumidos antes da coluna existir) ou nao assumidos.
 * A UNICA sintese real de timestamp fica na RESPOSTA do `update_chat` (view
 * `:updated`): o campo `updated_at` dessa resposta e o relogio do request, nao
 * um valor persistido (ver H20 em updateChat.js). Nao ha divergencia entre
 * get_chat e as listagens para assumed_at — por isso a descricao dos schemas
 * das 4 listagens nao cita mais essa divergencia (H1/H5).
 *
 * --- Contrato de `origin` ---
 * A API v2 devolve `origin` como OBJETO { integration_id, _type, fields }.
 * Fixtures legadas de teste usam string por erro historico — originLabel tolera ambos
 * para compatibilidade. Exibimos apenas `_type` (ex: whatsapp, site_widget) porque e
 * o mesmo vocabulario dos filtros de entrada `origins` das 4 listagens: o usuario le
 * "whatsapp" na lista e pode filtrar origins: "whatsapp" sem traduzir nada.
 */

const { dateTime } = require('./format');

/**
 * Converte o campo `origin` (objeto ou string legada) numa string exibivel.
 *
 * - objeto com _type string nao-vazia → retorna origin._type (ex: 'whatsapp')
 * - objeto com _type ausente/nulo/vazio → fallback
 * - string                              → retorna como esta (fixtures legadas)
 * - null / undefined                    → fallback
 * - tipo inesperado (number, array...)  → fallback
 *
 * O fallback e parametro (default 'N/A', vocabulario das listagens) para o
 * chamador escolher o proprio texto de ausencia sem precisar comparar a saida
 * com um valor sentinela — get_chat usa 'Nao informado', o padrao do card.
 *
 * @param {*} origin - valor cru do campo `origin` do chat
 * @param {string} [fallback='N/A'] - texto quando a origem esta ausente/invalida
 * @returns {string}
 */
function originLabel(origin, fallback = 'N/A') {
  if (origin === null || origin === undefined) return fallback;
  if (typeof origin === 'string') return origin;
  if (typeof origin === 'object' && !Array.isArray(origin)) {
    const type = origin._type;
    if (typeof type === 'string' && type.length > 0) return type;
    return fallback;
  }
  return fallback;
}

/**
 * Linha de "Assumido em:" no formato dos itens de listagem de chats
 * (indentada, com '\n' ao final), com a data formatada por `dateTime` (H30:
 * Brasilia no rich, UTC curto no compact). String vazia quando ausente/nulo/
 * vazio — assim o formatter concatena sem condicional e o item fica identico
 * ao de hoje quando nao ha dado. Contrato identico ao ticketLine de chatTicket.js.
 *
 * @param {string|null|undefined} assumedAt - valor cru de `assumed_at`
 * @param {string} [verbosity='rich'] - modo de verbosidade repassado a `dateTime`
 * @returns {string} '   Assumido em: <valor>\n' ou ''
 */
function assumedAtLine(assumedAt, verbosity) {
  if (!assumedAt) return '';
  return `   Assumido em: ${dateTime(assumedAt, verbosity)}\n`;
}

/**
 * Rotulo do flag `waiting_answer` (H29/H4). O flag significa "ha mensagem do
 * cliente pendente para o atendente" — nao tem relacao com CSAT. `null`
 * (chat aberto por atendente/campanha/API em que o cliente nunca respondeu) e
 * semanticamente equivalente a `false`: ambos exibem o mesmo rotulo de "Nao".
 *
 * @param {boolean|null|undefined} waitingAnswer - valor cru de `waiting_answer`
 * @returns {string} 'Pendente p/ atendente: Sim' ou 'Pendente p/ atendente: Não (aguardando cliente)'
 */
function waitingLabel(waitingAnswer) {
  return waitingAnswer === true
    ? 'Pendente p/ atendente: Sim'
    : 'Pendente p/ atendente: Não (aguardando cliente)';
}

/**
 * Linha de contato/solicitante (H11). A API distingue um CONTATO (nome livre,
 * sem cadastro de solicitante — `requestor.id` nulo) de um SOLICITANTE
 * cadastrado (`requestor.id` presente). Exibir sempre como "Requerente:"
 * escondia essa diferenca (um contato aparentava ser um solicitante valido).
 *
 * @param {{id?: number|null, name?: string|null, email?: string|null}|null|undefined} requestor
 * @param {object} [options]
 * @param {boolean} [options.includeEmail=false] - acrescenta `| Email: <email>` quando
 *   `requestor.email` existir (usado pelo card de get_chat; as listagens nao trazem email)
 * @returns {string} 'Solicitante: <nome> (ID <id>)' | 'Contato: <nome> (sem solicitante vinculado)' | 'Contato: N/A'
 */
function personLine(requestor, { includeEmail = false } = {}) {
  const r = requestor || {};
  const name = r.name;

  let base;
  if (r.id !== null && r.id !== undefined) {
    base = `Solicitante: ${name || 'N/A'} (ID ${r.id})`;
  } else {
    base = name ? `Contato: ${name} (sem solicitante vinculado)` : 'Contato: N/A';
  }

  if (includeEmail && r.email) {
    base += ` | Email: ${r.email}`;
  }

  return base;
}

module.exports = { originLabel, assumedAtLine, waitingLabel, personLine };

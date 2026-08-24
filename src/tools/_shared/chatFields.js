/**
 * chatFields.js — formatadores de campos de chat compartilhados entre slices.
 *
 * Extraido porque os mesmos dois formatadores aparecem em 5 slices (list_inbox_chats,
 * list_my_chats, list_in_attendance_chats, list_archived_chats e get_chat) —
 * CLAUDE.md autoriza _shared/ quando ha duplicacao real em >=3 slices.
 * Precedente: chatTicket.js (mesmo motivo, mesma contagem de 5 consumidores).
 *
 * --- Divergencia de contrato `assumed_at` entre listagens e get_chat ---
 * Na API v2:
 *   - view :index (as 4 listagens): retorna a coluna crua — pode ser null em chats
 *     que foram assumidos antes da coluna existir (chats legados).
 *   - view :show (get_chat): quando o chat tem responsavel mas a coluna esta null,
 *     o blueprint sintetiza DateTime.now.utc. Resultado: um chat legado pode exibir
 *     timestamp no get_chat e null na listagem.
 * Isso e comportamento da API, nao do MCP. Registrado no schema de cada tool que
 * exibe assumed_at para o cliente de IA nao tratar a listagem como fonte autoritativa
 * de "quando foi assumido".
 *
 * --- Contrato de `origin` ---
 * A API v2 devolve `origin` como OBJETO { integration_id, _type, fields }.
 * Fixtures legadas de teste usam string por erro historico — originLabel tolera ambos
 * para compatibilidade. Exibimos apenas `_type` (ex: whatsapp, site_widget) porque e
 * o mesmo vocabulario dos filtros de entrada `origins` das 4 listagens: o usuario le
 * "whatsapp" na lista e pode filtrar origins: "whatsapp" sem traduzir nada.
 */

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
 * (indentada, com '\n' ao final). String vazia quando ausente/nulo/vazio —
 * assim o formatter concatena sem condicional e o item fica identico ao de
 * hoje quando nao ha dado. Contrato identico ao ticketLine de chatTicket.js.
 *
 * Nota: nas 4 listagens, `assumed_at` vem da coluna crua da API (pode ser null
 * para chats nao assumidos ou legados). No inbox em particular e sempre null
 * porque inbox so tem chats nao assumidos.
 *
 * @param {string|null|undefined} assumedAt - valor cru de `assumed_at`
 * @returns {string} '   Assumido em: <valor>\n' ou ''
 */
function assumedAtLine(assumedAt) {
  if (!assumedAt) return '';
  return `   Assumido em: ${assumedAt}\n`;
}

module.exports = { originLabel, assumedAtLine };

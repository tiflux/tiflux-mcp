/**
 * Slice: list_inbox_chats — lista chats na caixa de entrada (não assumidos).
 *
 * Endpoint: GET /chats/inbox (via api.listInboxChats).
 * Suporta filtros opcionais + paginação offset/limit.
 * Esqueleto (schema/execute/format) em _shared/chatList.defineChatListSlice.
 */

const { defineChatListSlice, onlineWaitingChatItem } = require('../_shared/chatList');

module.exports = defineChatListSlice({
  name: 'list_inbox_chats',
  description: 'Listar chats na caixa de entrada (chats não assumidos) em modo atendente, com filtros opcionais de departamento, cliente, origem e paginação. Chats em triagem (bot/departamento, sem responsável) não aparecem aqui — use list_in_attendance_chats com status=triage.',
  title: 'Chats — Caixa de Entrada',
  formatItem: onlineWaitingChatItem,
  apiMethod: 'listInboxChats',
  noun: 'chats da caixa de entrada',
  emptyTitle: 'Nenhum chat encontrado na caixa de entrada',
  emptyHint: 'Não há chats na caixa de entrada com os filtros informados.'
});

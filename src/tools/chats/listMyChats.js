/**
 * Slice: list_my_chats — lista chats assumidos pelo usuário da API key.
 *
 * Endpoint: GET /chats/mine (via api.listMyChats).
 * Query params e response idênticos aos de /chats/inbox.
 * Esqueleto (schema/execute/format) em _shared/chatList.defineChatListSlice.
 */

const { defineChatListSlice, onlineWaitingChatItem } = require('../_shared/chatList');

module.exports = defineChatListSlice({
  name: 'list_my_chats',
  description: 'Listar chats assumidos pelo usuário autenticado (dono da API key) com filtros opcionais e paginação.',
  title: 'Meus Chats',
  formatItem: onlineWaitingChatItem,
  apiMethod: 'listMyChats',
  noun: 'meus chats',
  emptyTitle: 'Nenhum chat encontrado',
  emptyHint: 'Você não possui chats assumidos com os filtros informados.'
});

/**
 * Slice: list_in_attendance_chats — lista todos os chats em atendimento da organização.
 *
 * Endpoint: GET /chats/in_attendance (via api.listInAttendanceChats).
 * Inclui filtros adicionais user_id e status além dos filtros comuns.
 * Esqueleto (schema/execute/format) em _shared/chatList.defineChatListSlice.
 */

const { commonChatListFilters } = require('../_shared/chatFilters');
const { originLabel, waitingLabel } = require('../_shared/chatFields');
const { chatItemBody, defineChatListSlice } = require('../_shared/chatList');

function formatChatItem(chat, index, verbosity) {
  const id = chat.id || 'N/A';
  const origin = originLabel(chat.origin);
  const responsible = chat.responsible
    ? `Atendente: ${chat.responsible.name || 'N/A'} (ID ${chat.responsible.id})`
    : 'Atendente: — (não assumido)';

  return (
    `**${index + 1}. Chat #${id}**\n` +
    `   Origem: ${origin} | ${responsible}\n` +
    `   ${waitingLabel(chat.waiting_answer)}\n` +
    chatItemBody(chat, verbosity)
  );
}

module.exports = defineChatListSlice({
  name: 'list_in_attendance_chats',
  description: 'Listar todos os chats ABERTOS da organização: inclui os não assumidos da caixa de entrada e os em triagem (bot/departamento, sem responsável), além dos já assumidos. Use user_id para ver só os chats de um atendente específico.',
  extraProperties: {
    user_id: {
      type: 'number',
      description: 'Filtrar por ID do responsável do chat (opcional)'
    },
    status: {
      type: 'string',
      enum: ['waiting_client', 'waiting_attendance', 'triage'],
      description: 'Filtrar por status do atendimento (opcional). waiting_client: há mensagem do cliente pendente para o atendente. waiting_attendance: o atendimento já respondeu/leu e aguarda o cliente — NÃO inclui os chats em que o cliente nunca respondeu (para esses, omita status). triage: sem responsável, em bot/departamento.'
    }
  },
  title: 'Chats em Atendimento',
  formatItem: formatChatItem,
  apiMethod: 'listInAttendanceChats',
  buildFilters: (args) => ({ ...commonChatListFilters(args), user_id: args.user_id, status: args.status }),
  noun: 'chats em atendimento',
  emptyTitle: 'Nenhum chat encontrado em atendimento',
  emptyHint: 'Não há chats em atendimento com os filtros informados.'
});

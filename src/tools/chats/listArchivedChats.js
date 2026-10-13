/**
 * Slice: list_archived_chats — lista chats arquivados (finalizados ou cancelados).
 *
 * Endpoint: GET /chats/archived (via api.listArchivedChats).
 * Inclui assessment (nota 1-5) e canceled (sim/não) em cada item.
 * Esqueleto (schema/execute/format) em _shared/chatList.defineChatListSlice.
 */

const { finishedAtFilterSchemaProperties } = require('../_shared/schemaProps');
const { errorResponse } = require('../_shared/errors');
const { commonChatListFilters, normalizeFinishedAtFilters } = require('../_shared/chatFilters');
const { originLabel } = require('../_shared/chatFields');
const { chatItemBody, defineChatListSlice } = require('../_shared/chatList');

function formatChatItem(chat, index, verbosity) {
  const id = chat.id || 'N/A';
  const origin = originLabel(chat.origin);
  const canceled = chat.canceled ? 'Sim' : 'Não';
  const assessment = chat.assessment != null ? chat.assessment : 'Sem avaliação';

  return (
    `**${index + 1}. Chat #${id}**\n` +
    `   Origem: ${origin} | Cancelado: ${canceled} | Avaliação: ${assessment}\n` +
    chatItemBody(chat, verbosity)
  );
}

module.exports = defineChatListSlice({
  name: 'list_archived_chats',
  description: 'Listar chats arquivados (finalizados ou cancelados) com filtros opcionais. Exibe avaliação do atendimento e status de cancelamento.',
  extraProperties: {
    canceled: {
      type: 'boolean',
      description: 'Filtrar por cancelamento: true = somente cancelados, false = somente finalizados normalmente, omitido = todos os arquivados (opcional)'
    }
  },
  trailingProperties: finishedAtFilterSchemaProperties(),
  title: 'Chats Arquivados',
  formatItem: formatChatItem,
  apiMethod: 'listArchivedChats',
  buildFilters: (args) => ({
    ...commonChatListFilters(args),
    canceled: args.canceled,
    ...normalizeFinishedAtFilters(args)
  }),
  noun: 'chats arquivados',
  emptyTitle: 'Nenhum chat arquivado encontrado',
  emptyHint: 'Não há chats arquivados com os filtros informados.',
  onApiError: (response) => (response.status === 403
    ? errorResponse(
      `**Sem permissão para listar chats arquivados**\n\n` +
      `**Código:** 403\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*Verifique se sua conta tem permissão para acessar chats arquivados.*`
    )
    : undefined)
});

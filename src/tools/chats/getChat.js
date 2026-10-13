/**
 * Slice: get_chat — exibe detalhes de um chat específico pelo id.
 *
 * Endpoint: GET /chats/{id} (via api.getChat).
 * Retorna card único com todos os campos relevantes do chat.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, dateTime } = require('../_shared/format');
const { ticketReference } = require('../_shared/chatTicket');
const { originLabel, waitingLabel, personLine } = require('../_shared/chatFields');

const schema = {
  name: 'get_chat',
  description: 'Exibir detalhes de um chat específico pelo id. Retorna card com status, cliente, responsável, departamento, origem, avaliação e datas.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID numérico do chat (aceita também string numérica — o handler faz parseInt)'
      }
    },
    required: ['id']
  }
};

function formatChatCard(chat, verbosity) {
  const id = chat.id || 'N/A';
  const archived = chat.archived ? 'Sim' : 'Não';
  const canceled = chat.canceled ? 'Sim' : 'Não';
  const assessment = chat.assessment != null ? chat.assessment : 'Sem avaliação';
  const clientName = chat.client?.name || 'Não informado';
  const department = chat.department?.name || 'Não informado';
  const responsible = chat.responsible?.name || 'Sem responsável';
  const origin = originLabel(chat.origin, 'Não informado');
  const room = chat.room || 'Não informado';
  const online = chat.online ? 'Online' : 'Offline';
  const ticket = ticketReference(chat.ticket) || 'Sem ticket vinculado';
  const startedBy = chat.started_by || 'Não informado';
  const createdAt = dateTime(chat.created_at, verbosity);
  const updatedAt = dateTime(chat.updated_at, verbosity);
  const assumedAt = dateTime(chat.assumed_at, verbosity);
  const lastClientMessage = dateTime(chat.last_client_message, verbosity);

  return (
    `**Chat #${id}**\n\n` +
    `**Status:** ${archived === 'Sim' ? 'Arquivado' : 'Ativo'} | Cancelado: ${canceled}\n` +
    `**Avaliação:** ${assessment}\n` +
    `**Online:** ${online} | ${waitingLabel(chat.waiting_answer)}\n\n` +
    `**Cliente:** ${clientName}\n` +
    `**${personLine(chat.requestor, { includeEmail: true })}**\n` +
    `**Departamento:** ${department}\n` +
    `**Responsável:** ${responsible}\n\n` +
    `**Origem:** ${origin}\n` +
    `**Iniciado por:** ${startedBy}\n` +
    `**Sala:** ${room}\n` +
    `**Ticket vinculado:** ${ticket}\n\n` +
    `**Última msg do cliente em:** ${lastClientMessage}\n\n` +
    `**Criado em:** ${createdAt}\n` +
    `**Atualizado em:** ${updatedAt}\n` +
    `**Assumido em:** ${assumedAt}\n\n` +
    `${footer(verbosity)}`
  );
}

async function execute(args, { api, verbosity }) {
  requireField(args, 'id');

  const id = parseInt(args.id);

  try {
    const response = await api.getChat(id);

    if (response.error) {
      const code = response.status;
      if (code === 404) {
        return errorResponse(
          `**Chat não encontrado**\n\n` +
          `**ID:** ${id}\n\n` +
          `*Verifique se o ID está correto e se você tem acesso a este chat.*`
        );
      }
      if (code === 401) {
        return errorResponse(
          `**Erro de autenticação**\n\n` +
          `**Código:** 401\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se a API key está correta e não expirou.*`
        );
      }
      if (code === 403) {
        return errorResponse(
          `**Sem permissão para acessar este chat**\n\n` +
          `**Código:** 403\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se sua conta tem permissão ou licença para acessar chats.*`
        );
      }
      return errorResponse(
        `**Erro ao buscar chat**\n\n` +
        `**ID:** ${id}\n` +
        `**Código:** ${code}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    return textResponse(formatChatCard(response.data, verbosity));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar chat**\n\n` +
      `**ID:** ${id}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatChatCard };

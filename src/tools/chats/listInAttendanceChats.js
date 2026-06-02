/**
 * Slice: list_in_attendance_chats — lista todos os chats em atendimento da organização.
 *
 * Endpoint: GET /chats/in_attendance (via api.listInAttendanceChats).
 * Inclui filtros adicionais user_id e status além dos filtros comuns.
 */

const { textResponse } = require('../_shared/response');

const schema = {
  name: 'list_in_attendance_chats',
  description: 'Listar todos os chats em atendimento da organização com filtros opcionais de responsável, status e paginação.',
  inputSchema: {
    type: 'object',
    properties: {
      offset: {
        type: 'number',
        description: 'Número da página a ser retornada (padrão: 1, mínimo: 1)'
      },
      limit: {
        type: 'number',
        description: 'Número de chats por página (padrão: 20, máximo: 200)'
      },
      department_id: {
        type: 'number',
        description: 'Filtrar por ID do departamento (opcional)'
      },
      client_id: {
        type: 'number',
        description: 'Filtrar por ID do cliente (opcional)'
      },
      requestor_id: {
        type: 'number',
        description: 'Filtrar por ID do requerente — deve ser maior que 0 (opcional)'
      },
      number: {
        type: 'number',
        description: 'Filtrar por número de contato WhatsApp — requer licença WhatsApp (opcional)'
      },
      origins: {
        type: 'string',
        description: 'Canal(is) de origem separados por vírgula: chat, site_widget, campaign, whatsapp, whatsapp_web, gupshup, whatsapp_cloud (opcional)'
      },
      started_by: {
        type: 'string',
        description: 'Tipo de iniciador do chat: Client, Attendant, Campaign, API (opcional)'
      },
      user_id: {
        type: 'number',
        description: 'Filtrar por ID do responsável do chat (opcional)'
      },
      status: {
        type: 'string',
        description: 'Filtrar por status do atendimento: waiting_client, waiting_attendance, triage (opcional)'
      }
    },
    required: []
  }
};

function formatChatItem(chat, index) {
  const id = chat.id || 'N/A';
  const origin = chat.origin || 'N/A';
  const clientName = chat.client?.name || 'N/A';
  const requestorName = chat.requestor?.name || 'N/A';
  const department = chat.department?.name || 'N/A';
  const waitingAnswer = chat.waiting_answer ? 'Sim' : 'Não';
  const online = chat.online ? 'Online' : 'Offline';
  const createdAt = chat.created_at || 'N/A';

  let lastMsg = chat.last_client_message || 'Sem mensagem';
  if (lastMsg.length > 150) lastMsg = lastMsg.substring(0, 150) + '...';

  return (
    `**${index + 1}. Chat #${id}**\n` +
    `   Origem: ${origin} | ${online} | Aguardando: ${waitingAnswer}\n` +
    `   Cliente: ${clientName} | Requerente: ${requestorName}\n` +
    `   Departamento: ${department}\n` +
    `   Última mensagem: ${lastMsg}\n` +
    `   Criado em: ${createdAt}\n`
  );
}

function formatChatsList(chats, offset, limit) {
  let text = `**Chats em Atendimento** (${chats.length} encontrado${chats.length !== 1 ? 's' : ''})\n\n`;

  chats.forEach((chat, index) => {
    text += formatChatItem(chat, index) + '\n';
  });

  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const hasMore = chats.length === currentLimit;

  text += `**Paginação:**\n`;
  text += `• Página atual: ${currentOffset}\n`;
  text += `• Chats por página: ${currentLimit}\n`;
  text += `• Chats nesta página: ${chats.length}\n`;

  if (hasMore) {
    const nextOffset = currentOffset + 1;
    text += `• Próxima página: Use \`offset: ${nextOffset}\` para ver mais chats\n`;
  } else {
    text += `• Esta é a última página disponível\n`;
  }

  return text + '\n*Dados obtidos da API TiFlux em tempo real*';
}

async function execute(args, { api }) {
  const { offset = 1, limit = 20, department_id, client_id, requestor_id, number, origins, started_by, user_id, status } = args;

  try {
    const response = await api.listInAttendanceChats({
      offset,
      limit,
      department_id,
      client_id,
      requestor_id,
      number,
      origins,
      started_by,
      user_id,
      status
    });

    if (response.error) {
      return textResponse(
        `**Erro ao listar chats em atendimento**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    const chats = response.data || [];

    if (chats.length === 0) {
      return textResponse(
        `**Nenhum chat encontrado em atendimento**\n\n` +
        `**Página:** ${offset}\n\n` +
        `*Não há chats em atendimento com os filtros informados.*`
      );
    }

    return textResponse(formatChatsList(chats, offset, limit));
  } catch (error) {
    return textResponse(
      `**Erro interno ao listar chats em atendimento**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatChatsList };

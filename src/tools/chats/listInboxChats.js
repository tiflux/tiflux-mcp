/**
 * Slice: list_inbox_chats — lista chats na caixa de entrada (não assumidos).
 *
 * Endpoint: GET /chats/inbox (via api.listInboxChats).
 * Suporta filtros opcionais + paginação offset/limit.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { createdAtFilterSchemaProperties } = require('../_shared/schemaProps');
const { commonChatListFilters } = require('../_shared/chatFilters');

const schema = {
  name: 'list_inbox_chats',
  description: 'Listar chats na caixa de entrada (chats não assumidos) com filtros opcionais de departamento, cliente, origem e paginação.',
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
        description: 'Filtrar por ID do departamento (opcional). Para descobrir o ID a partir de um nome, use list_departments (ex: list_departments name:"financeiro").'
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
      ...createdAtFilterSchemaProperties()
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

function formatChatsList(chats, offset, limit, title, verbosity) {
  let text = `**${title}** (${chats.length} encontrado${chats.length !== 1 ? 's' : ''})\n\n`;

  chats.forEach((chat, index) => {
    text += formatChatItem(chat, index) + '\n';
  });

  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: chats.length, unit: 'chats' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return text + paginationInfo + sep + footerStr;
}

async function execute(args, { api, verbosity }) {
  const filters = commonChatListFilters(args);
  const { offset, limit } = filters;

  try {
    const response = await api.listInboxChats(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar chats da caixa de entrada**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    const chats = response.data || [];

    if (chats.length === 0) {
      return textResponse(
        `**Nenhum chat encontrado na caixa de entrada**\n\n` +
        `**Página:** ${offset}\n\n` +
        `*Não há chats na caixa de entrada com os filtros informados.*`
      );
    }

    return textResponse(formatChatsList(chats, offset, limit, 'Chats — Caixa de Entrada', verbosity));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar chats da caixa de entrada**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatChatsList };

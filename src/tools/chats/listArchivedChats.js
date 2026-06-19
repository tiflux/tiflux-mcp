/**
 * Slice: list_archived_chats — lista chats arquivados (finalizados ou cancelados).
 *
 * Endpoint: GET /chats/archived (via api.listArchivedChats).
 * Inclui assessment (nota 1-5) e canceled (sim/não) em cada item.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { createdAtFilterSchemaProperties, finishedAtFilterSchemaProperties } = require('../_shared/schemaProps');
const { commonChatListFilters } = require('../_shared/chatFilters');

const schema = {
  name: 'list_archived_chats',
  description: 'Listar chats arquivados (finalizados ou cancelados) com filtros opcionais. Exibe avaliação do atendimento e status de cancelamento.',
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
      canceled: {
        type: 'boolean',
        description: 'Filtrar por cancelamento: true = somente cancelados, false = somente finalizados normalmente, omitido = todos os arquivados (opcional)'
      },
      ...createdAtFilterSchemaProperties(),
      ...finishedAtFilterSchemaProperties()
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
  const canceled = chat.canceled ? 'Sim' : 'Não';
  const assessment = chat.assessment != null ? chat.assessment : 'Sem avaliação';
  const createdAt = chat.created_at || 'N/A';

  let lastMsg = chat.last_client_message || 'Sem mensagem';
  if (lastMsg.length > 150) lastMsg = lastMsg.substring(0, 150) + '...';

  return (
    `**${index + 1}. Chat #${id}**\n` +
    `   Origem: ${origin} | Cancelado: ${canceled} | Avaliação: ${assessment}\n` +
    `   Cliente: ${clientName} | Requerente: ${requestorName}\n` +
    `   Departamento: ${department}\n` +
    `   Última mensagem: ${lastMsg}\n` +
    `   Criado em: ${createdAt}\n`
  );
}

function formatChatsList(chats, offset, limit, verbosity) {
  let text = `**Chats Arquivados** (${chats.length} encontrado${chats.length !== 1 ? 's' : ''})\n\n`;

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
  const filters = {
    ...commonChatListFilters(args),
    canceled: args.canceled,
    finished_at_start: args.finished_at_start,
    finished_at_end: args.finished_at_end
  };
  const { offset, limit } = filters;

  try {
    const response = await api.listArchivedChats(filters);

    if (response.error) {
      const code = response.status;
      if (code === 403) {
        return errorResponse(
          `**Sem permissão para listar chats arquivados**\n\n` +
          `**Código:** 403\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se sua conta tem permissão para acessar chats arquivados.*`
        );
      }
      return errorResponse(
        `**Erro ao listar chats arquivados**\n\n` +
        `**Código:** ${code}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    const chats = response.data || [];

    if (chats.length === 0) {
      return textResponse(
        `**Nenhum chat arquivado encontrado**\n\n` +
        `**Página:** ${offset}\n\n` +
        `*Não há chats arquivados com os filtros informados.*`
      );
    }

    return textResponse(formatChatsList(chats, offset, limit, verbosity));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar chats arquivados**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatChatsList };

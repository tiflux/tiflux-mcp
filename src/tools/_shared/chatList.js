/**
 * chatList.js — esqueleto de formatacao das 4 listagens de chats
 * (list_inbox_chats, list_my_chats, list_in_attendance_chats, list_archived_chats).
 *
 * Extraido no pos-review do PR #111: o `formatChatsList` (cabecalho + itens +
 * paginacao com total + renderWithinBudget) e o corpo comum de cada item
 * (Cliente/Contato, Departamento, ticket, ultima msg do cliente, criado/assumido
 * em) eram identicos nas 4 slices — duplicacao real em >=3 slices (CLAUDE.md).
 * Cada slice continua dona do que a diferencia: titulo e as linhas de topo do
 * item (origem, online/atendente, aguardando, cancelado/avaliacao).
 */

const { footer, pagination, dateTime, renderWithinBudget, cutCountLabel } = require('./format');
const { ticketLine } = require('./chatTicket');
const { assumedAtLine, personLine, originLabel, waitingLabel } = require('./chatFields');
const { createdAtFilterSchemaProperties, paginationSchemaProperties, startedByFilterSchemaProperty } = require('./schemaProps');
const { commonChatListFilters } = require('./chatFilters');
const { textResponse } = require('./response');
const { errorResponse } = require('./errors');

/**
 * Propriedades de schema comuns as 4 listagens de chats: paginacao + filtros
 * department_id, client_id, requestor_id, number, origins e started_by (nesta
 * ordem). Espalhar com `...chatListFilterSchemaProperties()` no inicio de
 * `inputSchema.properties`; cada slice acrescenta depois os filtros proprios
 * (user_id/status, canceled, datas).
 * @returns {object}
 */
function chatListFilterSchemaProperties() {
  return {
    ...paginationSchemaProperties(),
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
    started_by: startedByFilterSchemaProperty()
  };
}

/**
 * Fluxo comum do `execute` das 4 listagens: chama a API, trata erro de API
 * (com gancho opcional para erros especificos, ex: 403), lista vazia, sucesso
 * e excecao.
 *
 * @param {object} opts
 * @param {() => Promise<object>} opts.request - chamada a API ja com os filtros
 * @param {number|string} opts.offset - pagina (exibida na mensagem de vazio)
 * @param {string} opts.noun - complemento de "Erro ao listar <noun>" (ex: 'meus chats')
 * @param {string} opts.emptyTitle - titulo em negrito da resposta vazia
 * @param {string} opts.emptyHint - frase em italico da resposta vazia
 * @param {(chats: object[], total?: number) => string} opts.render - formata a pagina
 * @param {(response: object) => (object|undefined)} [opts.onApiError] - trata erros especificos antes do generico
 * @returns {Promise<object>} resposta MCP
 */
async function executeChatList({ request, offset, noun, emptyTitle, emptyHint, render, onApiError }) {
  try {
    const response = await request();

    if (response.error) {
      const specific = onApiError?.(response);
      if (specific) return specific;
      return errorResponse(
        `**Erro ao listar ${noun}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    const chats = response.data || [];

    if (chats.length === 0) {
      return textResponse(
        `**${emptyTitle}**\n\n` +
        `**Página:** ${offset}\n\n` +
        `*${emptyHint}*`
      );
    }

    return textResponse(render(chats, response.total));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar ${noun}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

/**
 * Linhas comuns a todo item de listagem de chat, de "Cliente:" ate "Assumido em:".
 * Cada linha e indentada e termina em '\n'.
 *
 * @param {object} chat - chat cru da API
 * @param {string} verbosity - 'rich' | 'compact' (repassado a dateTime)
 * @returns {string}
 */
function chatItemBody(chat, verbosity) {
  const clientName = chat.client?.name || 'N/A';
  const department = chat.department?.name || 'N/A';
  const createdAt = dateTime(chat.created_at, verbosity);
  const lastClientMessage = dateTime(chat.last_client_message, verbosity);

  return (
    `   Cliente: ${clientName} | ${personLine(chat.requestor)}\n` +
    `   Departamento: ${department}\n` +
    ticketLine(chat.ticket) +
    `   Última msg do cliente em: ${lastClientMessage}\n` +
    `   Criado em: ${createdAt}\n` +
    assumedAtLine(chat.assumed_at, verbosity)
  );
}

/**
 * Renderiza a listagem completa (cabecalho, itens, paginacao com total, rodape)
 * respeitando o orcamento de saida via renderWithinBudget.
 *
 * @param {object[]} chats - itens da pagina
 * @param {object} opts
 * @param {string} opts.title - titulo em negrito do cabecalho
 * @param {(chat: object, index: number, verbosity: string) => string} opts.formatItem
 * @param {number|string} [opts.offset]
 * @param {number|string} [opts.limit]
 * @param {string} [opts.verbosity]
 * @param {number} [opts.total] - total do header x-total-items (quando houver)
 * @returns {string}
 */
function formatChatList(chats, { title, formatItem, offset, limit, verbosity, total }) {
  const v = verbosity || 'rich';
  const currentOffset = Number.parseInt(offset) || 1;
  const currentLimit = Number.parseInt(limit) || 20;

  const plural = chats.length === 1 ? '' : 's';
  const head = `**${title}** (${chats.length} encontrado${plural})\n\n`;
  const truncatedHead = (shown) => `**${title}** (${cutCountLabel(shown, total, chats.length, 'encontrados')})\n\n`;
  const parts = chats.map((chat, index) => formatItem(chat, index, v) + '\n');

  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: chats.length, total, unit: 'chats' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';

  return renderWithinBudget({
    head, truncatedHead, parts,
    pagination: paginationInfo, tail: sep + footerStr,
    offset: currentOffset, limit: currentLimit, unit: 'chats', verbosity: v, total
  });
}

/**
 * Item de listagem com linha de topo "Origem | Online/Offline | aguardando",
 * identico em list_inbox_chats e list_my_chats.
 */
function onlineWaitingChatItem(chat, index, verbosity) {
  const id = chat.id || 'N/A';
  const origin = originLabel(chat.origin);
  const online = chat.online ? 'Online' : 'Offline';

  return (
    `**${index + 1}. Chat #${id}**\n` +
    `   Origem: ${origin} | ${online} | ${waitingLabel(chat.waiting_answer)}\n` +
    chatItemBody(chat, verbosity)
  );
}

/**
 * Monta um slice completo de listagem de chats ({ name, schema, execute, format }).
 * Pos-review (2o ciclo) do PR #111: schema, formatChatsList e execute das 4
 * list*Chats.js eram o mesmo esqueleto variando so literais — o CPD do Sonar
 * normaliza literais e contava tudo como duplicado. Cada slice declara apenas o
 * que a diferencia.
 *
 * Ordem das propriedades do schema: paginacao + filtros comuns, `extraProperties`,
 * created_at_*, `trailingProperties`.
 *
 * @param {object} cfg
 * @param {string} cfg.name
 * @param {string} cfg.description
 * @param {object} [cfg.extraProperties]
 * @param {object} [cfg.trailingProperties]
 * @param {string} cfg.title - titulo do cabecalho da listagem
 * @param {(chat: object, index: number, verbosity: string) => string} cfg.formatItem
 * @param {string} cfg.apiMethod - metodo de TiFluxAPI (ex: 'listMyChats')
 * @param {(args: object) => object} [cfg.buildFilters] - default commonChatListFilters
 * @param {string} cfg.noun - ver executeChatList
 * @param {string} cfg.emptyTitle
 * @param {string} cfg.emptyHint
 * @param {(response: object) => (object|undefined)} [cfg.onApiError]
 * @returns {{ name: string, schema: object, execute: Function, format: Function }}
 */
function defineChatListSlice({
  name, description, extraProperties = {}, trailingProperties = {},
  title, formatItem, apiMethod, buildFilters = commonChatListFilters,
  noun, emptyTitle, emptyHint, onApiError
}) {
  const schema = {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        ...chatListFilterSchemaProperties(),
        ...extraProperties,
        ...createdAtFilterSchemaProperties(),
        ...trailingProperties
      },
      required: []
    }
  };

  function format(chats, offset, limit, verbosity, total) {
    return formatChatList(chats, { title, formatItem, offset, limit, verbosity, total });
  }

  async function execute(args, { api, verbosity }) {
    const filters = buildFilters(args);
    const { offset, limit } = filters;

    return executeChatList({
      request: () => api[apiMethod](filters),
      offset, noun, emptyTitle, emptyHint, onApiError,
      render: (chats, total) => format(chats, offset, limit, verbosity, total)
    });
  }

  return { name, schema, execute, format };
}

module.exports = {
  chatItemBody, formatChatList, chatListFilterSchemaProperties, executeChatList,
  onlineWaitingChatItem, defineChatListSlice
};

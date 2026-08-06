/**
 * Slice: list_chat_messages — lista as mensagens de um chat em ordem cronológica.
 *
 * Endpoint: GET /chats/{id}/messages (via api.listChatMessages).
 * Formatter em modo transcrição de conversa: cada mensagem vira uma linha de
 * diálogo com autor+papel pt-BR, hora, texto ou referência de anexo, reply e
 * resumo de entrega quando relevante.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const AUTHOR_ROLE = {
  client: 'Cliente',
  attendant: 'Atendente',
  system: 'Sistema',
  ai: 'IA'
};

const schema = {
  name: 'list_chat_messages',
  description: 'Listar as mensagens de um chat em ordem cronológica (transcrição da conversa). Retorna autor, horário, texto ou referência de anexo, reply e status de entrega quando disponível. Suporta paginação offset/limit.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID numérico do chat (aceita também string numérica — o handler faz parseInt)'
      },
      ...paginationSchemaProperties()
    },
    required: ['id']
  }
};

/**
 * Trunca uma string em `max` caracteres, anexando reticências quando corta.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max) {
  return str.length > max ? str.substring(0, max) + '...' : str;
}

/**
 * Menus interativos (WhatsApp list/button) chegam da API com o payload JSON cru
 * no campo `text`. Renderiza um resumo legível em vez de despejar o JSON na
 * transcrição. Retorna null quando o texto não é um payload estruturado.
 * @param {string} text
 * @returns {string|null}
 */
function renderInteractivePayload(text) {
  if (typeof text !== 'string' || !text.startsWith('{')) return null;
  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== 'object' || !payload.type) return null;
    const body = payload.body || payload.title;
    return body ? `[${payload.type}: ${truncate(String(body), 150)}]` : `[${payload.type}]`;
  } catch {
    return null;
  }
}

/**
 * Formata o papel do autor em pt-BR.
 * @param {object|null} author - { type, id, name }
 * @returns {string}
 */
function formatAuthorLabel(author) {
  if (!author) return 'Desconhecido';
  const role = AUTHOR_ROLE[author.type] || author.type || 'Desconhecido';
  const name = author.name ? ` (${author.name})` : '';
  return `${role}${name}`;
}

/**
 * Formata o resumo de status de entrega quando relevante.
 * Só exibe falha ou estados distintos de "apenas enviado".
 * @param {object|null} status - { sent, delivered, read, failed }
 * @returns {string} ex: " · lido", " · ⚠ falhou", "" (vazio se não relevante)
 */
function formatDeliveryStatus(status) {
  if (!status) return '';
  if (status.failed) return ' · ⚠ falhou';
  if (status.read) return ' · lido';
  if (status.delivered) return ' · entregue';
  // "apenas enviado" (status.sent) ou qualquer outro estado → sem sufixo
  return '';
}

/**
 * Formata uma mensagem individual como linha de transcrição.
 * @param {object} msg - item da API
 * @returns {string}
 */
function formatMessage(msg) {
  const authorLabel = formatAuthorLabel(msg.author);
  const time = msg.created_at || 'sem horário';

  // Conteúdo: texto ou referência de anexo
  let content;
  if (msg.media) {
    const contentType = msg.media.content_type || 'arquivo';
    // Sem caption, exibir só o content_type — repeti-lo entre parênteses seria redundante
    content = msg.media.caption
      ? `[anexo: ${truncate(msg.media.caption, 150)} (${contentType})]`
      : `[anexo: ${contentType}]`;
  } else if (msg.text) {
    content = renderInteractivePayload(msg.text) || truncate(msg.text, 150);
  } else {
    content = `[${msg.type || 'mensagem'}]`;
  }

  const delivery = formatDeliveryStatus(msg.status);

  let line = `**${authorLabel}** [${time}]${delivery}\n${content}`;

  // Reply/quote
  if (msg.quoted_message) {
    const quoted = msg.quoted_message;
    const quotedText = quoted.text
      ? (renderInteractivePayload(quoted.text) || truncate(quoted.text, 80))
      : `[${quoted.type || 'mensagem'}]`;
    line += `\n↩ resposta a: "${quotedText}"`;
  }

  return line + '\n';
}

/**
 * Formata a lista de mensagens como transcrição de conversa.
 * @param {Array} messages - array de mensagens da API
 * @param {number} offset - página atual
 * @param {number} limit - itens por página
 * @param {string} chatId - ID do chat (para título)
 * @param {string} verbosity
 * @returns {string}
 */
function formatTranscript(messages, offset, limit, chatId, verbosity) {
  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const v = verbosity || 'rich';

  const plural = messages.length === 1 ? 'mensagem' : 'mensagens';
  let text = `**Mensagens do Chat #${chatId}** (${messages.length} ${plural})\n\n`;

  messages.forEach((msg, idx) => {
    if (idx > 0) text += '\n---\n\n';
    text += formatMessage(msg);
  });

  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: messages.length, unit: 'mensagens' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return text + '\n' + paginationInfo + sep + footerStr;
}

async function execute(args, { api, verbosity }) {
  requireField(args, 'id');

  const id = parseInt(args.id);
  const offset = Math.max(1, parseInt(args.offset) || 1);
  const limit = Math.min(200, Math.max(1, args.limit != null ? parseInt(args.limit) : 20));

  try {
    const response = await api.listChatMessages(id, { offset, limit });

    if (response.error) {
      const code = response.status;

      if (code === 404) {
        return errorResponse(
          `**Chat não encontrado**\n\n` +
          `**ID:** ${id}\n\n` +
          `*Verifique se o ID ${id} está correto e se você tem acesso a este chat.*`
        );
      }
      if (code === 403) {
        return errorResponse(
          `**Sem permissão para acessar as mensagens deste chat**\n\n` +
          `**Código:** 403\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se sua conta tem permissão para acessar chats. Chats WhatsApp exigem licença WhatsApp ativa.*`
        );
      }
      if (code === 422) {
        return errorResponse(
          `**Parâmetros inválidos**\n\n` +
          `**Código:** 422\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique os parâmetros informados (id, offset, limit).*`
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
      return errorResponse(
        `**Erro ao listar mensagens do chat**\n\n` +
        `**ID:** ${id}\n` +
        `**Código:** ${code}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique sua conexão e configurações da API.*`
      );
    }

    const messages = response.data || [];

    if (messages.length === 0) {
      return textResponse(
        `**Nenhuma mensagem encontrada**\n\n` +
        `**Chat ID:** ${id} | **Página:** ${offset}\n\n` +
        `*Não há mensagens neste chat com os parâmetros informados.*`
      );
    }

    return textResponse(formatTranscript(messages, offset, limit, id, verbosity));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar mensagens do chat**\n\n` +
      `**ID:** ${id}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatTranscript };

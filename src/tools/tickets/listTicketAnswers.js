/**
 * Slice: list_ticket_answers — lista respostas (comunicacoes com cliente) de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/answers?offset&limit (via api.listTicketAnswers).
 * Formato da resposta: paginacao heuristica (data.length === limit ? proxima : ultima)
 * e truncamento do texto em 200 chars por resposta.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { stripHtml } = require('../_shared/markdown');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_ticket_answers',
  description: 'Listar respostas (comunicações com o cliente) de um ticket específico, com paginação',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket para listar as respostas'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

function formatAnswersList(ticketNumber, answers, offset, limit, verbosity) {
  let text = `**💬 Respostas do Ticket #${ticketNumber}** (${answers.length} encontradas)\n\n`;

  answers.forEach((answer, index) => {
    const answerId = answer.id || 'N/A';
    const authorName = answer.author || 'Autor não informado';
    const answerTime = answer.answer_time
      ? new Date(answer.answer_time).toLocaleString('pt-BR')
      : 'Data não informada';
    const origin = answer.answer_origin || 'origem não informada';

    let preview = '';
    if (answer.name) {
      preview = stripHtml(answer.name).trim();
      if (preview.length > 200) {
        preview = preview.substring(0, 200) + '...';
      }
    } else {
      preview = 'Conteúdo não disponível';
    }

    let filesInfo = '';
    if (answer.files_count && answer.files_count > 0) {
      filesInfo = ` 📎 ${answer.files_count} arquivo(s)`;
    }

    text += `**${index + 1}. Resposta #${answerId}**\n` +
            `   👤 **Autor:** ${authorName}\n` +
            `   📅 **Data:** ${answerTime}\n` +
            `   📡 **Origem:** ${origin}${filesInfo}\n` +
            `   💬 **Prévia:** ${preview}\n\n`;
  });

  // Espelha o clamp da camada de API (offset >= 1, limit 1..200): a heuristica
  // de "tem proxima pagina" so funciona comparando contra o limit efetivamente enviado.
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: answers.length, unit: 'respostas' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset = 1, limit = 20 } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.listTicketAnswers(ticket_number, offset, limit);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar respostas do ticket**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para visualizar as respostas.*`
      );
    }

    const answers = response.data || [];

    if (answers.length === 0) {
      return textResponse(
        `**💬 Nenhuma resposta encontrada**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Página:** ${offset}\n\n` +
        `*Este ticket ainda não possui respostas ou você chegou ao final da lista.*`
      );
    }

    return textResponse(formatAnswersList(ticket_number, answers, offset, limit, verbosity));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar respostas do ticket**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatAnswersList };

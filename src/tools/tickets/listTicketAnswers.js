/**
 * Slice: list_ticket_answers — lista respostas (comunicacoes com cliente) de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/answers?offset&limit (via api.listTicketAnswers).
 * Formato da resposta: paginacao heuristica (data.length === limit ? proxima : ultima)
 * e truncamento do texto em 200 chars por resposta.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber } = require('../_shared/validators');
const { htmlToMarkdown } = require('../_shared/htmlToMarkdown');
const { footer, pagination, dateTime } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_ticket_answers',
  description: 'Listar respostas (comunicações com o cliente) de um ticket específico, com paginação e total. A prévia de cada resposta sai em Markdown (sem HTML), cortada em 200 caracteres; a origem é rotulada (TiFlux Web, E-mail, Portal do cliente, API, Agente). Texto completo: get_ticket_answer.',
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

// Rotulo de answer_origin (H43). Valor fora do mapa sai como veio; null → "—".
// Exportado: get_ticket_answer usa o mesmo rotulo.
const ANSWER_ORIGIN_LABELS = {
  tiflux_web: 'TiFlux Web',
  email: 'E-mail',
  client_portal: 'Portal do cliente',
  api: 'API',
  agent: 'Agente'
};

function answerOriginLabel(origin) {
  if (origin === null || origin === undefined || origin === '') return '—';
  return Object.prototype.hasOwnProperty.call(ANSWER_ORIGIN_LABELS, origin) ? ANSWER_ORIGIN_LABELS[origin] : String(origin);
}

function formatAnswersList(ticketNumber, answers, offset, limit, verbosity, total) {
  const knownTotal = total !== undefined && total !== null && total !== answers.length;
  const countText = knownTotal ? `${answers.length} de ${total}` : `${answers.length}`;
  let text = `**💬 Respostas do Ticket #${ticketNumber}** (${countText} encontradas)\n\n`;

  answers.forEach((answer, index) => {
    const answerId = answer.id || 'N/A';
    const authorName = answer.author || 'Autor não informado';
    const answerTime = answer.answer_time ? dateTime(answer.answer_time, verbosity) : 'Data não informada';
    const origin = answerOriginLabel(answer.answer_origin);

    let preview = '';
    if (answer.name) {
      preview = htmlToMarkdown(String(answer.name)).trim();
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
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: answers.length, total, unit: 'respostas' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { offset = 1, limit = 20 } = args;

  const ticket_number = requireTicketNumber(args);

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

    return textResponse(formatAnswersList(ticket_number, answers, offset, limit, verbosity, response.total));
  } catch (error) {
    return toolErrorResponse(`Erro ao listar respostas do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao listar respostas do ticket', execute), format: formatAnswersList, answerOriginLabel };

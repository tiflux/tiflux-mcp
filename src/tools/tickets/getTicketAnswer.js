/**
 * Slice: get_ticket_answer — retorna o detalhe de uma resposta especifica de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/answers/{id} (via api.getTicketAnswer).
 * Retorna texto completo e lista de arquivos anexados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber, requirePathIdField } = require('../_shared/validators');
const { isTicketNotFoundDetail, notFoundDetailText, TICKET_NOT_FOUND_HINT } = require('../_shared/ticketSubresourceErrors');
const { stripHtml } = require('../_shared/markdown');
const { footer, dateTime } = require('../_shared/format');

const schema = {
  name: 'get_ticket_answer',
  description: 'Obter o detalhe completo de uma resposta específica de um ticket, incluindo os arquivos anexados com o ID de cada um (o file_id de delete_ticket_answer_file).',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket'
      },
      answer_id: {
        type: 'integer',
        description: 'ID da resposta a ser obtida'
      }
    },
    required: ['ticket_number', 'answer_id']
  }
};

async function execute(args, { api, verbosity }) {
  const ticket_number = requireTicketNumber(args);
  const answer_id = requirePathIdField(args, 'answer_id', { hint: 'Informe answer_id com o ID da resposta. Para achar o ID, use list_ticket_answers com o ticket_number.' });

  try {
    const response = await api.getTicketAnswer(ticket_number, answer_id);

    if (response.error) {
      if (response.status === 404) {
        // H22: o detail do 404 diz se faltou o ticket ou a resposta (ex.: "answer was deleted").
        if (isTicketNotFoundDetail(response)) {
          return errorResponse(
            `**🔍 Ticket #${ticket_number} não encontrado**\n\n` +
            `**Como resolver:** ${TICKET_NOT_FOUND_HINT}`
          );
        }
        const detail = notFoundDetailText(response);
        return errorResponse(
          `**❌ Resposta não encontrada**\n\n` +
          `**Ticket:** #${ticket_number}\n` +
          `**Resposta ID:** ${answer_id}\n` +
          (detail ? `**Detalhes:** ${detail}\n` : '') +
          `\n*A resposta informada não existe ou foi removida. Verifique o ID e tente novamente.*\n\n` +
          `**Como resolver:** Use list_ticket_answers com o ticket_number para ver os IDs das respostas.`
        );
      }
      return errorResponse(
        `**❌ Erro ao buscar resposta do ticket**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Resposta ID:** ${answer_id}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket e a resposta existem e se você tem permissão para visualizar.*`
      );
    }

    const answer = response.data;

    const authorName = answer.author || 'Autor não informado';
    const answerTime = answer.answer_time ? dateTime(answer.answer_time, verbosity) : 'Data não informada';
    const origin = answer.answer_origin || 'origem não informada';

    const content = answer.name
      ? stripHtml(answer.name).trim()
      : 'Conteúdo não disponível';

    let filesSection = '';
    if (Array.isArray(answer.files) && answer.files.length > 0) {
      filesSection = `\n\n**📎 Arquivos Anexados (${answer.files.length}):**\n`;
      answer.files.forEach((file, idx) => {
        const fileName = file.file_name || file.filename || `arquivo-${idx + 1}`;
        const fileSize = file.size ? ` (${Math.round(file.size / 1024)} KB)` : '';
        const fileType = file.content_type ? ` — ${file.content_type}` : '';
        // So renderiza como link clicavel URLs http(s) — file.url vem da API,
        // mas o conteudo pode ter origem no cliente (anexo de resposta).
        const fileUrl = file.url && /^https?:\/\//i.test(file.url)
          ? `\n   🔗 [Download](${file.url})`
          : '';
        // A4: o ID do anexo e o file_id aceito por delete_ticket_answer_file.
        const fileId = file.id !== undefined && file.id !== null ? ` (ID: ${file.id})` : '';
        filesSection += `\n${idx + 1}. **${fileName}**${fileId}${fileSize}${fileType}${fileUrl}`;
      });
    }

    return textResponse(
      `**💬 Resposta #${answer.id || answer_id} — Ticket #${ticket_number}**\n\n` +
      `👤 **Autor:** ${authorName}\n` +
      `📅 **Data:** ${answerTime}\n` +
      `📡 **Origem:** ${origin}\n\n` +
      `---\n\n${content}${filesSection}\n\n` +
      `${footer(verbosity)}`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar resposta #${answer_id} do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar resposta do ticket', execute) };

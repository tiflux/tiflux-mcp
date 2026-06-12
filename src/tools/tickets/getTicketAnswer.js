/**
 * Slice: get_ticket_answer — retorna o detalhe de uma resposta especifica de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/answers/{id} (via api.getTicketAnswer).
 * Retorna texto completo e lista de arquivos anexados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { stripHtml } = require('../_shared/markdown');

const schema = {
  name: 'get_ticket_answer',
  description: 'Obter o detalhe completo de uma resposta específica de um ticket, incluindo arquivos anexados',
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

async function execute(args, { api }) {
  const { ticket_number, answer_id } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'answer_id');

  try {
    const response = await api.getTicketAnswer(ticket_number, answer_id);

    if (response.error) {
      if (response.status === 404) {
        return errorResponse(
          `**❌ Resposta não encontrada**\n\n` +
          `**Ticket:** #${ticket_number}\n` +
          `**Resposta ID:** ${answer_id}\n\n` +
          `*A resposta informada não existe ou foi removida. Verifique o ID e tente novamente.*`
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
    const answerTime = answer.answer_time
      ? new Date(answer.answer_time).toLocaleString('pt-BR')
      : 'Data não informada';
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
        filesSection += `\n${idx + 1}. **${fileName}**${fileSize}${fileType}${fileUrl}`;
      });
    }

    return textResponse(
      `**💬 Resposta #${answer.id || answer_id} — Ticket #${ticket_number}**\n\n` +
      `👤 **Autor:** ${authorName}\n` +
      `📅 **Data:** ${answerTime}\n` +
      `📡 **Origem:** ${origin}\n\n` +
      `---\n\n${content}${filesSection}\n\n` +
      `*✅ Dados obtidos da API TiFlux em tempo real*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar resposta do ticket**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Resposta ID:** ${answer_id}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

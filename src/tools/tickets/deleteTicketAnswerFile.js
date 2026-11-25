/**
 * Slice: delete_ticket_answer_file — remove um arquivo anexado de uma resposta de ticket.
 *
 * Endpoint: DELETE /ticket_answers/{ticket_answer_id}/files/{id} (via api.deleteTicketAnswerFile).
 * Trata 204 (sucesso sem corpo), 403, 404.
 * Nota: usa path raiz /ticket_answers/{id}/files/{id} (nao aninhado em /tickets/).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requirePathIdField } = require('../_shared/validators');
const { notFoundDetailText } = require('../_shared/ticketSubresourceErrors');

const schema = {
  name: 'delete_ticket_answer_file',
  description: 'Remover um arquivo anexado de uma resposta de ticket no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      answer_id: { type: 'string', description: 'ID da resposta de onde o arquivo será removido (obtido via list_ticket_answers ou get_ticket_answer)' },
      file_id: { type: 'string', description: 'ID do arquivo anexado à resposta a ser removido: use get_ticket_answer, o ID está entre parênteses em cada anexo.' }
    },
    required: ['answer_id', 'file_id']
  }
};

async function execute(args, { api }) {
  const answer_id = requirePathIdField(args, 'answer_id', { hint: 'Informe answer_id com o ID da resposta. Para achar o ID, use list_ticket_answers com o ticket_number.' });
  const file_id = requirePathIdField(args, 'file_id', { hint: 'Informe file_id com o ID do arquivo anexado à resposta. Para achar o ID, use get_ticket_answer com o ticket_number e o answer_id: o ID está entre parênteses em cada anexo.' });

  try {
    const response = await api.deleteTicketAnswerFile(answer_id, file_id);

    if (response.error) {
      const byStatus = {
        403: {
          title: `**❌ Sem permissão para remover arquivo da resposta #${answer_id}**`,
          tail: '*Verifique se você tem permissão para gerenciar arquivos desta resposta.*'
        },
        404: {
          title: `**❌ Arquivo ou resposta não encontrado(s)**`,
          tail: '*Verifique se o arquivo existe e pertence a esta resposta (use get_ticket_answer para listar os arquivos).*'
        }
      };
      const status = response.status;
      // H22: no 404, o detail diz se faltou a resposta ou o arquivo.
      const detail = status === 404 ? notFoundDetailText(response) : null;
      if (detail && /TicketAnswerFile/i.test(detail)) {
        byStatus[404].title = `**❌ Arquivo não encontrado na resposta #${answer_id}**`;
      } else if (detail && /TicketAnswer\b|answer/i.test(detail)) {
        byStatus[404].title = `**❌ Resposta #${answer_id} não encontrada**`;
        byStatus[404].tail = '*Confira o ID da resposta com list_ticket_answers (com o ticket_number).*';
      }
      const variant = byStatus[status] || {
        title: `**❌ Erro ao remover arquivo da resposta #${answer_id}**`,
        tail: '*Verifique se a resposta e o arquivo existem e se você tem permissão.*'
      };
      const mensagem = byStatus[status] ? '' : `**Mensagem:** ${response.error}\n`;
      return errorResponse(
        `${variant.title}\n\n` +
        `**Resposta ID:** ${answer_id}\n` +
        `**Arquivo ID:** ${file_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        (detail ? `**Detalhes:** ${detail}\n` : '') +
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Arquivo removido com sucesso da resposta #${answer_id}!**\n\n` +
      `**Resposta ID:** ${answer_id}\n` +
      `**Arquivo ID:** ${file_id}\n\n` +
      `*✅ Arquivo removido via API TiFlux*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao remover arquivo da resposta #${answer_id}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao remover arquivo da resposta', execute) };

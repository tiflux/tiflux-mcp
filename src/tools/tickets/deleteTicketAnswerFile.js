/**
 * Slice: delete_ticket_answer_file — remove um arquivo anexado de uma resposta de ticket.
 *
 * Endpoint: DELETE /ticket_answers/{ticket_answer_id}/files/{id} (via api.deleteTicketAnswerFile).
 * Trata 204 (sucesso sem corpo), 403, 404.
 * Nota: usa path raiz /ticket_answers/{id}/files/{id} (nao aninhado em /tickets/).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'delete_ticket_answer_file',
  description: 'Remover um arquivo anexado de uma resposta de ticket no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      answer_id: { type: 'string', description: 'ID da resposta de onde o arquivo será removido (obtido via list_ticket_answers ou get_ticket_answer)' },
      file_id: { type: 'string', description: 'ID do arquivo anexado à resposta a ser removido. get_ticket_answer lista os anexos (nome, tamanho, link), mas não exibe o ID.' }
    },
    required: ['answer_id', 'file_id']
  }
};

async function execute(args, { api }) {
  const { answer_id, file_id } = args;

  requireField(args, 'answer_id', null, { hint: 'Informe answer_id com o ID da resposta. Para achar o ID, use list_ticket_answers com o ticket_number.' });
  requireField(args, 'file_id', null, { hint: 'Informe file_id com o ID do arquivo anexado à resposta. get_ticket_answer lista os anexos da resposta (nome, tamanho, link), mas não exibe o ID: se não tiver o ID, peça ao usuário.' });

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

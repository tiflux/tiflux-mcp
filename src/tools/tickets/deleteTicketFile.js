/**
 * Slice: delete_ticket_file — remove um arquivo anexado de um ticket.
 *
 * Endpoint: DELETE /tickets/{ticket_number}/files/{id} (via api.deleteTicketFile).
 * Trata 204 (sucesso sem corpo), 403, 404.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber, requirePathIdField } = require('../_shared/validators');
const { isTicketNotFoundDetail, notFoundDetailText, TICKET_NOT_FOUND_HINT } = require('../_shared/ticketSubresourceErrors');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const schema = {
  name: 'delete_ticket_file',
  description: 'Remover um arquivo anexado de um ticket no TiFlux.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket de onde o arquivo será removido (ex: "123", "456")'),
      file_id: { type: 'string', description: 'ID do arquivo a ser removido (obtido via get_ticket_files)' }
    },
    required: ['ticket_number', 'file_id']
  }
};

async function execute(args, { api }) {
  const ticket_number = requireTicketNumber(args);
  const file_id = requirePathIdField(args, 'file_id', { hint: 'Informe file_id com o ID do arquivo. Para achar o ID, use get_ticket_files com o ticket_number.' });

  try {
    const response = await api.deleteTicketFile(ticket_number, file_id);

    if (response.error) {
      // Titulo, mensagem-extra e cauda variam por status; o corpo "Arquivo ID"+"Código" e comum.
      const byStatus = {
        403: {
          title: `**❌ Sem permissão para remover arquivo do ticket #${ticket_number}**`,
          tail: '*Verifique se você tem permissão para gerenciar arquivos neste ticket.*'
        },
        404: {
          title: `**❌ Arquivo não encontrado no ticket #${ticket_number}**`,
          tail: '*Verifique se o arquivo existe e pertence a este ticket (use get_ticket_files para listar).*'
        }
      };
      const status = response.status;
      // H22: no 404, o detail diz se faltou o ticket ou o arquivo.
      const ticketMissing = status === 404 && isTicketNotFoundDetail(response);
      if (ticketMissing) {
        byStatus[404] = { title: `**❌ Ticket #${ticket_number} não encontrado**`, tail: `**Como resolver:** ${TICKET_NOT_FOUND_HINT}` };
      }
      // Ticket inexistente: o titulo ja diz tudo; o detail cru da API nao e repassado.
      const detail = status === 404 && !ticketMissing ? notFoundDetailText(response) : null;
      const variant = byStatus[status] || {
        title: `**❌ Erro ao remover arquivo do ticket #${ticket_number}**`,
        tail: '*Verifique se o ticket e o arquivo existem e se você tem permissão.*'
      };
      const mensagem = byStatus[status] ? '' : `**Mensagem:** ${response.error}\n`;
      return errorResponse(
        `${variant.title}\n\n` +
        `**Arquivo ID:** ${file_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        (detail ? `**Detalhes:** ${detail}\n` : '') +
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Arquivo removido com sucesso do ticket #${ticket_number}!**\n\n` +
      `**Arquivo ID:** ${file_id}\n\n` +
      `*✅ Arquivo removido via API TiFlux*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao remover arquivo do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao remover arquivo do ticket', execute) };

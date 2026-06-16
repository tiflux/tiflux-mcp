/**
 * Slice: delete_ticket_file — remove um arquivo anexado de um ticket.
 *
 * Endpoint: DELETE /tickets/{ticket_number}/files/{id} (via api.deleteTicketFile).
 * Trata 204 (sucesso sem corpo), 403, 404.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
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
  const { ticket_number, file_id } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'file_id');

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
        `\n${variant.tail}`
      );
    }

    return textResponse(
      `**✅ Arquivo removido com sucesso do ticket #${ticket_number}!**\n\n` +
      `**Arquivo ID:** ${file_id}\n\n` +
      `*✅ Arquivo removido via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao remover arquivo do ticket #${ticket_number}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

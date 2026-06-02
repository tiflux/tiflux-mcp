/**
 * Slice: get_ticket_files — lista arquivos anexados a um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/files (via api.fetchTicketFiles).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');
const { formatFileSize } = require('../_shared/markdown');

const schema = {
  name: 'get_ticket_files',
  description: 'Buscar arquivos anexados a um ticket específico no TiFlux',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para buscar os arquivos anexados (ex: "123", "456")' }
    },
    required: ['ticket_number']
  }
};

function formatFilesList(ticketNumber, files) {
  let filesText = `**📎 Arquivos do Ticket #${ticketNumber}** (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'})\n\n`;

  files.forEach((file, index) => {
    filesText += `**${index + 1}. ${file.name || 'Sem nome'}**\n`;
    filesText += `   • **ID:** ${file.id}\n`;
    filesText += `   • **Tipo:** ${file.content_type || 'N/A'}\n`;
    filesText += `   • **Tamanho:** ${formatFileSize(file.size || 0)}\n`;
    filesText += `   • **URL:** ${file.url || 'N/A'}\n`;
    filesText += `   • **Criado em:** ${file.created_at || 'N/A'}\n`;
    filesText += `   • **Criado por:** ${file.created_by?.name || 'N/A'}\n\n`;
  });

  return filesText + `*✅ Dados obtidos da API TiFlux em tempo real*`;
}

async function execute(args, { api }) {
  const { ticket_number } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.fetchTicketFiles(ticket_number);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao buscar arquivos do ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
      );
    }

    const files = response.data || [];

    if (files.length === 0) {
      return textResponse(
        `**📎 Arquivos do Ticket #${ticket_number}**\n\n` +
        `*Nenhum arquivo anexado neste ticket.*\n\n` +
        `*✅ Dados obtidos da API TiFlux em tempo real*`
      );
    }

    return textResponse(formatFilesList(ticket_number, files));
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao buscar arquivos do ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatFilesList };

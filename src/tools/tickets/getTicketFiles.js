/**
 * Slice: get_ticket_files — lista arquivos anexados a um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/files (via api.fetchTicketFiles), paginado.
 * Shape real do item (blueprint): { id, file_name, content_type, size, url } — nao ha
 * data nem autor do upload (H6). A API pagina em 20 por padrao; o slice pede 200 por
 * padrao e mostra "N de TOTAL" pelo X-Total-Items (H7). URLs assinadas sao longas:
 * a lista passa pelo teto de resposta (renderWithinBudget).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField, normalizeTicketNumber } = require('../_shared/validators');
const { formatFileSize } = require('../_shared/markdown');
const { footer, pagination, renderWithinBudget, cutCountLabel } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 200;

const schema = {
  name: 'get_ticket_files',
  description: 'Buscar arquivos anexados a um ticket específico no TiFlux: nome, tipo, tamanho e URL de cada arquivo. Paginado (padrão: 200 por página) e com o total de arquivos do ticket ("N de TOTAL").',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para buscar os arquivos anexados (ex: "123", "456"; aceita "#123")' },
      ...paginationSchemaProperties(),
      limit: { type: 'number', description: 'Arquivos por página (padrão: 200, máximo: 200). Respostas muito longas (URLs assinadas) são cortadas no limite de um arquivo, com offset/limit exatos para continuar.' }
    },
    required: ['ticket_number']
  }
};

function fileBlock(file, index) {
  return `**${index + 1}. ${file.file_name || 'Sem nome'}**\n` +
    `   • **ID:** ${file.id}\n` +
    `   • **Tipo:** ${file.content_type || 'N/A'}\n` +
    `   • **Tamanho:** ${formatFileSize(file.size || 0)}\n` +
    `   • **URL:** ${file.url || 'N/A'}\n\n`;
}

function countLabel(count, total) {
  const word = (n) => (n === 1 ? 'arquivo' : 'arquivos');
  if (typeof total === 'number' && total !== count) return `${count} de ${total} ${word(total)}`;
  return `${count} ${word(count)}`;
}

function formatFilesList(ticketNumber, files, verbosity, { offset = 1, limit = DEFAULT_LIMIT, total } = {}) {
  const v = verbosity || 'rich';
  const footerStr = footer(v);
  return renderWithinBudget({
    head: `**📎 Arquivos do Ticket #${ticketNumber}** (${countLabel(files.length, total)})\n\n`,
    truncatedHead: (shown) => `**📎 Arquivos do Ticket #${ticketNumber}** (${cutCountLabel(shown, total, files.length, 'arquivos')})\n\n`,
    parts: files.map(fileBlock),
    pagination: pagination({ offset, limit, count: files.length, total, unit: 'arquivos' }, v),
    tail: footerStr ? `\n${footerStr}` : '',
    offset, limit, unit: 'arquivos', verbosity: v, total
  });
}

async function execute(args, { api, verbosity }) {
  requireField(args, 'ticket_number');
  const ticket_number = normalizeTicketNumber(args.ticket_number);
  if (!ticket_number) {
    return errorResponse(
      `**❌ Número de ticket inválido: "${args.ticket_number}"**\n\n` +
      `*Informe só o número do ticket (ex: "123" ou "#123").*`
    );
  }

  const offset = Math.max(1, Number.parseInt(args.offset, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(args.limit, 10) || DEFAULT_LIMIT));

  try {
    const response = await api.fetchTicketFiles(ticket_number, { offset, limit });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao buscar arquivos do ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
      );
    }

    const files = response.data || [];

    if (files.length === 0) {
      const beyond = offset > 1 && typeof response.total === 'number' && response.total > 0
        ? `*Nenhum arquivo nesta página (offset ${offset}); o ticket tem ${response.total} no total.*`
        : `*Nenhum arquivo anexado neste ticket.*`;
      return textResponse(
        `**📎 Arquivos do Ticket #${ticket_number}**\n\n` +
        `${beyond}\n\n` +
        `${footer(verbosity)}`
      );
    }

    return textResponse(formatFilesList(ticket_number, files, verbosity, { offset, limit, total: response.total }));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar arquivos do ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatFilesList };

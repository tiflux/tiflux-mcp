/**
 * Slice: list_internal_communications — lista comunicacoes internas de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/internal_communications (via api.listInternalCommunications).
 * Formato da resposta: paginacao heuristica (data.length === limit ? proxima : ultima)
 * e truncamento HTML em 150 chars por comunicacao.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_internal_communications',
  description: 'Listar comunicações internas existentes em um ticket específico',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket para listar as comunicações internas'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

function formatCommunicationsList(ticket_number, communications, offset, limit, verbosity) {
  let text = `**📋 Comunicações Internas do Ticket #${ticket_number}** (${communications.length} encontradas)\n\n`;

  communications.forEach((comm, index) => {
    const commId = comm.id || 'N/A';
    const authorName = comm.user?.name || 'Autor não informado';
    const createdAt = comm.created_at
      ? new Date(comm.created_at).toLocaleString('pt-BR')
      : 'Data não informada';

    let content = '';
    if (comm.text) {
      content = comm.text.replace(/<[^>]*>/g, '').trim();
      if (content.length > 150) {
        content = content.substring(0, 150) + '...';
      }
    } else {
      content = 'Conteúdo não disponível';
    }

    let filesInfo = '';
    if (comm.files_count && comm.files_count > 0) {
      filesInfo = ` 📎 ${comm.files_count} arquivo(s)`;
    }

    text += `**${index + 1}. Comunicação #${commId}**\n` +
            `   👤 **Autor:** ${authorName}\n` +
            `   📅 **Data:** ${createdAt}${filesInfo}\n` +
            `   💬 **Conteúdo:** ${content}\n\n`;
  });

  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: communications.length, unit: 'comunicações' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset = 1, limit = 20 } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.listInternalCommunications(ticket_number, offset, limit);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar comunicações internas**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para visualizar comunicações internas.*`
      );
    }

    const communications = response.data || [];

    if (communications.length === 0) {
      return textResponse(
        `**📋 Nenhuma comunicação interna encontrada**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Página:** ${offset}\n\n` +
        `*Este ticket ainda não possui comunicações internas ou você chegou ao final da lista.*`
      );
    }

    return textResponse(formatCommunicationsList(ticket_number, communications, offset, limit, verbosity));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar comunicações internas**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatCommunicationsList };

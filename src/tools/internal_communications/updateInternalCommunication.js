/**
 * Slice: update_internal_communication — edita o texto de uma comunicacao interna.
 *
 * Endpoint: PUT /tickets/{ticket_number}/internal_communications/{id} (via api.updateInternalCommunication).
 * Aplica markdownToHtml(text) antes de enviar (paridade com create_internal_communication).
 * 403 = apenas o autor pode editar.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const { stripHtml } = require('../_shared/markdown');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const schema = {
  name: 'update_internal_communication',
  description: 'Atualizar o texto de uma comunicação interna existente em um ticket no TiFlux. Apenas o autor da comunicação pode editá-la.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket onde está a comunicação interna (ex: "123", "456")'),
      communication_id: { type: 'string', description: 'ID da comunicação interna a ser atualizada (obtido via list_internal_communications ou get_internal_communication)' },
      text: {
        type: 'string',
        description: 'Novo conteúdo da comunicação interna. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.'
      }
    },
    required: ['ticket_number', 'communication_id', 'text']
  }
};

async function execute(args, { api }) {
  const { ticket_number, communication_id, text } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'communication_id');
  requireField(args, 'text');

  try {
    // Converter Markdown → HTML antes de enviar à API v2 (paridade com create)
    const textHtml = markdownToHtml(text);
    const response = await api.updateInternalCommunication(ticket_number, communication_id, textHtml);

    if (response.error) {
      const byStatus = {
        403: {
          title: `**❌ Sem permissão para editar comunicação interna #${communication_id}**`,
          tail: '*Apenas o autor da comunicação pode editá-la. Verifique se você criou esta comunicação.*'
        },
        404: {
          title: `**❌ Comunicação interna não encontrada no ticket #${ticket_number}**`,
          tail: '*Verifique se a comunicação existe e pertence a este ticket (use list_internal_communications para listar).*'
        }
      };
      const status = response.status;
      const variant = byStatus[status] || {
        title: `**❌ Erro ao atualizar comunicação interna #${communication_id}**`,
        tail: '*Verifique se o ticket e a comunicação existem e se você tem permissão.*'
      };
      const mensagem = byStatus[status] ? '' : `**Mensagem:** ${response.error}\n`;
      return errorResponse(
        `${variant.title}\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Comunicação ID:** ${communication_id}\n` +
        `**Código:** ${status}\n` +
        mensagem +
        `\n${variant.tail}`
      );
    }

    const communication = response.data;
    const cleanedText = communication && communication.text ? stripHtml(communication.text) : '';
    const communicationText = cleanedText ? cleanedText.substring(0, 200) : 'Comunicação atualizada';
    // '...' só quando houve truncamento real (texto limpo original > 200 chars)
    const truncated = cleanedText.length > 200 ? '...' : '';

    return textResponse(
      `**✅ Comunicação interna atualizada com sucesso!**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**ID da Comunicação:** ${communication_id}\n` +
      `**Conteúdo:** ${communicationText}${truncated}\n\n` +
      `*✅ Comunicação interna atualizada via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar comunicação interna #${communication_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

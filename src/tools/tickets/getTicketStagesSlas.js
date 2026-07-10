/**
 * Slice: get_ticket_stages_slas — lista historico de passagens do ticket
 * pelos estagios da mesa com duracao, expiracao e status de SLA.
 *
 * Endpoint: GET /tickets/{ticket_number}/stages-slas (via api.fetchTicketStagesSlas).
 * Tickets em mesas sem SLA ativo retornam lista vazia.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'get_ticket_stages_slas',
  description: 'Listar o histórico de passagens do ticket pelos estágios da mesa, com duração no expediente, expiração e status do SLA por estágio. Retorna apenas tickets de mesas com SLA ativo (mesas sem SLA retornam lista vazia). Suporta paginação.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para buscar o histórico de estágios e SLAs (ex: "123", "456")' },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset, limit } = args || {};
  const v = verbosity || 'rich';

  requireField(args, 'ticket_number');

  try {
    const filters = {};
    if (offset !== undefined) filters.offset = offset;
    if (limit !== undefined) filters.limit = limit;

    const response = await api.fetchTicketStagesSlas(ticket_number, filters);

    if (response.error) {
      const status = response.status;
      const errorCode = response.data?.error_code;

      // 403 com error codes especificos
      if (status === 403 && errorCode === 40301) {
        return errorResponse(
          `**🚫 Sem permissão para acessar estágios/SLAs do ticket #${ticket_number}**\n\n` +
          `*Seu usuário não tem permissão para esta operação. Contate o administrador.*`
        );
      }

      if (status === 403 && errorCode === 40304) {
        return errorResponse(
          `**🔒 Sem licença de Tickets**\n\n` +
          `*Seu plano TiFlux não possui licença ativa para o módulo de Tickets.*`
        );
      }

      if (status === 404) {
        return errorResponse(
          `**🔍 Ticket #${ticket_number} não encontrado**\n\n` +
          `*Verifique se o número do ticket está correto.*`
        );
      }

      return errorResponse(
        `**❌ Erro ao buscar estágios/SLAs do ticket #${ticket_number}**\n\n` +
        `**Código:** ${status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para acessá-lo.*`
      );
    }

    const items = Array.isArray(response.data) ? response.data : [];

    if (items.length === 0) {
      return textResponse(
        `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}**\n\n` +
        `*Nenhum registro encontrado.*\n\n` +
        `Possíveis motivos:\n` +
        `• Ticket pertence a uma mesa **sem SLA ativo** (durações por estágio só são registradas em mesas com SLA configurado).\n` +
        `• Página solicitada está além do total de registros.\n\n` +
        `${footer(v)}`
      );
    }

    let text = `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}** (${items.length} ${items.length === 1 ? 'registro' : 'registros'})\n\n`;

    items.forEach((item, index) => {
      const stage = item.stage?.name || 'N/A';
      const desk = item.desk?.name || 'N/A';
      const duration = item.duration_in_expedient || 'N/A';
      const slaIcon = item.sla_attended ? '✅' : '❌';
      const slaText = item.sla_attended ? 'Sim' : 'Não';
      const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : 'N/A';
      const expiration = item.expiration ? new Date(item.expiration).toLocaleString('pt-BR') : 'N/A';
      const attendedAt = item.attended_at ? new Date(item.attended_at).toLocaleString('pt-BR') : '—';
      const attendedBy = item.attended_by?.name || '—';
      const createdBy = item.created_by?.name || 'N/A';

      text += `**${index + 1}. Estágio:** ${stage}\n`;
      text += `   • **Mesa:** ${desk}\n`;
      text += `   • **Duração no expediente:** ${duration}\n`;
      text += `   • **SLA atendido:** ${slaIcon} ${slaText}\n`;
      text += `   • **Expiração do SLA:** ${expiration}\n`;
      text += `   • **Entrada no estágio:** ${createdAt} (por ${createdBy})\n`;
      text += `   • **Atendido em:** ${attendedAt} (por ${attendedBy})\n\n`;
    });

    const currentOffset = offset || 1;
    const currentLimit = limit || 20;
    text += pagination({ offset: currentOffset, limit: currentLimit, count: items.length, unit: 'registros' }, v);
    const footerStr = footer(v);
    if (footerStr) text += `\n${footerStr}`;

    return textResponse(text);
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar estágios/SLAs do ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

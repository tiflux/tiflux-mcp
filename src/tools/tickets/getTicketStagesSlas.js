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
const { footer, pagination, dateTime, durationMin, row } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');

const RESOURCE_LABEL = 'estágios/SLAs';

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
      return ticketSubresourceErrorResponse(response, ticket_number, { resourceLabel: RESOURCE_LABEL });
    }

    const items = Array.isArray(response.data) ? response.data : [];

    if (items.length === 0) {
      if (v === 'compact') {
        return textResponse(
          `Estágios/SLA #${ticket_number}: 0 registros (mesa sem SLA ativo, ou página além do total).`
        );
      }
      return textResponse(
        `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}**\n\n` +
        `*Nenhum registro encontrado.*\n\n` +
        `Possíveis motivos:\n` +
        `• Ticket pertence a uma mesa **sem SLA ativo** (durações por estágio só são registradas em mesas com SLA configurado).\n` +
        `• Página solicitada está além do total de registros.\n\n` +
        `${footer(v)}`
      );
    }

    if (v === 'compact') {
      const currentOffset = offset || 1;
      const currentLimit = limit || 20;

      // A API v2 nao garante formato de duration_in_expedient (a Swagger exemplifica "00:00",
      // fixtures usam "01:00:00" e "2h 15m"). So converte para minutos se TODOS os valores
      // nao-nulos casarem; senao emite a string crua — parsear as cegas corromperia em silencio.
      const durations = items.map(item => item.duration_in_expedient);
      const parsed = durations.map(d => (d === null || d === undefined || d === '' ? null : durationMin(d)));
      const allParsable = durations.every((d, i) => d === null || d === undefined || d === '' || parsed[i] !== null);

      let text = `Estágios/SLA #${ticket_number} (${items.length}) · ${allParsable ? 'dur em min' : 'dur bruta'} · datas ISO UTC\n`;
      text += `estagio|mesa|${allParsable ? 'min' : 'dur'}|sla|expira|entrou|entrou_por|atendido|atendido_por\n`;

      items.forEach((item, index) => {
        text += `${row([
          item.stage?.name,
          item.desk?.name,
          allParsable ? parsed[index] : item.duration_in_expedient,
          item.sla_attended === true,
          dateTime(item.expiration, v),
          dateTime(item.created_at, v),
          item.created_by?.name,
          dateTime(item.attended_at, v),
          item.attended_by?.name
        ])}\n`;
      });

      text += pagination({ offset: currentOffset, limit: currentLimit, count: items.length, unit: 'registros' }, v);
      return textResponse(text);
    }

    let text = `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}** (${items.length} ${items.length === 1 ? 'registro' : 'registros'})\n\n`;

    items.forEach((item, index) => {
      const stage = item.stage?.name || 'N/A';
      const desk = item.desk?.name || 'N/A';
      const duration = item.duration_in_expedient || 'N/A';
      const slaIcon = item.sla_attended ? '✅' : '❌';
      const slaText = item.sla_attended ? 'Sim' : 'Não';
      const createdAt = item.created_at ? dateTime(item.created_at, v) : 'N/A';
      const expiration = item.expiration ? dateTime(item.expiration, v) : 'N/A';
      const attendedAt = item.attended_at ? dateTime(item.attended_at, v) : '—';
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

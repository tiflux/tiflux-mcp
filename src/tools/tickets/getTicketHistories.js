/**
 * Slice: get_ticket_histories — lista o historico de eventos (timeline) de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/histories?offset&limit&history_of&type_id_attr&operation
 * (via api.getTicketHistories).
 * Filtros opcionais: history_of, type_id_attr, operation (so valido com history_of=1).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination } = require('../_shared/format');

const schema = {
  name: 'get_ticket_histories',
  description: 'Listar o histórico de eventos (timeline) de um ticket, com diff de campos alterados. Filtros opcionais: history_of (área), type_id_attr, operation (só com history_of=1 para apontamentos)',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'integer',
        description: 'Número do ticket para buscar o histórico'
      },
      offset: {
        type: 'number',
        description: 'Número da página (padrão: 1)'
      },
      limit: {
        type: 'number',
        description: 'Eventos por página (padrão: 20, máximo: 200)'
      },
      history_of: {
        type: 'integer',
        description: 'Filtrar por área do ticket (ex: 1 = apontamentos)'
      },
      type_id_attr: {
        type: 'integer',
        description: 'Filtrar por tipo de atributo'
      },
      operation: {
        type: 'integer',
        description: 'Filtrar por tipo de operação — somente válido quando history_of=1'
      }
    },
    required: ['ticket_number']
  }
};

// O Swagger nao garante valores escalares em old_values/new_values; sem isto,
// um objeto viraria "[object Object]" no diff.
// Always-on: limite de ~200 chars para evitar blowup em objetos aninhados profundos.
const DIFF_VALUE_MAX = 200;
function formatDiffValue(value) {
  if (value === null || value === undefined) return '—';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > DIFF_VALUE_MAX ? str.substring(0, DIFF_VALUE_MAX) + '...' : str;
}

function formatHistoriesList(ticketNumber, events, offset, limit, verbosity) {
  let text = `**📋 Histórico do Ticket #${ticketNumber}** (${events.length} eventos)\n\n`;

  events.forEach((event, index) => {
    const eventId = event.id || 'N/A';
    const action = event.action || 'ação não informada';
    const userName = event.user?.name || 'Usuário não informado';
    const createdAt = event._created_at
      ? new Date(event._created_at).toLocaleString('pt-BR')
      : 'Data não informada';
    const eventType = event._type || '';
    const eventOp = event._operation || '';

    let typeInfo = '';
    if (eventType || eventOp) {
      const opSuffix = eventOp ? `, op: ${eventOp}` : '';
      typeInfo = ` (tipo: ${eventType}${opSuffix})`;
    }

    let diffSection = '';
    if (event.changes && Array.isArray(event.changes.fields) && event.changes.fields.length > 0) {
      diffSection = '\n   📝 **Alterações:**\n';
      event.changes.fields.forEach(field => {
        const oldVal = formatDiffValue(event.changes.old_values?.[field]);
        const newVal = formatDiffValue(event.changes.new_values?.[field]);
        diffSection += `      • **${field}:** \`${oldVal}\` → \`${newVal}\`\n`;
      });
    }

    text += `**${index + 1}. Evento #${eventId}**${typeInfo}\n` +
            `   👤 **Usuário:** ${userName}\n` +
            `   📅 **Data:** ${createdAt}\n` +
            `   🔔 **Ação:** ${action}${diffSection}\n`;
  });

  // Espelha o clamp da camada de API (offset >= 1, limit 1..200): a heuristica
  // de "tem proxima pagina" so funciona comparando contra o limit efetivamente enviado.
  const currentOffset = Math.max(1, Number.parseInt(offset) || 1);
  const currentLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  // verbosity e opcional (testes legados passam so 2 args); default 'rich'
  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: events.length, unit: 'eventos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { ticket_number, offset = 1, limit = 20, history_of, type_id_attr, operation } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.getTicketHistories(ticket_number, {
      offset,
      limit,
      history_of,
      type_id_attr,
      operation
    });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao buscar histórico do ticket**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para visualizar o histórico.*`
      );
    }

    const events = response.data || [];

    if (events.length === 0) {
      return textResponse(
        `**📋 Nenhum evento encontrado no histórico**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Página:** ${offset}\n\n` +
        `*Não há eventos de histórico para este ticket com os filtros informados.*`
      );
    }

    return textResponse(formatHistoriesList(ticket_number, events, offset, limit, verbosity));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao buscar histórico do ticket**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatHistoriesList };

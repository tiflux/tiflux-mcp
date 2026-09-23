/**
 * Slice: list_appointments — lista apontamentos de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/appointments (via api.listAppointments).
 * Suporta filtros opcionais user_id/start_date/end_date + paginacao offset/limit.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination, currencyBRL, renderWithinBudget, listVerbosity, cutCountLabel } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { ATTENDANCE_LABELS, ATTENDANCE_KIND_LABELS } = require('./appointmentFilters');
const { compactValorizationLine } = require('./valorizationCompact');

const schema = {
  name: 'list_appointments',
  description: 'Listar apontamentos (registros de horas trabalhadas) de um ticket específico com filtros opcionais. Quando disponível, inclui informações de valorização (tipo de atendimento, contrato ou serviço avulso, deslocamento, valor cobrado) e geolocalização.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket para listar os apontamentos'
      },
      user_id: {
        type: 'number',
        description: 'Filtrar pelo ID do usuário que realizou o apontamento (opcional)'
      },
      start_date: {
        type: 'string',
        description: 'Retorna apontamentos realizados a partir dessa data no formato YYYY-MM-DD (opcional)'
      },
      end_date: {
        type: 'string',
        description: 'Retorna apontamentos realizados até essa data no formato YYYY-MM-DD (opcional)'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

// Bloco de valorização do apontamento (rich): atendimento, tipo, deslocamento, flags e valor.
function formatValorizationBlock(val) {
  const attendanceLabel = ATTENDANCE_LABELS[val.attendance] || val.attendance || 'N/A';
  const isContract = val.attendance_kind === 'Contract';
  // Sem default silencioso: tipo desconhecido mostra o valor cru da API, nunca "Avulso" indevido
  const kindLabel = ATTENDANCE_KIND_LABELS[val.attendance_kind] || val.attendance_kind || 'N/A';
  const kindName = isContract
    ? (val.contract?.name || '')
    : (val.loose_service?.name || '');
  const kindDisplay = kindName ? `${kindLabel} — ${kindName}` : kindLabel;

  let text = `   💰 **Valorização:**\n`;
  text += `      • Atendimento: ${attendanceLabel}\n`;
  text += `      • Tipo: ${kindDisplay}\n`;

  if (val.shift) {
    text += `      • 🚗 Deslocamento: ${val.shift.name || 'N/A'} (${currencyBRL(val.shift.value)})\n`;
  }
  if (val.shift_owner_ticket) {
    const sot = val.shift_owner_ticket;
    text += `      • 🚗 Deslocamento de: #${sot.ticket_number || 'N/A'} — ${sot.title || 'N/A'}\n`;
  }
  if (val.guarantee === true) {
    text += `      • 🛡️ Garantia\n`;
  }
  if (val.manual_value === true) {
    text += `      • ✋ Valor manual\n`;
  }
  text += `      • 💵 Valor: ${currencyBRL(val.value)}\n`;
  return text;
}

function formatAppointmentItem(appt, index, verbosity) {
  const apptId = appt.id || 'N/A';
  const apptDate = appt.date || 'Data não informada';
  const initTime = appt.init_time || '??:??';
  const endTime = appt.end_time || '??:??';
  const userName = appt.user?.name || 'Atendente não informado';
  const clientName = appt.client?.name || null;

  let desc = appt.description || 'Sem descrição';
  if (desc.length > 150) {
    desc = desc.substring(0, 150) + '...';
  }

  let text = `**${index + 1}. Apontamento #${apptId}**\n` +
    `   📅 **Data:** ${apptDate}\n` +
    `   ⏰ **Horário:** ${initTime} - ${endTime}\n` +
    `   👤 **Atendente:** ${userName}\n`;

  if (clientName) {
    text += `   🏢 **Cliente:** ${clientName}\n`;
  }

  text += `   💬 **Descrição:** ${desc}\n`;

  // external_user_name — campo raiz do apontamento, fora do bloco de valorização
  if (appt.external_user_name) {
    text += `   👷 **Executor externo:** ${appt.external_user_name}\n`;
  }

  // Valorização — só quando valorization é objeto não-nulo. `compact` remove formatação,
  // nunca dado: sai em 1 linha (mesmas células do list_appointments_global).
  const val = appt.valorization;
  if (val !== null && val !== undefined && typeof val === 'object') {
    text += verbosity === 'compact' ? compactValorizationLine(val) : formatValorizationBlock(val);
  }

  // Localizações — uma linha por entrada, só se array não-vazio
  const locations = appt.locations;
  if (Array.isArray(locations) && locations.length > 0) {
    locations.forEach(loc => {
      const lat = loc.latitude ?? 'N/A';
      const lon = loc.longitude ?? 'N/A';
      text += `   📍 **Localização:** ${lat}, ${lon}\n`;
    });
  }

  return text + '\n';
}

function formatAppointmentsList(ticket_number, appointments, offset, limit, verbosity, autoCompactNotice = '') {
  const head = `**📋 Apontamentos do Ticket #${ticket_number}** (${appointments.length} encontrados)\n\n`;
  const truncatedHead = (shown) => `**📋 Apontamentos do Ticket #${ticket_number}** (${cutCountLabel(shown, null, appointments.length, 'encontrados')})\n\n`;
  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const v = verbosity || 'rich';
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: appointments.length, unit: 'apontamentos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return renderWithinBudget({
    head,
    truncatedHead,
    parts: appointments.map((appt, index) => formatAppointmentItem(appt, index, verbosity)),
    pagination: paginationInfo,
    tail: `${sep}${footerStr}${autoCompactNotice}`,
    offset: currentOffset,
    limit: currentLimit,
    unit: 'apontamentos',
    verbosity: v
  });
}

async function execute(args, { api, verbosity: ctxVerbosity, verbosityExplicit }) {
  const { ticket_number, user_id, start_date, end_date, offset = 1, limit = 20 } = args;

  requireField(args, 'ticket_number');

  try {
    const response = await api.listAppointments(ticket_number, {
      user_id,
      start_date,
      end_date,
      offset,
      limit
    });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar apontamentos**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para visualizar apontamentos.*`
      );
    }

    const appointments = response.data || [];

    if (appointments.length === 0) {
      return textResponse(
        `**📋 Nenhum apontamento encontrado**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Página:** ${offset}\n\n` +
        `*Este ticket ainda não possui apontamentos ou você chegou ao final da lista.*`
      );
    }

    // F4: sem verbosidade explicita e com > 50 itens na pagina, sai em compact (com aviso).
    const { verbosity, notice: autoCompactNotice } = listVerbosity({ verbosity: ctxVerbosity, verbosityExplicit }, appointments.length);
    return textResponse(formatAppointmentsList(ticket_number, appointments, offset, limit, verbosity, autoCompactNotice));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar apontamentos**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatAppointmentsList };

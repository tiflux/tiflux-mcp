/**
 * Slice: list_appointments — lista apontamentos de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/appointments (via api.listAppointments).
 * Suporta filtros opcionais user_id/start_date/end_date + paginacao offset/limit.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

/**
 * Formata um valor monetário string (ex: "170.05") como "R$ 170,05".
 * Para ausente/null/vazio, retorna "N/A".
 * Para string não-numérica, retorna a própria string (passthrough — preserva o dado original).
 */
function formatBRL(valueStr) {
  if (valueStr === null || valueStr === undefined || valueStr === '') return 'N/A';
  const num = Number(valueStr);
  if (!Number.isFinite(num)) return valueStr;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

const ATTENDANCE_LABELS = {
  External: 'Externo',
  Remote: 'Remoto',
  Internal: 'Interno'
};

const ATTENDANCE_KIND_LABELS = {
  Contract: 'Contrato',
  Loose: 'Avulso'
};

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
      offset: {
        type: 'number',
        description: 'Número da página a ser retornada (padrão: 1)'
      },
      limit: {
        type: 'number',
        description: 'Número de apontamentos por página (padrão: 20, máximo: 200)'
      }
    },
    required: ['ticket_number']
  }
};

function formatAppointmentsList(ticket_number, appointments, offset, limit) {
  let text = `**📋 Apontamentos do Ticket #${ticket_number}** (${appointments.length} encontrados)\n\n`;

  appointments.forEach((appt, index) => {
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

    text += `**${index + 1}. Apontamento #${apptId}**\n` +
            `   📅 **Data:** ${apptDate}\n` +
            `   ⏰ **Horário:** ${initTime} - ${endTime}\n` +
            `   👤 **Atendente:** ${userName}\n`;

    if (clientName) {
      text += `   🏢 **Cliente:** ${clientName}\n`;
    }

    text += `   💬 **Descrição:** ${desc}\n`;

    // Bloco de valorização — só renderiza quando valorization é objeto não-nulo
    const val = appt.valorization;
    if (val !== null && val !== undefined && typeof val === 'object') {
      const attendanceLabel = ATTENDANCE_LABELS[val.attendance] || val.attendance || 'N/A';
      const isContract = val.attendance_kind === 'Contract';
      // Sem default silencioso: tipo desconhecido mostra o valor cru da API, nunca "Avulso" indevido
      const kindLabel = ATTENDANCE_KIND_LABELS[val.attendance_kind] || val.attendance_kind || 'N/A';
      const kindName = isContract
        ? (val.contract?.name || '')
        : (val.loose_service?.name || '');
      const kindDisplay = kindName ? `${kindLabel} — ${kindName}` : kindLabel;

      text += `   💰 **Valorização:**\n`;
      text += `      • Atendimento: ${attendanceLabel}\n`;
      text += `      • Tipo: ${kindDisplay}\n`;

      if (val.shift) {
        text += `      • 🚗 Deslocamento: ${val.shift.name || 'N/A'} (${formatBRL(val.shift.value)})\n`;
      }
      if (val.guarantee === true) {
        text += `      • 🛡️ Garantia\n`;
      }
      if (val.manual_value === true) {
        text += `      • ✋ Valor manual\n`;
      }
      text += `      • 💵 Valor: ${formatBRL(val.value)}\n`;
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

    text += '\n';
  });

  const currentOffset = parseInt(offset) || 1;
  const currentLimit = parseInt(limit) || 20;
  const hasMore = appointments.length === currentLimit;

  let paginationInfo = `**📊 Paginação:**\n`;
  paginationInfo += `• Página atual: ${currentOffset}\n`;
  paginationInfo += `• Apontamentos por página: ${currentLimit}\n`;
  paginationInfo += `• Apontamentos nesta página: ${appointments.length}\n`;

  if (hasMore) {
    const nextOffset = currentOffset + 1;
    paginationInfo += `• Próxima página: Use \`offset: ${nextOffset}\` para ver mais apontamentos\n`;
  } else {
    paginationInfo += `• Esta é a última página disponível\n`;
  }

  return `${text}${paginationInfo}\n*✅ Dados obtidos da API TiFlux em tempo real*`;
}

async function execute(args, { api }) {
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

    return textResponse(formatAppointmentsList(ticket_number, appointments, offset, limit));
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

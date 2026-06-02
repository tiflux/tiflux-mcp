/**
 * Slice: list_appointments — lista apontamentos de um ticket.
 *
 * Endpoint: GET /tickets/{ticket_number}/appointments (via api.listAppointments).
 * Suporta filtros opcionais user_id/start_date/end_date + paginacao offset/limit.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'list_appointments',
  description: 'Listar apontamentos (registros de horas trabalhadas) de um ticket específico com filtros opcionais',
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

    text += `   💬 **Descrição:** ${desc}\n\n`;
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
      return textResponse(
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
    return textResponse(
      `**❌ Erro interno ao listar apontamentos**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatAppointmentsList };

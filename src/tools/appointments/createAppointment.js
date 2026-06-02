/**
 * Slice: create_appointment — cria apontamento (horas trabalhadas) em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/appointments (via api.createAppointment).
 * Valida obrigatoriedade dos 5 campos; API valida formato YYYY-MM-DD / HH:MM e
 * regra end >= init (422 retorna com mensagem formatada).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_appointment',
  description: 'Criar um novo apontamento (registro de horas trabalhadas) em um ticket específico. Só funciona em tickets de mesas configuradas com apontamentos sem valorização.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket onde será criado o apontamento'
      },
      date: {
        type: 'string',
        description: 'Data do apontamento no formato YYYY-MM-DD. Não é possível informar uma data futura.'
      },
      init_time: {
        type: 'string',
        description: 'Horário de início do atendimento no formato HH:MM (ex: "09:00", "14:30")'
      },
      end_time: {
        type: 'string',
        description: 'Horário de fim do atendimento no formato HH:MM (ex: "10:00", "17:30"). Deve ser maior ou igual ao init_time.'
      },
      description: {
        type: 'string',
        description: 'Descrição do apontamento (o que foi feito no atendimento)'
      }
    },
    required: ['ticket_number', 'date', 'init_time', 'end_time', 'description']
  }
};

async function execute(args, { api }) {
  const { ticket_number, date, init_time, end_time, description } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'date');
  requireField(args, 'init_time');
  requireField(args, 'end_time');
  requireField(args, 'description');

  try {
    const response = await api.createAppointment(ticket_number, {
      date,
      init_time,
      end_time,
      description
    });

    if (response.error) {
      return textResponse(
        `**❌ Erro ao criar apontamento**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe, se a mesa permite apontamentos sem valorização e se os parâmetros estão corretos.*`
      );
    }

    const appointment = response.data;

    return textResponse(
      `**✅ Apontamento criado com sucesso!**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**ID do Apontamento:** ${appointment.id}\n` +
      `**Data:** ${appointment.date}\n` +
      `**Horário:** ${appointment.init_time} - ${appointment.end_time}\n` +
      `**Descrição:** ${appointment.description}\n` +
      `**Atendente:** ${appointment.user?.name || 'Usuário não informado'}\n\n` +
      `*✅ Apontamento registrado via API TiFlux*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao criar apontamento**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

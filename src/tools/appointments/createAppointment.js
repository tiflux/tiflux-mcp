/**
 * Slice: create_appointment — cria apontamento (horas trabalhadas) em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/appointments (via api.createAppointment).
 *
 * Suporta apontamentos simples (sem valorizacao) e valorizados (attendance/attendance_kind,
 * contrato, servico avulso, deslocamento, garantia, valor manual, executor externo).
 *
 * Regras cross-field validadas localmente (antes da chamada a API):
 *   - attendance_kind=1 (Avulso)   → exige loose_service_id; rejeita contract_rider_id e value+attendance_kind=2
 *   - attendance_kind=2 (Contrato) → exige contract_rider_id; rejeita loose_service_id e value
 *   - shift_id XOR shift_owner_ticket_number (nunca ambos)
 *   - shift_id ou shift_owner_ticket_number → exige attendance=1 (Externo)
 *   - value → exige attendance_kind=1 (Avulso) explicito
 *   - guarantee=true → rejeita value
 *   - external_user_name → max 255 chars, sem < nem >
 *
 * Resolucao por nome (conveniencia): shift_name, loose_service_name, contract_name.
 * Precedencia: *_id vence *_name quando ambos forem passados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, extractApiErrorCode, extractApiErrorDetail } = require('../_shared/errors');
const { requireField, parseIntStrict } = require('../_shared/validators');
const { currencyBRL } = require('../_shared/format');
const { resolveShiftName, resolveLooseServiceName, resolveContractName } = require('./valorizationResolver');

const schema = {
  name: 'create_appointment',
  description: 'Criar um novo apontamento (registro de horas trabalhadas) em um ticket específico. Suporta apontamentos sem valorização (mesas sem contrato) e com valorização (atendimento externo/remoto/interno, contrato ou serviço avulso, deslocamento, garantia, valor manual e executor externo).',
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
      },
      attendance: {
        type: 'integer',
        enum: [1, 2, 3],
        description: 'Tipo de atendimento: 1 = Externo (presencial), 2 = Remoto, 3 = Interno. Obrigatório em mesas com valorização.'
      },
      attendance_kind: {
        type: 'integer',
        enum: [1, 2],
        description: 'Tipo de serviço: 1 = Avulso (loose_service_id obrigatório), 2 = Contrato (contract_rider_id obrigatório). Obrigatório em mesas com valorização.'
      },
      contract_rider_id: {
        type: 'integer',
        description: 'ID do aditivo de contrato vigente do cliente. Obrigatório quando attendance_kind=2 (Contrato). Proibido quando attendance_kind=1 (Avulso). Use contract_name para resolver por nome.'
      },
      loose_service_id: {
        type: 'integer',
        description: 'ID do serviço avulso ativo disponível ao cliente. Obrigatório quando attendance_kind=1 (Avulso). Proibido quando attendance_kind=2 (Contrato). Use loose_service_name para resolver por nome.'
      },
      shift_id: {
        type: 'integer',
        description: 'ID do deslocamento (taxa de visita ao cliente). Somente com attendance=1 (Externo). Exclusivo com shift_owner_ticket_number (nunca ambos). Use shift_name para resolver por nome.'
      },
      shift_owner_ticket_number: {
        type: 'integer',
        description: 'Número de outro ticket aberto do mesmo cliente que já tem o deslocamento cobrado (carona). Somente com attendance=1 (Externo). Exclusivo com shift_id (nunca ambos).'
      },
      guarantee: {
        type: 'boolean',
        description: 'Apontamento em garantia: valor forçado a zero, não fatura. Proibido junto com value.'
      },
      value: {
        type: 'number',
        minimum: 0,
        maximum: 9999999.99,
        description: 'Valor manual do apontamento. Somente com attendance_kind=1 (Avulso). Se omitido, calculado automaticamente (serviço avulso × horas). Proibido com guarantee=true ou attendance_kind=2.'
      },
      external_user_name: {
        type: 'string',
        maxLength: 255,
        description: 'Nome do executor em ferramenta externa (máx 255 chars, sem < e >). Não substitui o usuário autenticado. Válido em qualquer tipo de mesa.'
      },
      shift_name: {
        type: 'string',
        description: 'Nome (ou parte do nome) do deslocamento para resolução automática. Alternativa a shift_id. Quando shift_id também for informado, shift_id tem precedência.'
      },
      loose_service_name: {
        type: 'string',
        description: 'Nome (ou parte do nome) do serviço avulso para resolução automática. Alternativa a loose_service_id. Quando loose_service_id também for informado, loose_service_id tem precedência.'
      },
      contract_name: {
        type: 'string',
        description: 'Nome (ou parte do nome) do contrato para resolução automática. Retorna o contract_rider_id correspondente. Alternativa a contract_rider_id. Quando contract_rider_id também for informado, contract_rider_id tem precedência.'
      }
    },
    required: ['ticket_number', 'date', 'init_time', 'end_time', 'description']
  }
};

/**
 * Valida regras cross-field localmente, antes de chamar a API.
 * Retorna string com mensagem de erro ou null se tudo ok.
 *
 * @param {object} p - parametros ja parseados/normalizados
 * @returns {string|null}
 */
function validateCrossField(p) {
  const { attendance_kind, contract_rider_id, loose_service_id, value, shift_id, shift_owner_ticket_number, attendance, guarantee, external_user_name } = p;

  // attendance_kind=1 (Avulso)
  if (attendance_kind === 1) {
    if (!loose_service_id) {
      return '`attendance_kind=1` (Avulso) exige `loose_service_id` ou `loose_service_name`.';
    }
    if (contract_rider_id) {
      return '`attendance_kind=1` (Avulso) não aceita `contract_rider_id`. O aditivo de contrato é exclusivo do tipo Contrato (attendance_kind=2).';
    }
  }

  // attendance_kind=2 (Contrato)
  if (attendance_kind === 2) {
    if (!contract_rider_id) {
      return '`attendance_kind=2` (Contrato) exige `contract_rider_id` ou `contract_name`.';
    }
    if (loose_service_id) {
      return '`attendance_kind=2` (Contrato) não aceita `loose_service_id`. O serviço avulso é exclusivo do tipo Avulso (attendance_kind=1).';
    }
    if (value !== undefined && value !== null) {
      return '`attendance_kind=2` (Contrato) fatura pelo número de horas — o campo `value` não é permitido. Omita `value` para usar o cálculo automático do contrato.';
    }
  }

  // shift XOR shift_owner_ticket_number
  if (shift_id && shift_owner_ticket_number) {
    return '`shift_id` e `shift_owner_ticket_number` são exclusivos entre si (nunca os dois). Use `shift_id` para novo deslocamento ou `shift_owner_ticket_number` para carona num deslocamento já cobrado.';
  }

  // deslocamento exige attendance=1 (Externo)
  if ((shift_id || shift_owner_ticket_number) && attendance !== 1) {
    return '`shift_id` e `shift_owner_ticket_number` só podem ser usados com `attendance=1` (Externo/presencial).';
  }

  // guarantee=true proibe value
  if (guarantee === true && value !== undefined && value !== null) {
    return '`guarantee=true` (apontamento em garantia) não aceita `value` — o valor é forçado a zero pela API.';
  }

  // value so existe em servico avulso — exige attendance_kind=1 explicito
  // (Swagger v2: "O value so pode ser informado em apontamentos de servico avulso (attendance_kind = 1)").
  if (value !== undefined && value !== null && attendance_kind !== 1) {
    return '`value` (valor manual) só é permitido em apontamento de serviço avulso — informe `attendance_kind=1`. Sem `attendance_kind`, o valor é calculado pela API.';
  }

  // external_user_name: max 255, sem < >
  if (external_user_name !== undefined && external_user_name !== null) {
    if (String(external_user_name).length > 255) {
      return '`external_user_name` excede o máximo de 255 caracteres.';
    }
    if (String(external_user_name).includes('<') || String(external_user_name).includes('>')) {
      return '`external_user_name` não pode conter os caracteres `<` nem `>`.';
    }
  }

  return null;
}

/**
 * Formata a resposta 201 de criacao de apontamento.
 * Exportado para poder ser testado isolado.
 *
 * @param {object} appointment - dados do apontamento retornado pela API
 * @param {string} ticketNumber - numero do ticket (para mensagem)
 * @param {boolean} hadLooseService - se o request tinha loose_service_id (exibe value so nesse caso)
 * @returns {string}
 */
function formatCreatedAppointment(appointment, ticketNumber, hadLooseService) {
  const id = appointment.id || 'N/A';
  const date = appointment.date || 'N/A';
  const initTime = appointment.init_time || '?';
  const endTime = appointment.end_time || '?';
  const desc = appointment.description || '';
  const userName = appointment.user?.name || 'Usuário não informado';

  let text =
    `**✅ Apontamento criado com sucesso!**\n\n` +
    `**Ticket:** #${ticketNumber}\n` +
    `**ID do Apontamento:** ${id}\n` +
    `**Data:** ${date}\n` +
    `**Horário:** ${initTime} - ${endTime}\n` +
    `**Descrição:** ${desc}\n` +
    `**Atendente:** ${userName}\n`;

  // external_user_name — so quando presente
  if (appointment.external_user_name) {
    text += `**Executor externo:** ${appointment.external_user_name}\n`;
  }

  // value — so existe na resposta quando houve loose_service_id
  if (hadLooseService && appointment.value !== undefined && appointment.value !== null) {
    text += `**Valor:** ${currencyBRL(Number.parseFloat(appointment.value))}\n`;
  }

  text += `\n*✅ Apontamento registrado via API TiFlux*`;
  return text;
}

/**
 * Detecta o 422 de mesa com valorizacao obrigatoria (attendance/attendance_kind
 * "can't be blank") e devolve mensagem orientada. Null quando o 422 tem outra causa.
 *
 * @param {object} response - resposta de erro da API
 * @param {string|number} ticketNumber
 * @returns {object|null}
 */
function valorizationRequiredResponse(response, ticketNumber) {
  if (response.status !== 422) return null;

  const detail = extractApiErrorDetail(response);
  if (!detail) return null;

  const isBlank = field =>
    [detail[field]].flat().some(msg => typeof msg === 'string' && msg.includes("can't be blank"));

  if (!isBlank('attendance_kind') && !isBlank('attendance')) return null;

  return errorResponse(
    `**❌ Esta mesa exige informações de valorização**\n\n` +
    `A mesa do ticket #${ticketNumber} está configurada com valorização de apontamentos, então ` +
    `\`attendance\` e \`attendance_kind\` são obrigatórios.\n\n` +
    `• \`attendance\`: 1 = Externo (presencial), 2 = Remoto, 3 = Interno\n` +
    `• \`attendance_kind\`: 1 = Avulso (exige \`loose_service_id\`), 2 = Contrato (exige \`contract_rider_id\`)`
  );
}

/**
 * Mapeia a resposta de erro da API para a mensagem MCP correspondente.
 *
 * @param {object} response - resposta de erro da API
 * @param {string|number} ticketNumber
 * @returns {object}
 */
function appointmentApiErrorResponse(response, ticketNumber) {
  const errorCode = extractApiErrorCode(response);

  if (errorCode === 40304) {
    return errorResponse(
      `**❌ Sem licença para apontamentos**\n\n` +
      `Sua organização não possui licença ativa para o módulo de tickets/apontamentos (erro 40304).\n\n` +
      `*Entre em contato com o suporte TiFlux para verificar o licenciamento.*`
    );
  }

  const valorizationError = valorizationRequiredResponse(response, ticketNumber);
  if (valorizationError) return valorizationError;

  return apiFailureResponse(
    `**❌ Erro ao criar apontamento no ticket #${ticketNumber}**`,
    response,
    `*Verifique se a mesa permite o tipo de valorização informado e se os IDs de contrato/serviço são válidos para este cliente.*`
  );
}

async function execute(args, { api }) {
  requireField(args, 'ticket_number');
  requireField(args, 'date');
  requireField(args, 'init_time');
  requireField(args, 'end_time');
  requireField(args, 'description');

  const {
    ticket_number,
    date,
    init_time,
    end_time,
    description,
    guarantee,
    value,
    external_user_name,
    shift_name,
    loose_service_name,
    contract_name
  } = args;

  // --- Parsear inteiros estritos ---
  let attendance, attendance_kind, contract_rider_id, loose_service_id, shift_id, shift_owner_ticket_number;

  try {
    if (args.attendance !== undefined && args.attendance !== null) {
      attendance = parseIntStrict(args.attendance, 'attendance');
    }
    if (args.attendance_kind !== undefined && args.attendance_kind !== null) {
      attendance_kind = parseIntStrict(args.attendance_kind, 'attendance_kind');
    }
    if (args.contract_rider_id !== undefined && args.contract_rider_id !== null) {
      contract_rider_id = parseIntStrict(args.contract_rider_id, 'contract_rider_id');
    }
    if (args.loose_service_id !== undefined && args.loose_service_id !== null) {
      loose_service_id = parseIntStrict(args.loose_service_id, 'loose_service_id');
    }
    if (args.shift_id !== undefined && args.shift_id !== null) {
      shift_id = parseIntStrict(args.shift_id, 'shift_id');
    }
    if (args.shift_owner_ticket_number !== undefined && args.shift_owner_ticket_number !== null) {
      shift_owner_ticket_number = parseIntStrict(args.shift_owner_ticket_number, 'shift_owner_ticket_number');
    }
  } catch (e) {
    return errorResponse(`**❌ Parâmetro inválido**\n\n${e.message}`);
  }

  // Campos que a resolucao por nome nao altera — compartilhados pelas duas passadas
  // de validacao cross-field (pre-resolucao e pos-resolucao).
  const crossFieldBase = { attendance_kind, value, shift_owner_ticket_number, attendance, guarantee, external_user_name };

  // --- Validacao cross-field PRE-resolucao ---
  // Usa presenca (id OU name) para nao acusar campo ausente que o *_name ainda resolveria.
  // Evita gastar round-trip de API numa combinacao garantidamente invalida.
  const preCrossError = validateCrossField({
    ...crossFieldBase,
    contract_rider_id: contract_rider_id || contract_name,
    loose_service_id: loose_service_id || loose_service_name,
    shift_id: shift_id || shift_name
  });

  if (preCrossError) {
    return errorResponse(`**❌ Regra de negócio violada**\n\n${preCrossError}`);
  }

  // --- Resolucao por nome (precedencia: *_id vence *_name) ---
  if (!shift_id && shift_name) {
    const r = await resolveShiftName(api, ticket_number, shift_name);
    if (r.error) return r.response;
    shift_id = r.shiftId;
  }

  if (!loose_service_id && loose_service_name) {
    const r = await resolveLooseServiceName(api, ticket_number, date, loose_service_name);
    if (r.error) return r.response;
    loose_service_id = r.looseServiceId;
  }

  if (!contract_rider_id && contract_name) {
    const r = await resolveContractName(api, ticket_number, date, contract_name);
    if (r.error) return r.response;
    contract_rider_id = r.contractRiderId;
  }

  // --- Validacao cross-field POS-resolucao (autoritativa, sobre os IDs finais) ---
  const crossError = validateCrossField({
    ...crossFieldBase,
    contract_rider_id,
    loose_service_id,
    shift_id
  });

  if (crossError) {
    return errorResponse(`**❌ Regra de negócio violada**\n\n${crossError}`);
  }

  // --- Montagem do payload (so campos presentes) ---
  const payload = { date, init_time, end_time, description };

  if (attendance !== undefined) payload.attendance = attendance;
  if (attendance_kind !== undefined) payload.attendance_kind = attendance_kind;
  if (contract_rider_id !== undefined) payload.contract_rider_id = contract_rider_id;
  if (loose_service_id !== undefined) payload.loose_service_id = loose_service_id;
  if (shift_id !== undefined) payload.shift_id = shift_id;
  if (shift_owner_ticket_number !== undefined) payload.shift_owner_ticket_number = shift_owner_ticket_number;
  if (guarantee !== undefined) payload.guarantee = guarantee;
  if (value !== undefined && value !== null) payload.value = value;
  if (external_user_name !== undefined && external_user_name !== null) payload.external_user_name = external_user_name;

  // --- Chamada a API ---
  try {
    const response = await api.createAppointment(ticket_number, payload);

    if (response.error) {
      return appointmentApiErrorResponse(response, ticket_number);
    }

    const appointment = response.data;
    const hadLooseService = !!loose_service_id;
    return textResponse(formatCreatedAppointment(appointment, ticket_number, hadLooseService));
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao criar apontamento**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, formatCreatedAppointment };

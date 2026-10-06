/**
 * Slice: create_desk — cria uma mesa de servico.
 *
 * Endpoint: POST /desks (via api.createDesk). Body JSON plano.
 * O body nao tem schema na Swagger (`{"type":"object"}`): os campos da v1 saem dos 2 exemplos
 * documentados e do 422 (42202), que exige name, display_name e description.
 *
 * Fora da v1 (decisao da spec 2026-10-05-paridade-quick-wins): review_type,
 * behavior_billed_tickets, behavior_not_billed_tickets, default_revised,
 * time_limit_to_reopening, ticket_with_sla_time, can_stop_sla, reminder, summary e
 * services_catalog_item — enums sem documentacao ou semantica dependente de SLA/revisao.
 *
 * Retorno 201: mesmo shape de GET /desks/{id} → reaproveita o formatter do get_desk.
 * Erros: 403 40301 (permissao "Gerenciar mesas de serviços"), 403 40304 (licenca Tickets),
 * 422 42202 (mensagem por campo).
 *
 * Nao existe DELETE de mesa na API v2: mesa criada so se desativa (portal ou active:false).
 */

const { textResponse } = require('../_shared/response');
const {
  errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorCode, formatApiErrorDetail
} = require('../_shared/errors');
const { format: formatDesk } = require('./getDesk');

const APPOINTMENT_TYPES = ['Without Appointments', 'Appointments with Valorization', 'Appointments with no Valorization'];
const ATTENDANCE_TYPES = ['All technical groups', 'Only selected technical groups'];
const REQUIRED_STRINGS = ['name', 'display_name', 'description'];
const BOOLEAN_FIELDS = [
  'active', 'receiving_new_tickets', 'internal_desk', 'cancelable_tickets', 'desk_exchange',
  'require_service_catalog_open_ticket', 'desk_with_sla', 'ticket_review', 'add_ticket_feedback',
  'can_reopen_revised_tickets', 'user_without_access_create_ticket'
];
const REQUIRED_FIELD_KEYS = [
  'requestor_name', 'requestor_email', 'requestor_telephone', 'requestor_ramal', 'equipment_id', 'attachment_file'
];

const BOOLEAN_DESCRIPTIONS = {
  active: 'Mesa ativa (opcional)',
  receiving_new_tickets: 'Recebendo novos tickets (opcional)',
  internal_desk: 'Mesa interna — sem atendimento a clientes (opcional)',
  cancelable_tickets: 'Permitir cancelar tickets (opcional)',
  desk_exchange: 'Permitir troca de mesa (opcional)',
  require_service_catalog_open_ticket: 'Exigir item de catálogo de serviços para abrir ticket (opcional)',
  desk_with_sla: 'Mesa com SLA (opcional)',
  ticket_review: 'Exigir revisão de ticket (opcional)',
  add_ticket_feedback: 'Permitir avaliação dos tickets (opcional)',
  can_reopen_revised_tickets: 'Permitir reabrir tickets revisados (opcional)',
  user_without_access_create_ticket: 'Atendentes sem acesso à mesa podem criar ticket (opcional)'
};

const schema = {
  name: 'create_desk',
  description:
    'Criar uma mesa de serviço. Obrigatórios: name, display_name e description. Opcionais: tipo de apontamento ' +
    '(appointment_type), tipo de atendimento (attendance_type), meta de SLA (sla_goal), comportamentos booleanos ' +
    '(active, receiving_new_tickets, internal_desk, cancelable_tickets, desk_exchange, desk_with_sla, ticket_review, ' +
    'add_ticket_feedback, etc.) e campos obrigatórios do formulário (required_fields). Omitidos, a API aplica os ' +
    'padrões dela (observado: apontamento com valorização, só grupos selecionados e SLA ativo). Revisão, reabertura, ' +
    'lembretes e resumo ficam para ajuste no portal. ATENÇÃO: a API não permite excluir mesas — uma mesa criada só ' +
    'pode ser desativada (pelo portal ou active:false). Requer a permissão "Gerenciar mesas de serviços" e licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome interno da mesa (obrigatório)' },
      display_name: { type: 'string', description: 'Nome de exibição da mesa (obrigatório)' },
      description: { type: 'string', description: 'Descrição da mesa (obrigatório)' },
      appointment_type: {
        type: 'string',
        enum: APPOINTMENT_TYPES,
        description:
          'Tipo de apontamento (opcional): "Without Appointments" (sem apontamentos), ' +
          '"Appointments with Valorization" (com valorização) ou "Appointments with no Valorization" (sem valorização)'
      },
      attendance_type: {
        type: 'string',
        enum: ATTENDANCE_TYPES,
        description:
          'Tipo de atendimento (opcional): "All technical groups" (todos os grupos de atendentes) ou ' +
          '"Only selected technical groups" (somente grupos selecionados)'
      },
      sla_goal: { type: 'integer', description: 'Meta de SLA em % (opcional, ex: 80)' },
      ...Object.fromEntries(BOOLEAN_FIELDS.map(f => [f, { type: 'boolean', description: BOOLEAN_DESCRIPTIONS[f] }])),
      required_fields: {
        type: 'object',
        description:
          'Campos obrigatórios no formulário do ticket (opcional). true = obrigatório. ' +
          'Chaves: requestor_name, requestor_email, requestor_telephone, requestor_ramal, equipment_id, attachment_file.',
        properties: Object.fromEntries(REQUIRED_FIELD_KEYS.map(k => [k, { type: 'boolean' }]))
      }
    },
    required: REQUIRED_STRINGS
  }
};

function validationError(message) {
  return errorResponse(`**❌ Erro de validação ao criar mesa**\n\n${message}`);
}

function pickEnum(args, field, allowed, body) {
  if (args[field] === undefined || args[field] === null) return null;
  if (!allowed.includes(args[field])) {
    const accepted = allowed.map(v => '"' + v + '"').join(', ');
    return `\`${field}\` inválido: "${args[field]}". Valores aceitos: ${accepted}.`;
  }
  body[field] = args[field];
  return null;
}

function pickRequiredFields(args, body) {
  const rf = args.required_fields;
  if (rf === undefined || rf === null) return null;
  if (typeof rf !== 'object' || Array.isArray(rf)) return '`required_fields` deve ser um objeto de booleanos.';
  const out = {};
  for (const key of Object.keys(rf)) {
    if (!REQUIRED_FIELD_KEYS.includes(key)) {
      return `\`required_fields.${key}\` não é suportado. Chaves aceitas: ${REQUIRED_FIELD_KEYS.join(', ')}.`;
    }
    if (typeof rf[key] !== 'boolean') return `\`required_fields.${key}\` deve ser booleano.`;
    out[key] = rf[key];
  }
  if (Object.keys(out).length > 0) body.required_fields = out;
  return null;
}

function pickSlaGoal(args, body) {
  if (args.sla_goal === undefined || args.sla_goal === null) return null;
  if (!Number.isInteger(args.sla_goal) || args.sla_goal < 0) return '`sla_goal` deve ser um número inteiro não negativo.';
  body.sla_goal = args.sla_goal;
  return null;
}

/**
 * Monta o body so com as chaves informadas (nunca envia undefined).
 * @returns {{ body?: object, error?: string }}
 */
function buildBody(args) {
  const body = {};
  const missing = REQUIRED_STRINGS.filter(f => typeof args[f] !== 'string' || args[f].trim() === '');
  if (missing.length > 0) return { error: `Campos obrigatórios ausentes: ${missing.join(', ')}.` };
  for (const f of REQUIRED_STRINGS) body[f] = args[f].trim();

  for (const f of BOOLEAN_FIELDS) {
    if (args[f] === undefined || args[f] === null) continue;
    if (typeof args[f] !== 'boolean') return { error: `\`${f}\` deve ser booleano.` };
    body[f] = args[f];
  }

  const error =
    pickEnum(args, 'appointment_type', APPOINTMENT_TYPES, body) ||
    pickEnum(args, 'attendance_type', ATTENDANCE_TYPES, body) ||
    pickSlaGoal(args, body) ||
    pickRequiredFields(args, body);
  return error ? { error } : { body };
}

function failure(response) {
  const code = extractApiErrorCode(response);
  if (response.status === 403 && code === 40304) {
    return errorResponse(
      '**❌ Sem licença para criar mesa**\n\n' +
      `**Código:** 403 (erro 40304)\n` +
      `**Mensagem:** ${response.error}\n\n` +
      '*Seu usuário não tem a licença Tickets. Peça ao administrador para habilitá-la.*'
    );
  }
  if (response.status === 403) {
    return errorResponse(
      '**❌ Sem permissão para criar mesa**\n\n' +
      `**Código:** 403${code ? ' (erro ' + code + ')' : ''}\n` +
      `**Mensagem:** ${response.error}\n\n` +
      '*É necessária a permissão "Gerenciar mesas de serviços".*'
    );
  }
  if (response.status === 422) {
    return errorResponse(
      '**❌ Dados inválidos para criar a mesa**\n\n' +
      `**Código:** 422${code ? ' (erro ' + code + ')' : ''}\n` +
      `**Mensagem:** ${response.error}\n\n` +
      formatApiErrorDetail(response) +
      '\n*Corrija os campos indicados e tente novamente.*'
    );
  }
  return apiFailureResponse('**❌ Erro ao criar mesa**', response, '*Verifique os dados informados e suas permissões.*');
}

async function execute(args, { api }) {
  const { body, error } = buildBody(args || {});
  if (error) return validationError(error);

  try {
    const response = await api.createDesk(body);
    if (response.error) return failure(response);

    const desk = response.data;
    if (!desk || typeof desk !== 'object' || desk.id == null) {
      return textResponse(
        `**✅ Mesa "${body.display_name}" criada com sucesso!**\n\n` +
        '*A API não devolveu os detalhes da mesa; use list_desks ou get_desk para conferir.*'
      );
    }
    return textResponse(
      `**✅ Mesa criada com sucesso!**\n\n${formatDesk(desk)}\n\n` +
      '*Mesas não podem ser excluídas pela API — para desativar, use o portal.*'
    );
  } catch (err) {
    return internalErrorResponse('**❌ Erro interno ao criar mesa**', err);
  }
}

module.exports = { name: schema.name, schema, execute, APPOINTMENT_TYPES, ATTENDANCE_TYPES };

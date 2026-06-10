/**
 * Slice: get_desk — retorna dados completos de uma mesa (30+ campos).
 *
 * Endpoint: GET /desks/{id}
 * Aceita desk_id (direto) OU desk_name (fuzzy via resolveDeskName).
 * Se ambos informados, desk_id prevalece.
 * Formata em secoes Markdown: Identificacao / Atendimento / SLA / Comportamento / Campos obrigatorios.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');

const schema = {
  name: 'get_desk',
  description: 'Retornar configuracoes completas de uma mesa do TiFlux (SLA, tipo de atendimento, campos obrigatorios, comportamento de tickets, etc). Aceita desk_id (numerico) OU desk_name (nome parcial/fuzzy, usa o mesmo mecanismo de Smart Name Resolution). Se ambos informados, desk_id prevalece.',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID numerico da mesa. Se informado, usa diretamente (nao chama busca fuzzy).'
      },
      desk_name: {
        type: 'string',
        description: 'Nome (parcial ou exato) da mesa. Aceita abreviações — ex: "cansados" resolve para "Dev - Cansados". Alternativa ao desk_id.'
      }
    },
    required: []
  }
};

function val(v) {
  if (v === null || v === undefined || v === '' || v === false) return null;
  if (v === true) return 'Sim';
  return v;
}

function formatDesk(desk) {
  const lines = [];

  lines.push(`## Mesa: ${desk.display_name || desk.name} (ID: ${desk.id})`);
  lines.push('');

  // Secao: Identificacao
  lines.push('### Identificacao');
  if (val(desk.name)) lines.push(`- **Nome interno:** ${desk.name}`);
  if (val(desk.display_name)) lines.push(`- **Nome de exibicao:** ${desk.display_name}`);
  if (val(desk.description)) lines.push(`- **Descricao:** ${desk.description}`);
  lines.push(`- **Ativa:** ${desk.active ? 'Sim' : 'Nao'}`);
  if (val(desk.internal_desk)) lines.push(`- **Mesa interna:** Sim`);
  if (val(desk.receiving_new_tickets) !== null) lines.push(`- **Recebendo novos tickets:** ${desk.receiving_new_tickets ? 'Sim' : 'Nao'}`);
  lines.push('');

  // Secao: Atendimento
  lines.push('### Atendimento');
  if (val(desk.appointment_type)) lines.push(`- **Tipo de apontamento:** ${desk.appointment_type}`);
  if (val(desk.attendance_type)) lines.push(`- **Tipo de atendimento:** ${desk.attendance_type}`);
  if (val(desk.only_attendants_can_open)) lines.push(`- **Somente atendentes podem abrir ticket:** Sim`);
  if (val(desk.user_without_access_create_ticket)) lines.push(`- **Atendentes sem acesso podem criar ticket:** Sim`);
  if (val(desk.cancelable_tickets)) lines.push(`- **Tickets cancelaveis:** Sim`);
  if (val(desk.add_ticket_feedback)) lines.push(`- **Permite avaliar tickets:** Sim`);
  if (val(desk.summary)) lines.push(`- **Enviar resumo por e-mail:** Sim`);
  if (val(desk.reminder)) lines.push(`- **Enviar lembrete por e-mail:** Sim`);
  if (val(desk.desk_exchange)) lines.push(`- **Troca de mesa permitida:** Sim`);
  lines.push('');

  // Secao: SLA
  lines.push('### SLA');
  lines.push(`- **Mesa com SLA ativo:** ${desk.desk_with_sla ? 'Sim' : 'Nao'}`);
  if (val(desk.sla_goal)) lines.push(`- **Meta de SLA:** ${desk.sla_goal}`);
  if (val(desk.can_stop_sla)) lines.push(`- **Pode parar/retomar SLA:** Sim`);
  if (val(desk.ticket_with_sla_time)) lines.push(`- **Permite adicionar tempo de SLA:** Sim`);
  lines.push('');

  // Secao: Comportamento de tickets
  lines.push('### Comportamento de tickets');
  if (val(desk.ticket_review)) lines.push(`- **Exige revisao de ticket:** Sim`);
  if (val(desk.review_type)) lines.push(`- **Tipo de revisao:** ${desk.review_type}`);
  if (val(desk.default_revised)) lines.push(`- **Tipo de revisao padrao:** ${desk.default_revised}`);
  if (val(desk.can_reopen_revised_tickets)) lines.push(`- **Pode reabrir tickets revisados:** Sim`);
  if (val(desk.time_limit_to_reopening)) lines.push(`- **Tempo limite para reabertura:** ${desk.time_limit_to_reopening}`);
  if (val(desk.behavior_billed_tickets)) lines.push(`- **Comportamento reabertura (faturados):** ${desk.behavior_billed_tickets}`);
  if (val(desk.behavior_not_billed_tickets)) lines.push(`- **Comportamento reabertura (nao faturados):** ${desk.behavior_not_billed_tickets}`);
  lines.push('');

  // Secao: Campos obrigatorios no formulario
  lines.push('### Campos obrigatorios no formulario');
  if (val(desk.require_service_catalog_open_ticket)) lines.push(`- **Exige catalogo de servicos para abrir ticket:** Sim`);
  if (val(desk.services_catalog_item)) lines.push(`- **Exige catalogo de servicos para fechar ticket:** Sim`);

  const requiredFields = desk.required_fields;
  if (requiredFields && (Array.isArray(requiredFields) ? requiredFields.length > 0 : true)) {
    if (Array.isArray(requiredFields)) {
      if (requiredFields.length > 0) {
        lines.push(`- **Campos obrigatorios:** ${requiredFields.join(', ')}`);
      }
    } else {
      lines.push(`- **Campos obrigatorios:** ${requiredFields}`);
    }
  }

  // Remove trailing empty section if nothing was added
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

async function execute(args, { api }) {
  const { desk_id, desk_name } = args;

  if (!desk_id && !desk_name) {
    return errorResponse(
      '**Erro de validacao**\n\n' +
      '`desk_id` ou `desk_name` e obrigatorio.\n\n' +
      '*Informe o ID numerico da mesa (`desk_id`) ou um nome parcial/exato (`desk_name`).*'
    );
  }

  try {
    let finalDeskId = desk_id;

    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    const response = await api.getDesk(finalDeskId);

    if (response.error) {
      return errorResponse(
        `**Erro ao buscar mesa ID ${finalDeskId}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se a mesa existe e se voce tem permissao para acessar.*`
      );
    }

    const desk = response.data || response;
    return textResponse(formatDesk(desk));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar mesa**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatDesk };

/**
 * Slice: list_appointments_global — lista apontamentos globais por período.
 *
 * Endpoint: GET /appointments (via api.listAppointmentsGlobal).
 * Filtros server-side: user_ids/desk_ids (CSV máx 15), start_date/end_date (obrigatórios),
 * include_valorization (opt-in). Paginação: offset (nº da página), limit (max 200) +
 * header X-Total-Items.
 *
 * Permissão: requer acesso ao endpoint /appointments. Sem permissão → 403 40301.
 * Se user_ids fornecido sem "Visualizar relatórios dos técnicos" (view_users_manage),
 * a API pode silenciar o filtro e retornar apenas dados do próprio usuário (200).
 *
 * Resolução de nomes: user_names → IDs via userResolver; desk_names → IDs via deskResolver.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { renderList, currencyBRL } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const {
  ATTENDANCE_LABELS,
  appointmentFilterSchemaProperties,
  validateRequiredPeriod,
  resolveAppointmentFilterIds,
  appointmentsApiErrorResponse
} = require('./appointmentFilters');

const schema = {
  name: 'list_appointments_global',
  description: 'Listar apontamentos globais por período, com filtros opcionais por técnico e mesa. Requer permissão de acesso ao endpoint de apontamentos. Quando user_ids/user_names é informado, inclui nota se o filtro pode estar sendo ignorado por falta de permissão "Visualizar relatórios dos técnicos". Com include_valorization=true, exibe tipo de atendimento, valor, 🛡️ Garantia (quando guarantee=true) e ✋ Valor manual (quando manual_value=true — valor digitado manualmente, contornando a tarifa do contrato). Use list_appointments_report para obter o relatório agregado por N2 com totalizadores.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appointmentFilterSchemaProperties(),
      ...paginationSchemaProperties()
    },
    required: ['start_date', 'end_date']
  }
};

function renderAppointmentItem(appt) {
  const date = appt.date || '—';
  const initTime = appt.init_time || '?';
  const endTime = appt.end_time || '?';
  const userName = appt.user?.name || '—';
  const clientName = appt.client?.name || '—';
  const deskName = appt.desk?.name || '—';
  const ticketNum = appt.ticket?.number || '—';
  const ticketTitle = appt.ticket?.title || '—';

  let desc = appt.description || '';
  if (desc.length > 120) desc = desc.substring(0, 120) + '...';

  let text = `**#${appt.id}** · ${date} · ${initTime}–${endTime}\n`;
  text += `  👤 ${userName} · 🏢 ${clientName} · 🗂️ ${deskName} · 🎫 #${ticketNum} — ${ticketTitle}\n`;
  if (desc) text += `  📝 ${desc}\n`;

  if (appt.external_user_name) {
    text += `  👷 Executor: ${appt.external_user_name}\n`;
  }

  const val = appt.valorization;
  if (val && typeof val === 'object') {
    const attendanceLabel = ATTENDANCE_LABELS[val.attendance] || val.attendance || 'N/A';
    let valLine = `  💰 ${attendanceLabel}`;
    if (val.value != null && val.value !== '') valLine += ` · ${currencyBRL(val.value)}`;
    if (val.guarantee === true) valLine += ' · 🛡️ Garantia';
    if (val.manual_value === true) valLine += ' · ✋ Valor manual';
    text += valLine + '\n';

    if (val.shift_owner_ticket) {
      const sot = val.shift_owner_ticket;
      text += `  🚗 Deslocamento de: #${sot.ticket_number || 'N/A'} — ${sot.title || 'N/A'}\n`;
    }
  }

  text += '\n';
  return text;
}

function formatAppointmentsGlobalList(appointments, opts = {}) {
  return renderList({
    items: appointments,
    title: 'Apontamentos',
    emptyMessage: 'Nenhum apontamento encontrado para o período e filtros informados.',
    renderItem: renderAppointmentItem,
    total: opts.total,
    offset: opts.offset,
    limit: opts.limit,
    unit: 'apontamentos',
    verbosity: opts.verbosity
  });
}

async function execute(args, { api, verbosity }) {
  const {
    start_date,
    end_date,
    user_ids,
    user_names,
    desk_ids,
    desk_names,
    include_valorization,
    offset = 1,
    limit = 20
  } = args;

  const periodError = validateRequiredPeriod({ start_date, end_date });
  if (periodError) return periodError;

  const userNamesRequested = !!(user_names || user_ids);

  const resolvedIds = await resolveAppointmentFilterIds(api, { user_ids, user_names, desk_ids, desk_names });
  if (resolvedIds.error) return resolvedIds.response;
  const { userIds: finalUserIds, deskIds: finalDeskIds } = resolvedIds;

  const effectiveOffset = Math.max(1, Number.parseInt(offset) || 1);
  const effectiveLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  try {
    const response = await api.listAppointmentsGlobal({
      start_date,
      end_date,
      user_ids: finalUserIds,
      desk_ids: finalDeskIds,
      include_valorization: include_valorization === true,
      offset: effectiveOffset,
      limit: effectiveLimit
    });

    if (response.error) {
      return appointmentsApiErrorResponse(response, '**❌ Erro ao listar apontamentos**');
    }

    const appointments = response.data || [];
    const total = response.total;

    let result = formatAppointmentsGlobalList(appointments, {
      total,
      offset: effectiveOffset,
      limit: effectiveLimit,
      verbosity
    });

    // Nota informativa: user_ids pode ter sido silenciado pela API se sem view_users_manage
    if (userNamesRequested && appointments.length > 0) {
      result += '\n\n> ⚠️ **Nota:** se este usuário não tem a permissão "Visualizar relatórios dos técnicos", o filtro por técnico pode ter sido ignorado pela API — os resultados podem incluir apontamentos de outros técnicos.';
    }

    return textResponse(result);
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao listar apontamentos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatAppointmentsGlobalList };

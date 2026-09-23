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
const { renderList, renderWithinBudget, currencyBRL, row, pagination, truncate, listVerbosity, cutCountLabel, RESPONSE_ITEM_BUDGET } = require('../_shared/format');
const { durationMinutes } = require('./appointmentMath');
const { compactValorizationCells } = require('./valorizationCompact');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { renderAppliedFilters } = require('../_shared/appliedFilters');
const {
  ATTENDANCE_LABELS,
  CONTRACT_FILTER_NOTICE,
  appointmentFilterSchemaProperties,
  validateRequiredPeriod,
  resolveAppointmentFilterIds,
  appointmentsApiErrorResponse
} = require('./appointmentFilters');

const schema = {
  name: 'list_appointments_global',
  description: 'Listar apontamentos globais por período, com filtros opcionais por técnico, mesa, cliente e contrato. Requer permissão de acesso ao endpoint de apontamentos. Quando user_ids/user_names é informado, inclui nota se o filtro pode estar sendo ignorado por falta de permissão "Visualizar relatórios dos técnicos". Com include_valorization=true, exibe tipo de atendimento, valor, 🛡️ Garantia (quando guarantee=true) e ✋ Valor manual (quando manual_value=true — valor digitado manualmente, contornando a tarifa do contrato). Filtro por cliente (client_ids/client_names) e por contrato (contract_ids) disponíveis — note que apontamentos sem contrato somem do resultado quando contract_ids está ativo. Use list_appointments_report para obter o relatório agregado por N2 com totalizadores.',
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
  // item 7: client e campo de TOPO do item (appt.client), nao vem de appt.ticket.client
  const clientName = appt.client?.name || '—';
  const deskName = appt.desk?.name || '—';
  const ticketNum = appt.ticket?.number || '—';
  const ticketTitle = appt.ticket?.title || '—';
  // item 6: contract e campo de topo do apontamento (view :global); sem exigir include_valorization
  const contractName = appt.contract?.name || 'sem contrato';

  let desc = appt.description || '';
  if (desc.length > 120) desc = desc.substring(0, 120) + '...';

  let text = `**#${appt.id}** · ${date} · ${initTime}–${endTime}\n`;
  text += `  👤 ${userName} · 🏢 ${clientName} · 📋 ${contractName} · 🗂️ ${deskName} · 🎫 #${ticketNum} — ${ticketTitle}\n`;
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

const COMPACT_COLUMNS = ['id', 'data', 'ini', 'fim', 'min', 'tecnico', 'cliente', 'contrato', 'mesa', 'ticket', 'atend', 'valor', 'flags', 'desc'];

function compactAppointmentCells(appt) {
  const { attendance, value, flags } = compactValorizationCells(appt.valorization);
  if (appt.external_user_name) flags.push(`executor:${appt.external_user_name}`);

  // Política única de truncamento no compact (F2): 200 caracteres, via helper
  // compartilhado — antes truncava em 80 aqui, sem paridade com o resto do produto.
  const desc = truncate(appt.description, 200);

  return [
    appt.id,
    appt.date,
    appt.init_time,
    appt.end_time,
    durationMinutes(appt.init_time, appt.end_time),
    appt.user?.name,
    appt.client?.name,
    appt.contract?.name || 'sem contrato',
    appt.desk?.name,
    appt.ticket?.number,
    attendance,
    value,
    flags.length ? flags.join(';') : '—',
    desc
  ];
}

function formatAppointmentsGlobalListCompact(appointments, opts = {}) {
  if (!appointments || appointments.length === 0) {
    return 'Nenhum apontamento encontrado para o período e filtros informados.';
  }

  const hasTotal = opts.total !== undefined && opts.total !== null && opts.total !== appointments.length;
  const countLabel = hasTotal ? `${appointments.length} de ${opts.total}` : `${appointments.length}`;

  const columns = `${COMPACT_COLUMNS.join('|')}\n`;

  return renderWithinBudget({
    head: `Apontamentos (${countLabel}) · min · BRL\n${columns}`,
    truncatedHead: (shown) => `Apontamentos (${cutCountLabel(shown, opts.total, appointments.length)}) · min · BRL\n${columns}`,
    parts: appointments.map(appt => `${row(compactAppointmentCells(appt))}\n`),
    pagination: pagination({
      offset: opts.offset,
      limit: opts.limit,
      count: appointments.length,
      total: opts.total,
      unit: 'apontamentos'
    }, 'compact'),
    maxChars: opts.maxChars,
    offset: opts.offset,
    limit: opts.limit,
    unit: 'apontamentos',
    verbosity: 'compact',
    total: opts.total
  });
}

function formatAppointmentsGlobalList(appointments, opts = {}) {
  if (opts.verbosity === 'compact') return formatAppointmentsGlobalListCompact(appointments, opts);

  return renderList({
    items: appointments,
    title: 'Apontamentos',
    emptyMessage: 'Nenhum apontamento encontrado para o período e filtros informados.',
    renderItem: renderAppointmentItem,
    total: opts.total,
    offset: opts.offset,
    limit: opts.limit,
    unit: 'apontamentos',
    verbosity: opts.verbosity,
    maxChars: opts.maxChars
  });
}

/**
 * Monta as notas/avisos de rodapé anexadas após a lista (nota de permissão de
 * user_names + aviso de contract_ids). Extraído do `execute()` para reduzir a
 * complexidade cognitiva (Sonar: `execute` estava em 18, acima do limite de 15).
 *
 * @param {string} verbosity - 'rich' | 'compact'
 * @param {object} opts
 * @param {boolean} opts.userNamesRequested - user_ids/user_names foi informado
 * @param {number} opts.appointmentsLength - itens retornados (a nota de permissão só faz sentido com >0)
 * @param {string|null} opts.finalContractIds - contract_ids resolvido (null = filtro inativo)
 * @returns {string} texto a concatenar ao resultado (pode ser vazio)
 */
function buildNotices(verbosity, { userNamesRequested, appointmentsLength, finalContractIds }) {
  const isCompact = verbosity === 'compact';
  let notices = '';

  // Nota informativa: user_ids pode ter sido silenciado pela API se sem view_users_manage
  if (userNamesRequested && appointmentsLength > 0) {
    notices += isCompact
      ? '\n[aviso: sem permissão "Visualizar relatórios dos técnicos" o filtro por técnico pode ter sido ignorado pela API]'
      : '\n\n> ⚠️ **Nota:** se este usuário não tem a permissão "Visualizar relatórios dos técnicos", o filtro por técnico pode ter sido ignorado pela API — os resultados podem incluir apontamentos de outros técnicos.';
  }

  // Rodape quando contract_ids ativo: avisa sobre A2 (sem contrato some) e A1 (Shared expande id)
  if (finalContractIds) {
    const contractFooter = renderAppliedFilters([
      { label: 'contract_ids', value: finalContractIds, origin: 'informado' }
    ], verbosity);

    if (isCompact) {
      if (contractFooter) notices += `\n${contractFooter}`;
      notices += '\n[aviso: contract_ids ativo — apontamentos sem contrato excluídos; em contratos Shared, contract.id retornado pode diferir do filtrado (grupo→membro) — NÃO refiltrar por contract.id]';
    } else {
      if (contractFooter) notices += `\n\n${contractFooter}`;
      notices += `\n\n${CONTRACT_FILTER_NOTICE}`;
    }
  }

  return notices;
}

async function execute(args, { api, verbosity: ctxVerbosity, verbosityExplicit }) {
  const {
    start_date,
    end_date,
    user_ids,
    user_names,
    desk_ids,
    desk_names,
    client_ids,
    client_names,
    contract_ids,
    include_valorization,
    offset = 1,
    limit = 20
  } = args;

  const periodError = validateRequiredPeriod({ start_date, end_date });
  if (periodError) return periodError;

  const userNamesRequested = !!(user_names || user_ids);

  const resolvedIds = await resolveAppointmentFilterIds(api, { user_ids, user_names, desk_ids, desk_names, client_ids, client_names, contract_ids });
  if (resolvedIds.error) return resolvedIds.response;
  const { userIds: finalUserIds, deskIds: finalDeskIds, clientIds: finalClientIds, contractIds: finalContractIds } = resolvedIds;

  const effectiveOffset = Math.max(1, Number.parseInt(offset) || 1);
  const effectiveLimit = Math.min(200, Math.max(1, Number.parseInt(limit) || 20));

  try {
    const response = await api.listAppointmentsGlobal({
      start_date,
      end_date,
      user_ids: finalUserIds,
      desk_ids: finalDeskIds,
      client_ids: finalClientIds,
      contract_ids: finalContractIds,
      include_valorization: include_valorization === true,
      offset: effectiveOffset,
      limit: effectiveLimit
    });

    if (response.error) {
      return appointmentsApiErrorResponse(response, '**❌ Erro ao listar apontamentos**');
    }

    const appointments = response.data || [];
    const total = response.total;
    // F4: sem verbosidade explicita e com > 50 itens na pagina, sai em compact (com aviso).
    const { verbosity, notice: autoCompactNotice } = listVerbosity({ verbosity: ctxVerbosity, verbosityExplicit }, appointments.length);

    const notices = buildNotices(verbosity, {
      userNamesRequested,
      appointmentsLength: appointments.length,
      finalContractIds
    }) + autoCompactNotice;

    // Teto por item (F3): a lista desconta o tamanho dos avisos anexados depois dela.
    const result = formatAppointmentsGlobalList(appointments, {
      total,
      offset: effectiveOffset,
      limit: effectiveLimit,
      verbosity,
      maxChars: RESPONSE_ITEM_BUDGET - notices.length
    });

    return textResponse(result + notices);
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao listar apontamentos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatAppointmentsGlobalList };

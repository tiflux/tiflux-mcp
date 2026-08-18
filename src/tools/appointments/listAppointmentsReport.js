/**
 * Slice: list_appointments_report — relatório agregado de apontamentos por N2 e mesa.
 *
 * Endpoint: GET /appointments (via api.listAppointmentsGlobal).
 * Pagina até X-Total-Items, concatena todos os apontamentos e agrega:
 *   - por N2 (user): contagem + soma de horas
 *   - sub-quebra por mesa quando desk_ids/desk_names informados
 *   - totalizadores por N2 e geral
 *
 * Soma de horas: parse HH:MM → minutos → soma → formatar de volta.
 * periodMath.js NÃO é usado aqui (faz aritmética de períodos em ms, não HH:MM).
 *
 * Permissão: mesma de list_appointments_global (403 40301/40304 mapeados).
 * Resolução: user_names via userResolver; desk_names via deskResolver.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { currencyBRL } = require('../_shared/format');
const {
  appointmentFilterSchemaProperties,
  validateRequiredPeriod,
  resolveAppointmentFilterIds,
  appointmentsApiErrorResponse
} = require('./appointmentFilters');

const schema = {
  name: 'list_appointments_report',
  description: 'Relatório agregado de apontamentos por técnico N2 e mesa para um período. Agrupa por técnico (user) com contagem de apontamentos e soma de horas; sub-quebra opcional por mesa quando desk_ids/desk_names informados. Com include_valorization=true, inclui soma de valor por técnico e mesa, com montante de valor manual apartado nos totalizadores quando houver apontamentos com manual_value=true — essencial para auditorias de faturamento. Ideal para relatórios de apoio N2. Requer permissão de acesso ao endpoint de apontamentos.',
  inputSchema: {
    type: 'object',
    properties: appointmentFilterSchemaProperties({
      user_ids: 'IDs dos técnicos N2 separados por vírgula (máximo 15). Use user_names para resolução por nome.',
      user_names: 'Nomes dos técnicos N2 separados por vírgula para resolução automática (alternativa a user_ids). Ambiguidade → lista para desambiguação.',
      desk_ids: 'IDs das mesas separados por vírgula (máximo 15) para sub-quebra por mesa no relatório. Use desk_names para resolução por nome.',
      desk_names: 'Nomes das mesas separados por vírgula para resolução automática (alternativa a desk_ids).',
      include_valorization: 'Incluir soma do valor de valorização por técnico (e por mesa). Padrão: false.'
    }),
    required: ['start_date', 'end_date']
  }
};

// "HH:MM" (sem flag /g — exec() não guarda lastIndex entre chamadas)
const HHMM_PATTERN = /^(\d+):(\d{2})$/;

/**
 * Calcula a duração entre init_time e end_time em minutos.
 * Retorna 0 se qualquer tempo for inválido ou se end <= init.
 * @param {string} initTime - "HH:MM"
 * @param {string} endTime - "HH:MM"
 * @returns {number} duração em minutos (>= 0)
 */
function durationMinutes(initTime, endTime) {
  // Valida ambos antes de calcular — tempo inválido em qualquer extremo → 0
  const initMatch = typeof initTime === 'string' ? HHMM_PATTERN.exec(initTime) : null;
  const endMatch = typeof endTime === 'string' ? HHMM_PATTERN.exec(endTime) : null;
  if (!initMatch || !endMatch) return 0;
  const initMin = Number.parseInt(initMatch[1], 10) * 60 + Number.parseInt(initMatch[2], 10);
  const endMin = Number.parseInt(endMatch[1], 10) * 60 + Number.parseInt(endMatch[2], 10);
  return Math.max(0, endMin - initMin);
}

/**
 * Formata minutos totais como "HH:MM" (ex: 90 → "1:30").
 * @param {number} totalMinutes
 * @returns {string}
 */
function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Agrega lista de apontamentos por usuário e, opcionalmente, por mesa.
 *
 * Retorna mapa: userId → { userName, count, minutes, value, manualValue, desks: Map deskId→{deskName,count,minutes,value,manualValue} }
 * @param {Array} appointments
 * @param {boolean} includeValorization
 * @returns {Map<number, object>}
 */
function aggregateByUser(appointments, includeValorization) {
  const userMap = new Map();

  for (const appt of appointments) {
    const userId = appt.user?.id ?? 'unknown';
    const userName = appt.user?.name || 'Técnico desconhecido';
    const deskId = appt.desk?.id ?? 'unknown';
    const deskName = appt.desk?.name || 'Mesa desconhecida';
    const dur = durationMinutes(appt.init_time, appt.end_time);
    const val = includeValorization
      ? Number.parseFloat(appt.valorization?.value) || 0
      : 0;
    const isManual = includeValorization && appt.valorization?.manual_value === true;
    const manualVal = isManual ? Number.parseFloat(appt.valorization?.value) || 0 : 0;

    if (!userMap.has(userId)) {
      userMap.set(userId, { userName, count: 0, minutes: 0, value: 0, manualValue: 0, desks: new Map() });
    }
    const userEntry = userMap.get(userId);
    userEntry.count += 1;
    userEntry.minutes += dur;
    userEntry.value += val;
    userEntry.manualValue += manualVal;

    if (!userEntry.desks.has(deskId)) {
      userEntry.desks.set(deskId, { deskName, count: 0, minutes: 0, value: 0, manualValue: 0 });
    }
    const deskEntry = userEntry.desks.get(deskId);
    deskEntry.count += 1;
    deskEntry.minutes += dur;
    deskEntry.value += val;
    deskEntry.manualValue += manualVal;
  }

  return userMap;
}

/**
 * Sufixo com o montante de valor manual apartado. Vazio quando não há valor manual.
 * @param {number} manualValue
 * @param {string} label - texto após o valor (ex: ' manual', ' em valor manual')
 * @returns {string}
 */
function manualValueSuffix(manualValue, label) {
  if (manualValue > 0) return ` (${currencyBRL(manualValue)}${label})`;
  return '';
}

/**
 * Renderiza o bloco de um técnico (linha de totais + sub-quebra por mesa).
 * @param {object} entry - entrada do userMap
 * @param {{includeValorization: boolean, showDeskBreakdown: boolean}} opts
 * @returns {string}
 */
function renderUserSection(entry, { includeValorization, showDeskBreakdown }) {
  let text = `### 👤 ${entry.userName}\n`;
  text += `**Apontamentos:** ${entry.count} · **Horas:** ${formatMinutes(entry.minutes)}`;
  if (includeValorization) {
    text += ` · **Valor:** ${currencyBRL(entry.value)}${manualValueSuffix(entry.manualValue, ' manual')}`;
  }
  text += '\n';

  if (showDeskBreakdown && entry.desks.size > 0) {
    const sortedDesks = [...entry.desks.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [, deskEntry] of sortedDesks) {
      text += `  - 🗂️ **${deskEntry.deskName}:** ${deskEntry.count} apontamento(s) · ${formatMinutes(deskEntry.minutes)}h`;
      if (includeValorization) {
        text += ` · ${currencyBRL(deskEntry.value)}${manualValueSuffix(deskEntry.manualValue, ' manual')}`;
      }
      text += '\n';
    }
  }

  return text + '\n';
}

function formatReport(userMap, opts = {}) {
  const { start_date, end_date, includeValorization, showDeskBreakdown, totalCount, totalMinutes, totalValue, totalManualValue } = opts;

  let text = `## Relatório de Apontamentos por Técnico\n\n`;
  text += `**Período:** ${start_date} a ${end_date}\n`;
  text += `**Total de apontamentos:** ${totalCount}\n`;
  text += `**Total de horas:** ${formatMinutes(totalMinutes)}\n`;
  if (includeValorization) {
    text += `**Valor total:** ${currencyBRL(totalValue)}${manualValueSuffix(totalManualValue, ' em valor manual')}\n`;
  }
  text += '\n---\n\n';

  if (userMap.size === 0) {
    text += '_Nenhum apontamento encontrado para os filtros informados._\n';
    return text;
  }

  // Ordenar por contagem desc
  const sorted = [...userMap.entries()].sort((a, b) => b[1].count - a[1].count);

  for (const [, entry] of sorted) {
    text += renderUserSection(entry, { includeValorization, showDeskBreakdown });
  }

  return text;
}

const PAGE_LIMIT = 200;

/**
 * Pagina GET /appointments até X-Total-Items e concatena todos os apontamentos.
 * @param {object} api - TiFluxAPI
 * @param {object} filters - filtros já resolvidos (start_date, end_date, user_ids, desk_ids, include_valorization)
 * @returns {Promise<{error?: boolean, response?: object, appointments?: Array}>}
 */
async function fetchAllAppointments(api, filters) {
  const allAppointments = [];
  let page = 1;
  let totalItems = null;

  do {
    const response = await api.listAppointmentsGlobal({ ...filters, offset: page, limit: PAGE_LIMIT });

    if (response.error) return { error: true, response };

    const pageData = response.data || [];
    allAppointments.push(...pageData);

    if (totalItems === null && response.total != null) {
      totalItems = response.total;
    }

    if (pageData.length < PAGE_LIMIT) break;
    if (totalItems !== null && allAppointments.length >= totalItems) break;

    page += 1;
  } while (true); // eslint-disable-line no-constant-condition

  return { appointments: allAppointments };
}

/**
 * Soma os totalizadores gerais a partir do mapa agregado por técnico.
 * @param {Map<number, object>} userMap
 * @returns {{totalCount: number, totalMinutes: number, totalValue: number, totalManualValue: number}}
 */
function sumTotals(userMap) {
  const totals = { totalCount: 0, totalMinutes: 0, totalValue: 0, totalManualValue: 0 };
  for (const entry of userMap.values()) {
    totals.totalCount += entry.count;
    totals.totalMinutes += entry.minutes;
    totals.totalValue += entry.value;
    totals.totalManualValue += entry.manualValue;
  }
  return totals;
}

async function execute(args, { api }) {
  const {
    start_date,
    end_date,
    user_ids,
    user_names,
    desk_ids,
    desk_names,
    include_valorization
  } = args;

  const periodError = validateRequiredPeriod({ start_date, end_date });
  if (periodError) return periodError;

  const hasDeskFilter = !!(desk_ids || desk_names);

  const resolvedIds = await resolveAppointmentFilterIds(api, { user_ids, user_names, desk_ids, desk_names });
  if (resolvedIds.error) return resolvedIds.response;
  const { userIds: finalUserIds, deskIds: finalDeskIds } = resolvedIds;

  const includeValorization = include_valorization === true;

  try {
    const paged = await fetchAllAppointments(api, {
      start_date,
      end_date,
      user_ids: finalUserIds,
      desk_ids: finalDeskIds,
      include_valorization: includeValorization
    });

    if (paged.error) {
      return appointmentsApiErrorResponse(paged.response, '**❌ Erro ao buscar apontamentos para o relatório**');
    }

    const allAppointments = paged.appointments;

    if (allAppointments.length === 0) {
      return textResponse(
        `## Relatório de Apontamentos por Técnico\n\n` +
        `**Período:** ${start_date} a ${end_date}\n\n` +
        '_Nenhum apontamento encontrado para os filtros informados._\n\n' +
        '*✅ Dados obtidos da API TiFlux em tempo real*'
      );
    }

    const userMap = aggregateByUser(allAppointments, includeValorization);
    const { totalCount, totalMinutes, totalValue, totalManualValue } = sumTotals(userMap);

    const reportText = formatReport(userMap, {
      start_date,
      end_date,
      includeValorization,
      showDeskBreakdown: hasDeskFilter,
      totalCount,
      totalMinutes,
      totalValue,
      totalManualValue
    });

    return textResponse(reportText + '\n*✅ Dados obtidos da API TiFlux em tempo real*');
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao gerar relatório de apontamentos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, formatReport, durationMinutes, formatMinutes };

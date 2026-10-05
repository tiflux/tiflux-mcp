/**
 * Slice: get_technical_group — detalhe de um grupo de atendentes.
 *
 * Endpoint: GET /technical-groups/{id} (via api.getTechnicalGroup).
 *
 * Campos (shape inferido do `example` da Swagger — endpoint sem schema formal):
 * id, name, description, has_compromise, send_periodic_appointment_hours,
 * expedients[] ({ beginning, ending, days, holiday }) e, com
 * show_departments=true, departments[] ({ id, name }).
 *
 * O `technical_group_id` precisa vir de uma linha de list_technical_groups —
 * a API nao aceita busca por nome neste nem naquele endpoint.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { TECHNICAL_GROUP, groupIdSchemaProperty, groupErrorResponse, isGroupObject, unexpectedGroupResponse } = require('../_shared/organizationGroups');
const { truncate, footer } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');

const schema = {
  name: 'get_technical_group',
  description: 'Buscar o detalhe de um grupo de atendentes pelo ID: nome, descricao, se tem compromisso de atendimento (has_compromise), envio periodico de horas (send_periodic_appointment_hours) e os expedientes (horario de inicio/fim, dias da semana, se e feriado). Informe show_departments:true para tambem trazer os departamentos vinculados (id, nome) — desligado por padrao. O technical_group_id precisa vir de uma linha de list_technical_groups (a API nao aceita busca por nome). Requer permissao "Gerenciar mesas de servicos".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(TECHNICAL_GROUP),
      show_departments: {
        type: 'boolean',
        description: 'Se true, inclui a lista de departamentos vinculados ao grupo (id, nome). Padrao: false.'
      }
    },
    required: ['technical_group_id']
  }
};

function formatExpedientRich(exp) {
  const periodo = `${exp.beginning || '—'}–${exp.ending || '—'}`;
  const dias = exp.days || '—';
  const feriado = exp.holiday ? ' (feriado)' : '';
  return `- ${periodo} · ${dias}${feriado}`;
}

function formatGroup(group, verbosity) {
  const v = verbosity || 'rich';
  const name = group.name || 'N/A';
  const expedients = Array.isArray(group.expedients) ? group.expedients : [];
  const hasDepartmentsField = Object.prototype.hasOwnProperty.call(group, 'departments');
  const departments = Array.isArray(group.departments) ? group.departments : [];

  if (v === 'compact') {
    let text = `**${escapeCell(name)}** (#${group.id})\n`;
    text += `Compromisso: ${group.has_compromise ? 'Sim' : 'Nao'} · Expedientes: ${expedients.length}`;
    if (hasDepartmentsField) text += ` · Departamentos: ${departments.length}`;
    return text;
  }

  const lines = [`## Grupo de atendentes: ${escapeCell(name)} (#${group.id})`, ''];

  if (group.description) lines.push(`**Descricao:** ${escapeCell(truncate(group.description, 800))}`);
  lines.push(
    `**Compromisso de atendimento:** ${group.has_compromise ? 'Sim' : 'Nao'}`,
    `**Envio periodico de horas:** ${group.send_periodic_appointment_hours || '—'}`,
    '',
    `### Expedientes (${expedients.length})`
  );
  if (expedients.length > 0) {
    expedients.forEach(exp => lines.push(formatExpedientRich(exp)));
  } else {
    lines.push('*Nenhum expediente cadastrado.*');
  }

  if (hasDepartmentsField) {
    lines.push('', `### Departamentos (${departments.length})`);
    if (departments.length > 0) {
      departments.forEach(dep => lines.push(`- **${dep.id}** — ${escapeCell(dep.name || '—')}`));
    } else {
      lines.push('*Nenhum departamento vinculado.*');
    }
  }

  lines.push('', footer(v));
  return lines.join('\n');
}

async function execute(args, { api, verbosity }) {
  const technical_group_id = requireIntField(args, 'technical_group_id');
  const show_departments = args.show_departments === true;

  try {
    const response = await api.getTechnicalGroup(technical_group_id, { showDepartments: show_departments });

    if (response.error) {
      return groupErrorResponse(TECHNICAL_GROUP, technical_group_id, `buscar ${TECHNICAL_GROUP.noun} #${technical_group_id}`, response);
    }

    if (!isGroupObject(response.data)) {
      return unexpectedGroupResponse(TECHNICAL_GROUP, technical_group_id, response.status);
    }

    return textResponse(formatGroup(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar grupo de atendentes #${technical_group_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatGroup };

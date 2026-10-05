/**
 * Slice: get_role_group — detalhe de um grupo de permissoes, incluindo roles[].
 *
 * Endpoint: GET /role-groups/{id} (via api.getRoleGroup).
 *
 * Campos: id, name, description, deletable e roles[] ({ id, name, description })
 * — a lista de permissoes concedidas pelo grupo.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { ROLE_GROUP, groupIdSchemaProperty, groupErrorResponse, isGroupObject, unexpectedGroupResponse } = require('../_shared/organizationGroups');
const { truncate, footer } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');

const ROLE_DESCRIPTION_MAX = 200;

const schema = {
  name: 'get_role_group',
  description: 'Buscar o detalhe de um grupo de permissoes pelo ID: nome, descricao, se pode ser excluido (deletable) e a lista de permissoes concedidas (roles — id, nome e descricao de cada permissao). O role_group_id precisa vir de uma linha de list_role_groups. Requer permissao "Gerenciar grupos de permissao".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(ROLE_GROUP)
    },
    required: ['role_group_id']
  }
};

function formatGroup(group, verbosity) {
  const v = verbosity || 'rich';
  const name = group.name || 'N/A';
  const roles = Array.isArray(group.roles) ? group.roles : [];
  const deletable = group.deletable === false ? 'Nao' : 'Sim';

  if (v === 'compact') {
    const names = roles.length > 0 ? roles.map(r => r.name || '—').join('; ') : '—';
    return `**${escapeCell(name)}** (#${group.id}) · excluivel: ${deletable.toLowerCase()}\nPermissoes (${roles.length}): ${names}`;
  }

  const lines = [`## Grupo de permissoes: ${escapeCell(name)} (#${group.id})`, ''];
  if (group.description) lines.push(`**Descricao:** ${escapeCell(group.description)}`);
  lines.push(`**Excluivel:** ${deletable}`, '', `### Permissoes concedidas (${roles.length})`);

  if (roles.length > 0) {
    roles.forEach(role => {
      const roleName = escapeCell(role.name || '—');
      const roleDesc = role.description ? escapeCell(truncate(role.description, ROLE_DESCRIPTION_MAX)) : null;
      lines.push(roleDesc ? `- **${roleName}** (#${role.id}) — ${roleDesc}` : `- **${roleName}** (#${role.id})`);
    });
  } else {
    lines.push('*Nenhuma permissao associada a este grupo.*');
  }

  lines.push('', footer(v));
  return lines.join('\n');
}

async function execute(args, { api, verbosity }) {
  const role_group_id = requireIntField(args, 'role_group_id');

  try {
    const response = await api.getRoleGroup(role_group_id);

    if (response.error) {
      return groupErrorResponse(ROLE_GROUP, role_group_id, `buscar ${ROLE_GROUP.noun} #${role_group_id}`, response);
    }

    if (!isGroupObject(response.data)) {
      return unexpectedGroupResponse(ROLE_GROUP, role_group_id, response.status);
    }

    return textResponse(formatGroup(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar grupo de permissoes #${role_group_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatGroup };

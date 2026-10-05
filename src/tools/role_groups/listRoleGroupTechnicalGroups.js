/**
 * Slice: list_role_group_technical_groups — grupos de atendentes vinculados a
 * um grupo de permissoes.
 *
 * Endpoint: GET /role-groups/{id}/technical-groups (via api.listRoleGroupTechnicalGroups).
 *
 * Campos: id, name (do grupo de atendentes).
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { ROLE_GROUP, groupIdSchemaProperty, createGroupSubresourceList, renderIdName } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_role_group_technical_groups',
  description: 'Listar os grupos de atendentes (technical groups) vinculados a um grupo de permissoes. Informe role_group_id (obtido via list_role_groups). Retorna id e nome de cada grupo de atendentes. Requer permissao "Gerenciar grupos de permissao".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(ROLE_GROUP),
      ...paginationSchemaProperties()
    },
    required: ['role_group_id']
  }
};

const execute = createGroupSubresourceList({
  kind: ROLE_GROUP,
  apiMethod: 'listRoleGroupTechnicalGroups',
  action: 'listar grupos de atendentes',
  itemsLabel: 'Grupos de atendentes',
  emptyMessage: (id) => `**Nenhum grupo de atendentes vinculado ao grupo de permissoes #${id}**`,
  unit: 'grupos',
  renderItem: renderIdName
});

module.exports = { name: schema.name, schema, execute };

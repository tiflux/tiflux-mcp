/**
 * Slice: list_technical_group_users — usuarios/atendentes de um grupo de atendentes.
 *
 * Endpoint: GET /technical-groups/{id}/users (via api.listTechnicalGroupUsers).
 *
 * Descoberta: este endpoint ja era tocado pelo fallback interno de
 * smartSearchUsers (src/tools/_shared/userResolver.js) para usuarios
 * nao-admin, mas nunca teve tool propria.
 *
 * Campos (shape inferido do `example` da Swagger — endpoint sem schema formal):
 * id, name, email, active, _type, gauth_enabled, last_login_at, technical_group_id.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { TECHNICAL_GROUP, groupIdSchemaProperty, createGroupSubresourceList, renderGroupUser } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_technical_group_users',
  description: 'Listar os usuarios/atendentes de um grupo de atendentes. Informe technical_group_id (obtido via list_technical_groups). Retorna id, nome, e-mail, tipo (Cliente/Atendente/Administrador), se esta ativo, ultimo login e autenticacao em 2 fatores. Requer permissao "Gerenciar mesas de servicos".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(TECHNICAL_GROUP),
      ...paginationSchemaProperties()
    },
    required: ['technical_group_id']
  }
};

const execute = createGroupSubresourceList({
  kind: TECHNICAL_GROUP,
  apiMethod: 'listTechnicalGroupUsers',
  action: 'listar usuarios',
  itemsLabel: 'Usuarios',
  emptyMessage: (id) => `**Nenhum usuario encontrado para o grupo de atendentes #${id}**`,
  unit: 'usuarios',
  renderItem: renderGroupUser
});

module.exports = { name: schema.name, schema, execute };

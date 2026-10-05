/**
 * Slice: list_role_group_users — usuarios de um grupo de permissoes.
 *
 * Endpoint: GET /role-groups/{id}/users (via api.listRoleGroupUsers).
 *
 * Campos: id, name, email, _type (client/attendant/admin), active, gauth_enabled,
 * last_login_at, technical_group_id (grupo de atendentes do usuario).
 *
 * Nota (D6): o item da Swagger descreve `id` como "ID do grupo de permissoes" —
 * erro de documentacao. O `id` de cada item e do USUARIO, como o exemplo mostra.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { ROLE_GROUP, groupIdSchemaProperty, createGroupSubresourceList, renderGroupUser } = require('../_shared/organizationGroups');

const EMAIL_MAX_LENGTH = 255;

const schema = {
  name: 'list_role_group_users',
  description: 'Listar os usuarios de um grupo de permissoes. Informe role_group_id (obtido via list_role_groups). Filtro opcional email (ate 255 caracteres). Retorna id (do usuario — atencao: a Swagger descreve incorretamente este campo como "ID do grupo de permissoes"), nome, e-mail, tipo (Cliente/Atendente/Administrador), se esta ativo, ultimo login, autenticacao em 2 fatores e o grupo de atendentes do usuario. Requer permissao "Gerenciar grupos de permissao".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(ROLE_GROUP),
      email: {
        type: 'string',
        maxLength: EMAIL_MAX_LENGTH,
        description: 'Filtrar usuarios pelo e-mail (ate 255 caracteres). Opcional.'
      },
      ...paginationSchemaProperties()
    },
    required: ['role_group_id']
  }
};

/**
 * Filtro opcional `email`. O `maxLength` do schema depende do cliente MCP
 * aplica-lo — validado aqui tambem (defesa em profundidade).
 */
function emailFilter({ email }) {
  if (email === undefined || email === null || email === '') return {};
  if (typeof email !== 'string') throw new Error('email deve ser um texto');
  if (email.length > EMAIL_MAX_LENGTH) {
    throw new Error(`email excede o maximo de ${EMAIL_MAX_LENGTH} caracteres`);
  }
  return { email };
}

const execute = createGroupSubresourceList({
  kind: ROLE_GROUP,
  apiMethod: 'listRoleGroupUsers',
  action: 'listar usuarios',
  itemsLabel: 'Usuarios',
  emptyMessage: (id) => `**Nenhum usuario encontrado para o grupo de permissoes #${id}**`,
  unit: 'usuarios',
  renderItem: renderGroupUser,
  extraFilters: emailFilter
});

module.exports = { name: schema.name, schema, execute };

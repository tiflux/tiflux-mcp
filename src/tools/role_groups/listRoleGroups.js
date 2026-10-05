/**
 * Slice: list_role_groups — lista grupos de permissoes da organizacao.
 *
 * Endpoint: GET /role-groups (via api.listRoleGroups).
 *
 * Campos: id, name, deletable (grupo padrao da organizacao = nao excluivel,
 * ex: "Administrador", "Clientes").
 */

const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { row } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');
const { ROLE_GROUP, permissionTail, paginationFilters, pagedListResponse } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_role_groups',
  description: 'Listar os grupos de permissoes (role groups) da organizacao: ID, nome e se o grupo pode ser excluido (deletable — grupos padrao da organizacao, como "Administrador" e "Clientes", nao podem). A API NAO aceita filtro por nome/busca — apenas paginacao (offset/limit). O `id` retornado alimenta get_role_group e list_role_group_users/technical_groups. Requer permissao "Gerenciar grupos de permissao".',
  inputSchema: {
    type: 'object',
    properties: {
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function deletableLabel(deletable, verbosity) {
  if (deletable === false) return verbosity === 'compact' ? 'padrao' : 'padrao (nao excluivel)';
  return verbosity === 'compact' ? 'sim' : 'Sim';
}

function renderItem(verbosity) {
  return (group) => {
    const id = group.id ?? '—';
    const name = group.name || '—';
    const deletable = deletableLabel(group.deletable, verbosity);
    if (verbosity === 'compact') return `${row([id, name, deletable])}\n`;
    return `**ID ${id}** — ${escapeCell(name)} (excluivel: ${deletable})\n\n`;
  };
}

/** Dica contextual do erro, conforme o status HTTP retornado. */
function errorTail(response) {
  if (response.status === 403) return permissionTail(ROLE_GROUP);
  if (response.status === 401) return '*Verifique se a chave TIFLUX_API_KEY esta correta e ativa.*';
  return '*Verifique os parametros informados.*';
}

async function execute(args, ctx) {
  const filters = paginationFilters(args);

  try {
    const response = await ctx.api.listRoleGroups(filters);

    if (response.error) {
      return apiFailureResponse(
        '**❌ Erro ao listar grupos de permissoes**',
        response,
        errorTail(response)
      );
    }

    return pagedListResponse(response, filters, ctx, {
      title: 'Grupos de permissoes',
      emptyMessage: 'Nenhum grupo de permissoes encontrado.\n\n*Verifique a paginacao (offset/limit) ou suas permissoes.*',
      unit: 'grupos',
      renderItem
    });
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao listar grupos de permissoes**', error);
  }
}

module.exports = { name: schema.name, schema, execute };

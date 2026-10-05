/**
 * Slice: list_technical_groups — lista grupos de atendentes da organizacao.
 *
 * Endpoint: GET /technical-groups (via api.listTechnicalGroups).
 *
 * Descoberta: este endpoint ja era tocado pelo fallback interno de
 * smartSearchUsers/resolveTechnicalGroup (src/tools/_shared/userResolver.js,
 * technicalGroupResolver.js), mas nunca teve tool propria — sem ela a IA nao
 * tinha de onde tirar o `technical_group_id` exigido por get_technical_group,
 * list_technical_group_desks/clients/users, create_user/update_user
 * (technical_group_id) e technical_group_ids de create_knowledge/update_knowledge.
 *
 * A API v2 NAO aceita filtro por nome/busca neste endpoint (so paginacao
 * offset/limit) — a description orienta a IA a paginar ate achar o grupo.
 *
 * Sem schema formal na Swagger (so `example`) — o formatter e defensivo com
 * campos ausentes (`—`).
 */

const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { TECHNICAL_GROUP, permissionTail, paginationFilters, pagedListResponse, renderIdName } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_technical_groups',
  description: 'Listar os grupos de atendentes (technical groups) da organizacao: ID e nome. A API NAO aceita filtro por nome/busca neste endpoint — apenas paginacao (offset/limit); para localizar um grupo especifico, pagine (limit ate 200) e procure pelo nome na resposta. O `id` retornado alimenta get_technical_group, list_technical_group_desks/clients/users, os campos technical_group_id/technical_group_name de create_user/update_user e technical_group_ids de create_knowledge/update_knowledge. Requer permissao "Gerenciar mesas de servicos".',
  inputSchema: {
    type: 'object',
    properties: {
      ...paginationSchemaProperties()
    },
    required: []
  }
};

async function execute(args, ctx) {
  const filters = paginationFilters(args);

  try {
    const response = await ctx.api.listTechnicalGroups(filters);

    if (response.error) {
      return apiFailureResponse(
        '**❌ Erro ao listar grupos de atendentes**',
        response,
        response.status === 403 ? permissionTail(TECHNICAL_GROUP) : '*Verifique suas permissoes e tente novamente.*'
      );
    }

    return pagedListResponse(response, filters, ctx, {
      title: 'Grupos de atendentes',
      emptyMessage: 'Nenhum grupo de atendentes encontrado.\n\n*Verifique a paginacao (offset/limit) ou suas permissoes.*',
      unit: 'grupos',
      renderItem: renderIdName
    });
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao listar grupos de atendentes**', error);
  }
}

module.exports = { name: schema.name, schema, execute };

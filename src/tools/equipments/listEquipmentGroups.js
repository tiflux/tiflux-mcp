/**
 * Slice: list_equipment_groups — lista grupos de equipamentos/recursos.
 *
 * Endpoint: GET /equipment-groups (via api.listEquipmentGroups).
 * Filtro opcional: client_id (filtrar grupos de um cliente especifico).
 *
 * Grupos sao configurados por cliente — use este endpoint para descobrir
 * os IDs de grupo antes de criar ou atualizar equipamentos.
 *
 * Permissoes necessarias: "Visualizar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_equipment_groups',
  description:
    'Listar grupos de recursos/equipamentos. Retorna tabela com ID, nome e cliente de cada grupo. ' +
    'Use client_id para filtrar grupos de um cliente especifico antes de criar um recurso. ' +
    'Grupos sao configurados por cliente — cada cliente pode ter grupos diferentes. ' +
    'Requer permissao "Visualizar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'Filtrar grupos de um cliente especifico (ID do cliente). Recomendado ao criar recursos.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatGroupsList(groups, offset, limit, total, verbosity) {
  const v = verbosity || 'rich';

  if (!groups || groups.length === 0) {
    return 'Nenhum grupo de recursos encontrado.\n\n*Verifique os filtros aplicados e suas permissoes.*';
  }

  let text = `**Grupos de recursos (${groups.length})**\n\n`;
  text += '| ID | Nome | Cliente |\n';
  text += '|---|---|---|\n';

  groups.forEach(g => {
    const clientName = g.client?.name || '—';
    text += `| ${g.id} | ${g.name || '—'} | ${clientName} |\n`;
  });

  const paginationInfo = pagination(
    { offset, limit, count: groups.length, total, unit: 'grupos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { client_id, limit, offset } = args;

  try {
    const filters = {};

    if (client_id !== undefined) filters.client_id = client_id;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEquipmentGroups(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar grupos de recursos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes (requer "Visualizar recursos" e Licenca Tickets) e os filtros aplicados.*`
      );
    }

    const groups = response.data || [];
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);
    return textResponse(
      formatGroupsList(groups, effectiveOffset, effectiveLimit, response.total, verbosity)
    );
  } catch (error) {
    return internalErrorResponse('**Erro interno ao listar grupos de recursos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatGroupsList };

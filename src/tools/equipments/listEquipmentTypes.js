/**
 * Slice: list_equipment_types — lista tipos de equipamentos/recursos.
 *
 * Endpoint: GET /equipment-types (via api.listEquipmentTypes).
 * Filtro opcional: name (contains, case-insensitive — validado contra API real
 * em 2026-07-17: ex. "est" retorna "Estacao" e "Teste Udo").
 *
 * Tipos sao configurados por organizacao (defaults: "Estacao", "Hardware", "Software").
 * Use este endpoint para descobrir os IDs de tipo antes de criar equipamentos.
 *
 * Permissoes necessarias: "Visualizar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_equipment_types',
  description:
    'Listar tipos de recursos/equipamentos da organizacao. Retorna tabela com ID e nome de cada tipo. ' +
    'Use o filtro name para buscar por nome parcial (case-insensitive, ex: "esta" encontra "Estacao"). ' +
    'Tipos sao configurados por organizacao (defaults comuns: "Estacao", "Hardware", "Software"). ' +
    'Use este endpoint para obter o equipment_type_id antes de criar um recurso. ' +
    'Requer permissao "Visualizar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Filtrar tipos por nome (busca parcial, case-insensitive, maximo 255 caracteres). Opcional.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatTypesList(types, offset, limit, total, verbosity) {
  const v = verbosity || 'rich';

  if (!types || types.length === 0) {
    return 'Nenhum tipo de recurso encontrado.\n\n*Verifique o filtro de nome e suas permissoes.*';
  }

  let text = `**Tipos de recursos (${types.length})**\n\n`;
  text += '| ID | Nome |\n';
  text += '|---|---|\n';

  types.forEach(t => {
    text += `| ${t.id} | ${t.name || '—'} |\n`;
  });

  const paginationInfo = pagination(
    { offset, limit, count: types.length, total, unit: 'tipos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { name, limit, offset } = args;

  try {
    const filters = {};

    if (name !== undefined) filters.name = name;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEquipmentTypes(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar tipos de recursos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes (requer "Visualizar recursos" e Licenca Tickets).*`
      );
    }

    const types = response.data || [];
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);
    return textResponse(
      formatTypesList(types, effectiveOffset, effectiveLimit, response.total, verbosity)
    );
  } catch (error) {
    return internalErrorResponse('**Erro interno ao listar tipos de recursos**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatTypesList };

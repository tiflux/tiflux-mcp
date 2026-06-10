/**
 * Slice: list_entities — lista campos personalizados (entities) disponiveis na organizacao.
 *
 * Endpoint: GET /entities
 * Suporta filtros opcionais: active (boolean), applied_in (string), name (string), limit, offset.
 * Retorna tabela Markdown com ID, Nome, Applied In, Ativa.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');

const schema = {
  name: 'list_entities',
  description: 'Listar campos personalizados (entities) disponiveis na organizacao TiFlux. Use para descobrir quais grupos de campos personalizados existem, em quais aplicacoes estao habilitados (ticket, client, etc.) e seus IDs — necessarios para usar list_entity_fields.',
  inputSchema: {
    type: 'object',
    properties: {
      active: {
        type: 'boolean',
        description: 'Filtrar entities ativas (true) ou inativas (false). Padrao: todos.'
      },
      applied_in: {
        type: 'string',
        description: 'Filtrar por aplicacao: "ticket", "client", "solicitant", "services_catalog", "services_catalogs_area", "services_catalogs_item", "equipment".'
      },
      name: {
        type: 'string',
        description: 'Filtro por nome da entity (match parcial).'
      },
      limit: {
        type: 'number',
        description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
      },
      offset: {
        type: 'number',
        description: 'Numero da pagina (padrao: 1)'
      }
    },
    required: []
  }
};

function formatEntitiesList(entities) {
  if (!entities || entities.length === 0) {
    return 'Nenhum campo personalizado encontrado.\n\n*Verifique os filtros aplicados ou tente sem filtros para ver todos os campos disponíveis.*';
  }

  let text = `**Campos personalizados disponíveis (${entities.length})**\n\n`;
  text += '| ID | Nome | Applied In | Ativa |\n';
  text += '|---|---|---|---|\n';

  entities.forEach(entity => {
    const active = entity.active ? 'Sim' : 'Nao';
    const appliedIn = entity.applied_in || '—';
    text += `| ${entity.id} | ${entity.name || '—'} | ${appliedIn} | ${active} |\n`;
  });

  text += '\n*Para ver os subcampos de uma entity, use `list_entity_fields` com o `entity_id` correspondente.*';
  return text;
}

async function execute(args, { api }) {
  const { active, applied_in, name, limit, offset } = args;

  try {
    const filters = {};

    if (active !== undefined) filters.active = active;
    if (applied_in !== undefined) filters.applied_in = applied_in;
    if (name !== undefined) filters.name = name;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEntities(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar campos personalizados**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e tente novamente.*`
      );
    }

    const entities = response.data || [];
    return textResponse(formatEntitiesList(entities));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar campos personalizados**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEntitiesList };

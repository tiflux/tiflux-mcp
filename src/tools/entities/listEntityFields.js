/**
 * Slice: list_entity_fields — lista subcampos (entity_fields) de uma entity.
 *
 * Endpoint: GET /entities/{entity_id}/fields
 * Requer entity_id. Suporta filtros: field_type, required, name, limit, offset.
 * Retorna tabela Markdown destacando field_type e sinalizando opcoes para single_select/checkbox.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const TYPES_WITH_OPTIONS = new Set(['single_select', 'checkbox']);

const schema = {
  name: 'list_entity_fields',
  description: 'Listar subcampos (entity_fields) de um campo personalizado (entity) no TiFlux. Retorna nome, tipo (text, single_select, checkbox, date, etc.), obrigatoriedade e indica quais campos possuem opcoes selecionaveis — use list_entity_field_options nesses casos.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'number',
        description: 'ID do campo personalizado (entity) cujos subcampos serao listados. Obrigatorio. Obtenha via list_entities.'
      },
      field_type: {
        type: 'string',
        description: 'Filtrar por tipo: "text", "text_area", "currency", "phone", "email", "link", "date", "single_select", "checkbox".'
      },
      required: {
        type: 'boolean',
        description: 'Filtrar campos obrigatorios (true) ou opcionais (false).'
      },
      name: {
        type: 'string',
        description: 'Filtro por nome do subcampo.'
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
    required: ['entity_id']
  }
};

function formatEntityFieldsList(entityId, fields) {
  if (!fields || fields.length === 0) {
    return `Nenhum subcampo encontrado para a entity ID ${entityId}.\n\n*Verifique o entity_id ou ajuste os filtros.*`;
  }

  let text = `**Subcampos da entity ID ${entityId} (${fields.length})**\n\n`;
  text += '| ID | Nome | Tipo | Obrigatorio | Opcoes |\n';
  text += '|---|---|---|---|---|\n';

  fields.forEach(field => {
    const required = field.required ? 'Sim' : 'Nao';
    const hasOptions = TYPES_WITH_OPTIONS.has(field.field_type) ? 'Sim (use list_entity_field_options)' : 'Nao';
    text += `| ${field.id} | ${field.name || '—'} | ${field.field_type || '—'} | ${required} | ${hasOptions} |\n`;
  });

  text += '\n*Para campos com "Opcoes: Sim", use `list_entity_field_options` com o `entity_field_id` para ver as opcoes disponíveis.*';
  return text;
}

async function execute(args, { api }) {
  const { entity_id, field_type, required, name, limit, offset } = args;

  requireField(args, 'entity_id');

  try {
    const filters = {};

    if (field_type !== undefined) filters.field_type = field_type;
    if (required !== undefined) filters.required = required;
    if (name !== undefined) filters.name = name;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEntityFields(entity_id, filters);

    if (response.error) {
      return textResponse(
        `**Erro ao listar subcampos da entity ID ${entity_id}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o entity_id e valido e se voce tem permissao para acessar.*`
      );
    }

    const fields = response.data || [];
    return textResponse(formatEntityFieldsList(entity_id, fields));
  } catch (error) {
    return textResponse(
      `**Erro interno ao listar subcampos da entity**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEntityFieldsList };

/**
 * Slice: list_entity_field_options — lista opcoes de um entity_field do tipo single_select ou checkbox.
 *
 * Endpoint: GET /entity_fields/{entity_field_id}/options
 * Requer entity_field_id. Suporta filtro: value, limit, offset.
 * Retorna tabela Markdown com id, value, null_option.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_entity_field_options',
  description: 'Listar opcoes de um subcampo personalizado (entity_field) do tipo single_select ou checkbox no TiFlux. Use para obter os IDs de opcao (entity_field_option_id) necessarios ao preencher campos de multipla escolha via update_ticket_entities.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_field_id: {
        type: 'number',
        description: 'ID do subcampo (entity_field) cujas opcoes serao listadas. Obrigatorio. Obtenha via list_entity_fields.'
      },
      value: {
        type: 'string',
        description: 'Filtrar opcoes pelo valor/texto (busca parcial).'
      },
      ...paginationSchemaProperties()
    },
    required: ['entity_field_id']
  }
};

function formatEntityFieldOptionsList(entityFieldId, options) {
  if (!options || options.length === 0) {
    return `Nenhuma opcao encontrada para o entity_field ID ${entityFieldId}.\n\n*Este campo pode nao ser do tipo single_select ou checkbox, ou nao ter opcoes cadastradas. Verifique o field_type via list_entity_fields.*`;
  }

  let text = `**Opcoes do entity_field ID ${entityFieldId} (${options.length})**\n\n`;
  text += '| ID | Valor | Opcao nula |\n';
  text += '|---|---|---|\n';

  options.forEach(option => {
    const nullOption = option.null_option ? 'Sim' : 'Nao';
    text += `| ${option.id} | ${option.value || '—'} | ${nullOption} |\n`;
  });

  text += '\n*Use o `id` da opcao como `entity_field_option_id` ao chamar `update_ticket_entities` para checkbox multiplo. Para checkbox, envie um item por opcao com `entity_field_option_id` e `value: "true"` ou `"false"`.*';
  return text;
}

async function execute(args, { api }) {
  const { entity_field_id, value, limit, offset } = args;

  requireField(args, 'entity_field_id');

  try {
    const filters = {};

    if (value !== undefined) filters.value = value;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listEntityFieldOptions(entity_field_id, filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar opcoes do entity_field ID ${entity_field_id}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o entity_field_id e valido e se o campo e do tipo single_select ou checkbox.*`
      );
    }

    const options = response.data || [];
    return textResponse(formatEntityFieldOptionsList(entity_field_id, options));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar opcoes do entity_field**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatEntityFieldOptionsList };

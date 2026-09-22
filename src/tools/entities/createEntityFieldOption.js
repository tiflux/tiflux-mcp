/**
 * Slice: create_entity_field_option — adiciona uma opcao a um subcampo single_select/checkbox existente.
 *
 * Endpoint: POST /entity_fields/{entity_field_id}/options
 * Body: { value }.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'create_entity_field_option',
  description:
    'Adicionar uma opcao a um subcampo (entity_field) do tipo "single_select" ou "checkbox" ja existente no TiFlux. ' +
    'Use apos create_entity_field, ou para acrescentar mais opcoes a um campo ja criado (ex: substituir a opcao "Padrao"). ' +
    '⚠️ **Confirme com o usuario antes de executar**, resumindo o valor a ser adicionado. ' +
    'Requer a role **manage_entities**.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_field_id: {
        type: 'number',
        description: 'ID do subcampo (entity_field) onde a opcao sera criada. Obrigatorio. Obtenha via list_entity_fields.'
      },
      value: {
        type: 'string',
        description: 'Valor da opcao. Obrigatorio.'
      }
    },
    required: ['entity_field_id', 'value']
  }
};

async function execute(args, { api }) {
  requireField(args, 'entity_field_id');
  requireField(args, 'value');
  const { entity_field_id, value } = args;

  try {
    const response = await api.createEntityFieldOption(entity_field_id, { value });

    if (response.error) {
      const status = response.status;
      const detail = extractApiErrorDetail(response);

      if (status === 404) {
        return errorResponse(
          `**❌ Subcampo (entity_field) #${entity_field_id} nao encontrado**\n\n` +
          `*Verifique o entity_field_id via \`list_entity_fields\`.*`
        );
      }

      if (detail?.base) {
        return errorResponse(
          `**❌ Este subcampo nao aceita opcoes**\n\n` +
          `**Mensagem:** ${[detail.base].flat().join(', ')}\n\n` +
          `*Somente subcampos do tipo checkbox e single_select aceitam opcoes — confira o \`field_type\` via \`list_entity_fields\`.*`
        );
      }

      if (detail?.value) {
        return errorResponse(
          `**❌ Valor duplicado**\n\n` +
          `**\`value\`:** ${[detail.value].flat().join(', ')}\n\n` +
          `*Use \`list_entity_field_options\` para ver as opcoes ja cadastradas.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao criar opcao no subcampo #${entity_field_id}**`,
        response,
        '*Verifique se voce possui a role **manage_entities** e se o subcampo aceita opcoes (checkbox/single_select).*'
      );
    }

    const option = response.data || {};

    let text = `**✅ Opcao criada com sucesso!**\n\n`;
    text += `**ID:** ${option.id}\n`;
    text += `**Valor:** ${option.value || value}\n`;
    text += `\n*✅ Opcao criada via API TiFlux*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao criar opcao no subcampo #${entity_field_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

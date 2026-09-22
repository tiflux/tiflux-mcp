/**
 * Slice: update_entity_field_option — renomeia uma opcao de um subcampo single_select/checkbox.
 *
 * Endpoint: PUT /entity_fields/{entity_field_id}/options/{id}
 * Body: { value }.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_entity_field_option',
  description:
    'Renomear (atualizar o valor de) uma opcao de um subcampo (entity_field) do tipo "single_select" ou "checkbox" ' +
    'no TiFlux. ' +
    '⚠️ **Confirme com o usuario antes de executar**, resumindo o novo valor. ' +
    'Requer a role **manage_entities**. Nao existe exclusao de opcao na API v2.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_field_id: {
        type: 'number',
        description: 'ID do subcampo (entity_field) dono da opcao. Obrigatorio.'
      },
      id: {
        type: 'number',
        description: 'ID da opcao a ser atualizada. Obrigatorio. Obtenha via list_entity_field_options.'
      },
      value: {
        type: 'string',
        description: 'Novo valor da opcao. Obrigatorio.'
      }
    },
    required: ['entity_field_id', 'id', 'value']
  }
};

async function execute(args, { api }) {
  requireField(args, 'entity_field_id');
  requireField(args, 'id');
  requireField(args, 'value');
  const { entity_field_id, id, value } = args;

  try {
    const response = await api.updateEntityFieldOption(entity_field_id, id, { value });

    if (response.error) {
      const status = response.status;
      const detail = extractApiErrorDetail(response);

      if (status === 404) {
        return errorResponse(
          `**❌ Subcampo ou opcao nao encontrado (entity_field_id=${entity_field_id}, id=${id})**\n\n` +
          `*Verifique via \`list_entity_field_options\`.*`
        );
      }

      if (detail?.value) {
        return errorResponse(
          `**❌ Valor duplicado**\n\n` +
          `**\`value\`:** ${[detail.value].flat().join(', ')}\n\n` +
          `*Use \`list_entity_field_options\` para ver as opcoes ja cadastradas.*`
        );
      }

      if (detail?.base) {
        return errorResponse(
          `**❌ Este subcampo nao aceita opcoes**\n\n` +
          `**Mensagem:** ${[detail.base].flat().join(', ')}\n\n` +
          `*Somente subcampos do tipo checkbox e single_select aceitam opcoes — confira o \`field_type\` via \`list_entity_fields\`.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao atualizar opcao #${id}**`,
        response,
        '*Verifique se voce possui a role **manage_entities**.*'
      );
    }

    const option = response.data || {};

    let text = `**✅ Opcao #${id} atualizada com sucesso!**\n\n`;
    text += `**Valor:** ${option.value || value}\n`;
    text += `\n*✅ Opcao atualizada via API TiFlux*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar opcao #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

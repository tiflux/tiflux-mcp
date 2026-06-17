/**
 * Slice: update_client_entities — atualiza campos personalizados (entities) de um cliente.
 *
 * Endpoint: PUT /clients/{id}/entities (via api.updateClientEntities).
 * Limite: 50 campos por requisicao.
 * Espelha tickets/updateTicketEntities.js.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_client_entities',
  description: 'Atualizar campos personalizados (entities) de um cliente no TiFlux. Suporta até 50 campos por requisição. Para campos checkbox com múltiplas opções, envie um item por opção com entity_field_id + entity_field_option_id + value: "true"/"false". Use list_entity_field_options para descobrir os IDs de opção.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente a ser atualizado (obrigatório)'
      },
      entities: {
        type: 'array',
        description: 'Lista de campos personalizados a serem atualizados. Para checkbox multiplo: envie um item por opcao com entity_field_id, entity_field_option_id e value: "true" ou "false".',
        items: {
          type: 'object',
          properties: {
            entity_field_id: {
              type: 'number',
              description: 'ID do campo personalizado (obtido via get_client ou list_entity_fields)'
            },
            value: {
              type: 'string',
              description: 'Valor do campo. Tipos aceitos: text (string), text_area (string), currency (float como string ex: "150.55"), phone (apenas números ex: "47999999999"), email (string), link (URL começando com http/https/ftp), date (formato YYYY-MM-DD), single_select (ID da opção como string), checkbox (boolean como string "true"/"false"). Use null para limpar campos não obrigatórios.'
            },
            entity_field_option_id: {
              type: 'number',
              description: 'ID da opcao selecionada (opcional). Obrigatorio para checkbox multiplo — use list_entity_field_options para obter os IDs. Para marcar multiplas opcoes, envie um item por opcao com o mesmo entity_field_id e entity_field_option_id diferente.'
            },
            country_code: {
              type: 'string',
              description: 'Código do país (opcional, apenas para campos tipo phone de outros países além do Brasil)'
            }
          },
          required: ['entity_field_id', 'value']
        }
      }
    },
    required: ['client_id', 'entities']
  }
};

async function execute(args, { api }) {
  const { client_id, entities } = args;

  requireField(args, 'client_id');

  if (!entities || !Array.isArray(entities) || entities.length === 0) {
    throw new Error('entities é obrigatório e deve ser um array com pelo menos 1 campo');
  }

  if (entities.length > 50) {
    return errorResponse(
      `**❌ Limite excedido**\n\n` +
      `Você está tentando atualizar ${entities.length} campos, mas o limite é de 50 campos por requisição.\n\n` +
      `*Divida a atualização em múltiplas requisições.*`
    );
  }

  try {
    // Validar estrutura de cada entity
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.entity_field_id == null) {
        return errorResponse(
          `**❌ Erro de validação no campo ${i + 1}**\n\n` +
          `O campo \`entity_field_id\` é obrigatório.\n\n` +
          `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" }*`
        );
      }

      if (entity.value === undefined) {
        return errorResponse(
          `**❌ Erro de validação no campo ${i + 1}**\n\n` +
          `O campo \`value\` é obrigatório (use null para limpar).\n\n` +
          `*Exemplo: { "entity_field_id": 72, "value": "Novo valor" } ou { "entity_field_id": 72, "value": null }*`
        );
      }

      if (entity.entity_field_option_id !== undefined && typeof entity.entity_field_option_id !== 'number') {
        return errorResponse(
          `**❌ Erro de validação no campo ${i + 1}**\n\n` +
          `O campo \`entity_field_option_id\` deve ser um número (ID da opção).\n\n` +
          `*Use list_entity_field_options para obter os IDs de opção disponíveis.*`
        );
      }
    }

    const updateData = { entities };
    const response = await api.updateClientEntities(client_id, updateData);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar campos personalizados do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, se os entity_field_id são válidos e se você tem permissão para editar.*'
      );
    }

    const updatedEntities = response.data?.entities || [];
    let entitiesText = '';

    if (updatedEntities.length > 0) {
      entitiesText = '\n\n**Campos atualizados:**\n';
      updatedEntities.forEach(entity => {
        if (entity.entity_fields && entity.entity_fields.length > 0) {
          entity.entity_fields.forEach(field => {
            const wasUpdated = entities.some(e => e.entity_field_id === field.entity_field_id);
            if (wasUpdated) {
              entitiesText += `• ${field.name}: ${field.value || '(vazio)'}\n`;
            }
          });
        }
      });
    }

    return textResponse(
      `**✅ Campos personalizados atualizados com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**Campos processados:** ${entities.length}${entitiesText}\n\n` +
      `*✅ Campos atualizados via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar campos personalizados**\n\n**Cliente:** #${client_id}`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

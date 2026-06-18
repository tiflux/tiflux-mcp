/**
 * Slice: update_client_entities — atualiza campos personalizados (entities) de um cliente.
 *
 * Endpoint: PUT /clients/{id}/entities (via api.updateClientEntities).
 * Limite: 50 campos por requisicao.
 * Espelha tickets/updateTicketEntities.js.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveEntities, formatUpdatedFields, buildEntitiesSchema } = require('../_shared/entityFieldResolver');

const schema = {
  name: 'update_client_entities',
  description: 'Atualizar campos personalizados (entities) de um cliente no TiFlux. Suporta até 50 campos por requisição. Para campos checkbox com múltiplas opções, envie um item por opção com entity_field_id + entity_field_option_id + value: "true"/"false".\n\n**Prefira IDs quando conhecidos** para evitar round-trips de resolução. Use entity_name/entity_field_name/entity_field_option_name para resolver automaticamente quando não tiver os IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente a ser atualizado (obrigatório)'
      },
      entities: buildEntitiesSchema('get_client')
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
    // Resolucao por nome (entity/field/option) + validacao por item — logica compartilhada.
    const resolution = await resolveEntities(entities, api);
    if (resolution.error) {
      return errorResponse(resolution.error);
    }
    const { resolvedEntities } = resolution;

    const response = await api.updateClientEntities(client_id, { entities: resolvedEntities });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao atualizar campos personalizados do cliente #${client_id}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o cliente existe, se os entity_field_id são válidos e se você tem permissão para editar.*`
      );
    }

    const entitiesText = formatUpdatedFields(response.data?.entities, resolvedEntities);

    return textResponse(
      `**✅ Campos personalizados atualizados com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**Campos processados:** ${resolvedEntities.length}${entitiesText}\n\n` +
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

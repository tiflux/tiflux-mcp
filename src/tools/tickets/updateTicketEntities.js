/**
 * Slice: update_ticket_entities — atualiza campos personalizados (entities) de um ticket.
 *
 * Endpoint: PUT /tickets/{ticket_number}/entities (via api.updateTicketEntities).
 * Limite: 50 campos por requisicao.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_ticket_entities',
  description: 'Atualizar campos personalizados (entities) de um ticket no TiFlux. Suporta até 50 campos por requisição. Para campos checkbox com múltiplas opções, envie um item por opção com entity_field_id + entity_field_option_id + value: "true"/"false". Use list_entity_field_options para descobrir os IDs de opção.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser atualizado' },
      entities: {
        type: 'array',
        description: 'Lista de campos personalizados a serem atualizados. Para checkbox multiplo: envie um item por opcao com entity_field_id, entity_field_option_id e value: "true" ou "false".',
        items: {
          type: 'object',
          properties: {
            entity_field_id: { type: 'number', description: 'ID do campo personalizado (obtido via get_ticket ou list_entity_fields)' },
            value: {
              type: 'string',
              description: 'Valor do campo. Tipos aceitos: text (string), text_area (string), currency (float como string ex: "150.55"), phone (apenas números ex: "47999999999"), email (string), link (URL começando com http/https/ftp), date (formato YYYY-MM-DD), single_select (ID da opção como string), checkbox (boolean como string "true"/"false"). Use null para limpar campos não obrigatórios.'
            },
            entity_field_option_id: { type: 'number', description: 'ID da opcao selecionada (opcional). Obrigatorio para checkbox multiplo — use list_entity_field_options para obter os IDs. Para marcar multiplas opcoes, envie um item por opcao com o mesmo entity_field_id e entity_field_option_id diferente.' },
            country_code: { type: 'string', description: 'Código do país (opcional, apenas para campos tipo phone de outros países além do Brasil)' }
          },
          required: ['entity_field_id', 'value']
        }
      }
    },
    required: ['ticket_number', 'entities']
  }
};

async function execute(args, { api }) {
  const { ticket_number, entities } = args;

  requireField(args, 'ticket_number');

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
      if (!entity.entity_field_id) {
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

    // Preparar dados para a API
    const updateData = { entities };

    // Atualizar via API
    const response = await api.updateTicketEntities(ticket_number, updateData);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao atualizar campos personalizados do ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe, se os entity_field_id são válidos e se você tem permissão para editar.*`
      );
    }

    // Formatar resposta de sucesso
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
      `**Ticket:** #${ticket_number}\n` +
      `**Campos processados:** ${entities.length}${entitiesText}\n\n` +
      `*✅ Campos atualizados via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar campos personalizados**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

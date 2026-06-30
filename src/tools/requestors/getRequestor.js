/**
 * Slice: get_requestor — busca detalhes completos de um solicitante de um cliente pelo ID.
 *
 * Endpoint: GET /clients/{client_id}/requestors/{id} (via api.getRequestor).
 * Retorna: dados cadastrais e campos personalizados (entities, applied_in: "solicitant") opcionais.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer } = require('../_shared/format');

const schema = {
  name: 'get_requestor',
  description: 'Buscar detalhes completos de um solicitante (requestor) de um cliente no TiFlux pelo ID. Retorna dados cadastrais (nome, email, telefone, ramal, permissão de abrir ticket) e campos personalizados (entities) opcionais.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o solicitante pertence (obrigatório)'
      },
      requestor_id: {
        type: 'number',
        description: 'ID do solicitante a ser buscado (obtido via list_requestors ou search_requestor)'
      },
      show_entities: {
        type: 'boolean',
        description: 'Incluir campos personalizados (entities) vinculados ao solicitante na resposta (padrão: false)'
      }
    },
    required: ['client_id', 'requestor_id']
  }
};

function formatRequestor(requestor, verbosity) {
  let text = `**Solicitante: ${requestor.name || 'N/A'}**\n\n`;
  text += `**ID:** ${requestor.id}\n`;
  text += `**Email:** ${requestor.email || 'N/A'}\n`;
  text += `**Telefone:** ${requestor.telephone || 'N/A'}\n`;
  if (requestor.extension) text += `**Ramal:** ${requestor.extension}\n`;
  text += `**Pode abrir ticket:** ${requestor.can_open_ticket ? 'Sim' : 'Não'}\n`;
  if (requestor.client && requestor.client.name) {
    text += `**Cliente:** ${requestor.client.name} (ID: ${requestor.client.id})\n`;
  }

  if (requestor.entities && Array.isArray(requestor.entities) && requestor.entities.length > 0) {
    text += `\n**Campos Personalizados:**\n`;
    requestor.entities.forEach(entity => {
      text += `\n**${entity.name || 'Menu'}** (ID: ${entity.id})\n`;
      if (entity.entity_fields && entity.entity_fields.length > 0) {
        entity.entity_fields.forEach(field => {
          const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
          text += `  • ${field.name} (${field.field_type}): ${value}\n`;
        });
      }
    });
  }

  if (requestor.created_at) text += `\n**Criado em:** ${requestor.created_at}\n`;
  if (requestor.updated_at) text += `**Atualizado em:** ${requestor.updated_at}\n`;

  text += `\n${footer(verbosity)}`;
  return text;
}

async function execute(args, { api, verbosity }) {
  const { client_id, requestor_id, show_entities } = args;

  requireField(args, 'client_id');
  requireField(args, 'requestor_id');

  try {
    const options = {};
    if (show_entities) options.showEntities = true;

    const response = await api.getRequestor(client_id, requestor_id, options);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao buscar solicitante #${requestor_id} (cliente #${client_id})**`,
        response,
        '*Verifique se o solicitante existe nesse cliente e se você tem permissão para acessá-lo.*'
      );
    }

    // Guard defensivo: 200 com data ausente/nao-objeto evitaria TypeError ao formatar.
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar solicitante #${requestor_id}**\n\n` +
        `A API retornou sucesso mas sem os dados do solicitante.\n\n` +
        `*Verifique se o solicitante #${requestor_id} existe no cliente #${client_id}.*`
      );
    }

    return textResponse(formatRequestor(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar solicitante #${requestor_id} (cliente #${client_id})**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatRequestor };

/**
 * Slice: get_client — busca detalhes completos de um cliente pelo ID.
 *
 * Endpoint: GET /clients/{id} (via api.getClient).
 * Retorna: dados cadastrais, status, mesas, grupos técnicos, campos personalizados (opcional).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'get_client',
  description: 'Buscar detalhes completos de um cliente no TiFlux pelo ID. Retorna dados cadastrais (nome, razão social, CNPJ/CPF, status, email, anotações), mesas vinculadas, grupos técnicos e campos personalizados opcionais.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente a ser buscado (obtido via search_client ou list_clients)'
      },
      show_entities: {
        type: 'boolean',
        description: 'Incluir campos personalizados (entities) vinculados ao cliente na resposta (padrão: false)'
      }
    },
    required: ['client_id']
  }
};

function formatClient(client) {
  let text = `**Cliente: ${client.name || 'N/A'}**\n\n`;
  text += `**ID:** ${client.id}\n`;
  text += `**Razão Social:** ${client.social || 'N/A'}\n`;
  text += `**CPF/CNPJ:** ${client.social_revenue || 'N/A'}\n`;
  text += `**Status:** ${client.status ? 'Ativo' : 'Inativo'}\n`;
  text += `**Email Financeiro:** ${client.email_financial || 'N/A'}\n`;

  if (client.municipal_registration) {
    text += `**Inscrição Municipal:** ${client.municipal_registration}\n`;
  }
  if (client.estadual_registration) {
    text += `**Inscrição Estadual:** ${client.estadual_registration}\n`;
  }
  if (client.max_agents !== undefined && client.max_agents !== null) {
    text += `**Máx. Agentes:** ${client.max_agents}\n`;
  }
  if (client.anotations) {
    text += `\n**Anotações:** ${client.anotations}\n`;
  }

  if (client.desks && Array.isArray(client.desks) && client.desks.length > 0) {
    text += `\n**Mesas vinculadas (${client.desks.length}):**\n`;
    client.desks.forEach(desk => {
      text += `• ${desk.name || desk.display_name || 'N/A'} (ID: ${desk.id})\n`;
    });
  }

  if (client.technical_groups && Array.isArray(client.technical_groups) && client.technical_groups.length > 0) {
    text += `\n**Grupos Técnicos (${client.technical_groups.length}):**\n`;
    client.technical_groups.forEach(group => {
      text += `• ${group.name || 'N/A'} (ID: ${group.id})\n`;
    });
  }

  if (client.entities && Array.isArray(client.entities) && client.entities.length > 0) {
    text += `\n**Campos Personalizados:**\n`;
    client.entities.forEach(entity => {
      text += `\n**${entity.name || 'Menu'}** (ID: ${entity.id})\n`;
      if (entity.entity_fields && entity.entity_fields.length > 0) {
        entity.entity_fields.forEach(field => {
          const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
          text += `  • ${field.name} (${field.field_type}): ${value}\n`;
        });
      }
    });
  }

  if (client.created_at) {
    text += `\n**Criado em:** ${client.created_at}\n`;
  }
  if (client.updated_at) {
    text += `**Atualizado em:** ${client.updated_at}\n`;
  }

  text += `\n*✅ Dados obtidos da API TiFlux em tempo real*`;
  return text;
}

async function execute(args, { api }) {
  const { client_id, show_entities } = args;

  requireField(args, 'client_id');

  try {
    const options = {};
    if (show_entities) options.showEntities = true;

    const response = await api.getClient(client_id, options);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao buscar cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe e se você tem permissão para acessá-lo.*'
      );
    }

    // Guard defensivo: 200 com data ausente/nao-objeto evitaria TypeError ao formatar.
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar cliente #${client_id}**\n\n` +
        `A API retornou sucesso mas sem os dados do cliente.\n\n` +
        `*Verifique se o cliente #${client_id} existe.*`
      );
    }

    return textResponse(formatClient(response.data));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatClient };

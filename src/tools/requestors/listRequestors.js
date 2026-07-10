/**
 * Slice: list_requestors — lista solicitantes (requestors) de um cliente, com filtros e paginação.
 *
 * Endpoint: GET /clients/{client_id}/requestors (via api.searchClientRequestors).
 * Versão canônica por cliente, alinhada a list_clients. search_requestor continua disponível
 * como atalho cross-client/escopado com cadeia de fallback.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_requestors',
  description: 'Listar solicitantes (requestors) de um cliente específico no TiFlux, com filtros e paginação. Versão canônica por cliente (GET /clients/{id}/requestors), alinhada a list_clients. Use search_requestor quando precisar de busca cross-client com cadeia de fallback; use list_requestors para o catálogo de solicitantes de um cliente conhecido.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente cujos solicitantes serão listados (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Filtrar por nome (busca parcial)'
      },
      email: {
        type: 'string',
        description: 'Filtrar por email'
      },
      telephone: {
        type: 'string',
        description: 'Filtrar por telefone (apenas números, sem código de país)'
      },
      extension: {
        type: 'string',
        description: 'Filtrar por ramal (extension)'
      },
      can_open_ticket: {
        type: 'boolean',
        description: 'Filtrar solicitantes que podem (true) ou não podem (false) abrir ticket por email'
      },
      include_entity_fields: {
        type: 'boolean',
        description: 'Incluir campos personalizados (entities) de cada solicitante na resposta (padrão: false)'
      },
      ...paginationSchemaProperties()
    },
    required: ['client_id']
  }
};

async function execute(args, { api, verbosity }) {
  const { client_id, name, email, telephone, extension, can_open_ticket, include_entity_fields, offset, limit } = args;
  const v = verbosity || 'rich';

  requireField(args, 'client_id');

  try {
    const filters = {};
    if (name) filters.name = name;
    if (email) filters.email = email;
    if (telephone) filters.telephone = telephone;
    if (extension) filters.extension = extension;
    if (can_open_ticket !== undefined) filters.can_open_ticket = can_open_ticket;
    if (include_entity_fields) filters.include_entity_fields = true;
    if (offset) filters.offset = parseInt(offset);
    if (limit) filters.limit = parseInt(limit);

    const response = await api.searchClientRequestors(client_id, filters);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao listar solicitantes do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, os filtros informados e suas permissões.*'
      );
    }

    const requestors = response.data || [];

    if (requestors.length === 0) {
      return textResponse(
        `**📋 Nenhum solicitante encontrado**\n\n` +
        `Não foram encontrados solicitantes para o cliente #${client_id} com os filtros aplicados.\n\n` +
        (name ? `• Nome: "${name}"\n` : '') +
        (email ? `• Email: "${email}"\n` : '') +
        (telephone ? `• Telefone: "${telephone}"\n` : '') +
        `\n*Tente ajustar os filtros ou use create_requestor para cadastrar.*`
      );
    }

    let text = `**📋 Solicitantes do cliente #${client_id} (${requestors.length} encontrados)**\n\n`;

    requestors.forEach((requestor, index) => {
      const canOpen = requestor.can_open_ticket ? 'Sim' : 'Não';
      text += `**${index + 1}. ${requestor.name || 'N/A'}**\n`;
      text += `   • **ID:** ${requestor.id}\n`;
      text += `   • **Email:** ${requestor.email || 'N/A'}\n`;
      text += `   • **Telefone:** ${requestor.telephone || 'N/A'}\n`;
      if (requestor.extension) text += `   • **Ramal:** ${requestor.extension}\n`;
      text += `   • **Pode abrir ticket:** ${canOpen}\n`;
      text += '\n';
    });

    const currentOffset = filters.offset || 1;
    const currentLimit = filters.limit || 20;
    text += pagination({ offset: currentOffset, limit: currentLimit, count: requestors.length, unit: 'solicitantes' }, v);
    const footerStr = footer(v);
    if (footerStr) text += `\n${footerStr}`;
    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao listar solicitantes do cliente #${client_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

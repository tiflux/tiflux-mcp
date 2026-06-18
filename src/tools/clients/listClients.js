/**
 * Slice: list_clients — lista clientes com filtros e paginação.
 *
 * Endpoint: GET /clients (via api.listClients).
 * Versão completa do search_client: aceita filtros active, name, social_revenue + paginação.
 * search_client é mantido como atalho name-only para compatibilidade.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');

const schema = {
  name: 'list_clients',
  description: 'Listar clientes do TiFlux com filtros e paginação. Versão completa do search_client — aceita filtros por status (ativo/inativo), nome e CPF/CNPJ, além de paginação. search_client continua disponível como atalho name-only.',
  inputSchema: {
    type: 'object',
    properties: {
      active: {
        type: 'boolean',
        description: 'Filtrar por status: true = apenas ativos, false = apenas inativos. Omitir para trazer todos.'
      },
      name: {
        type: 'string',
        description: 'Filtrar por nome (busca parcial)'
      },
      social_revenue: {
        type: 'string',
        description: 'Filtrar por CPF ou CNPJ (busca exata ou parcial)'
      },
      offset: {
        type: 'number',
        description: 'Número da página (padrão: 1)'
      },
      limit: {
        type: 'number',
        description: 'Clientes por página (padrão: 20, máximo: 200)'
      }
    },
    required: []
  }
};

async function execute(args, { api, verbosity }) {
  const { active, name, social_revenue, offset, limit } = args;
  const v = verbosity || 'rich';

  try {
    const filters = {};
    if (active !== undefined) filters.active = active;
    if (name) filters.name = name;
    if (social_revenue) filters.social_revenue = social_revenue;
    if (offset) filters.offset = parseInt(offset);
    if (limit) filters.limit = parseInt(limit);

    const response = await api.listClients(filters);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao listar clientes**`,
        response,
        '*Verifique os filtros informados e suas permissões.*'
      );
    }

    const clients = response.data || [];

    if (clients.length === 0) {
      return textResponse(
        `**📋 Nenhum cliente encontrado**\n\n` +
        `Não foram encontrados clientes com os filtros aplicados.\n\n` +
        (name ? `• Nome: "${name}"\n` : '') +
        (social_revenue ? `• CPF/CNPJ: "${social_revenue}"\n` : '') +
        (active !== undefined ? `• Status: ${active ? 'Ativo' : 'Inativo'}\n` : '') +
        `\n*Tente ajustar os filtros.*`
      );
    }

    let text = `**📋 Clientes (${clients.length} encontrados)**\n\n`;

    clients.forEach((client, index) => {
      text += `**${index + 1}. ${client.name || 'N/A'}**\n`;
      text += `   • **ID:** ${client.id}\n`;
      text += `   • **Razão Social:** ${client.social || 'N/A'}\n`;
      if (client.social_revenue) {
        text += `   • **CPF/CNPJ:** ${client.social_revenue}\n`;
      }
      text += `   • **Status:** ${client.status ? 'Ativo' : 'Inativo'}\n`;
      if (client.email || client.email_financial) {
        text += `   • **Email:** ${client.email || client.email_financial}\n`;
      }
      text += '\n';
    });

    const currentOffset = filters.offset || 1;
    const currentLimit = filters.limit || 20;
    text += pagination({ offset: currentOffset, limit: currentLimit, count: clients.length, unit: 'clientes' }, v);
    const footerStr = footer(v);
    if (footerStr) text += `\n${footerStr}`;
    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao listar clientes**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

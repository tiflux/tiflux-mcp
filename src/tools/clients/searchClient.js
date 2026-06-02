/**
 * Slice: search_client — busca clientes no TiFlux por nome.
 *
 * Endpoint: GET /clients?name=... (via api.searchClients).
 * Uso tipico: resolver client_id antes de criar ticket.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'search_client',
  description: 'Buscar clientes no TiFlux por nome',
  inputSchema: {
    type: 'object',
    properties: {
      client_name: {
        type: 'string',
        description: 'Nome do cliente a ser buscado (busca parcial)'
      }
    },
    required: ['client_name']
  }
};

function formatClientsList(client_name, clients) {
  let text = `**🔍 Busca por "${client_name}"**\n\n` +
             `**Resultados encontrados:** ${clients.length}\n\n`;

  text += '**📋 Clientes encontrados:**\n';
  clients.forEach((client, index) => {
    text += `${index + 1}. **ID:** ${client.id} | **Nome:** ${client.name} | **Razão Social:** ${client.social || 'N/A'} | **Ativo:** ${client.status ? 'Sim' : 'Não'}\n`;
  });

  text += '\n*✅ Para criar um ticket, use o ID do cliente desejado no parâmetro `client_id` ou use o nome no parâmetro `client_name`.*';
  return text;
}

async function execute(args, { api }) {
  const { client_name } = args;

  requireField(args, 'client_name');

  try {
    const response = await api.searchClients(client_name);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao buscar cliente "${client_name}"**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o nome está correto e se você tem permissão para acessar os dados de clientes.*`
      );
    }

    const clients = response.data || [];

    if (clients.length === 0) {
      return textResponse(
        `**🔍 Busca por "${client_name}"**\n\n` +
        `**Resultado:** Nenhum cliente encontrado\n\n` +
        `*Tente usar um termo de busca diferente ou verifique a grafia.*`
      );
    }

    return textResponse(formatClientsList(client_name, clients));
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao buscar cliente "${client_name}"**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatClientsList };

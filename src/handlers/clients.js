/**
 * Handlers para operações relacionadas a clientes
 */

const TiFluxAPI = require('../api/tiflux-api');

class ClientHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para buscar clientes por nome
   */
  async handleSearchClient(args) {
    const { client_name } = args;
    
    if (!client_name) {
      throw new Error('client_name é obrigatório');
    }

    try {
      const response = await this.api.searchClients(client_name);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao buscar cliente "${client_name}"**\n\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o nome está correto e se você tem permissão para acessar os dados de clientes.*`
            }
          ]
        };
      }

      const clients = response.data || [];
      
      if (clients.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**🔍 Busca por "${client_name}"**\n\n` +
                    `**Resultado:** Nenhum cliente encontrado\n\n` +
                    `*Tente usar um termo de busca diferente ou verifique a grafia.*`
            }
          ]
        };
      }

      let resultText = `**🔍 Busca por "${client_name}"**\n\n` +
                      `**Resultados encontrados:** ${clients.length}\n\n`;

      resultText += '**📋 Clientes encontrados:**\n';
      clients.forEach((client, index) => {
        resultText += `${index + 1}. **ID:** ${client.id} | **Nome:** ${client.name} | **Razão Social:** ${client.social || 'N/A'} | **Ativo:** ${client.status ? 'Sim' : 'Não'}\n`;
      });

      resultText += '\n*✅ Para criar um ticket, use o ID do cliente desejado no parâmetro `client_id` ou use o nome no parâmetro `client_name`.*';

      return {
        content: [
          {
            type: 'text',
            text: resultText
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao buscar cliente "${client_name}"**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }
}

module.exports = ClientHandlers;
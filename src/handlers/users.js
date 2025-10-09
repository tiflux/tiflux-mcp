/**
 * Handlers para operações relacionadas a usuários
 */

const TiFluxAPI = require('../api/tiflux-api');

class UserHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para buscar usuários por nome
   */
  async handleSearchUser(args) {
    const { name, type, active, limit, offset } = args;

    if (!name) {
      throw new Error('name é obrigatório');
    }

    try {
      const filters = {
        name,
        limit: limit || 20,
        offset: offset || 1
      };

      // Adicionar filtros opcionais
      if (type !== undefined) {
        filters.type = type;
      }
      if (active !== undefined) {
        filters.active = active;
      }

      const response = await this.api.searchUsers(filters);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**Erro ao buscar usuario "${name}"**\n\n` +
                    `**Codigo:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o nome esta correto e se voce tem permissao para acessar os dados de usuarios.*`
            }
          ]
        };
      }

      const users = response.data || [];

      if (users.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**Busca por "${name}"**\n\n` +
                    `**Resultado:** Nenhum usuario encontrado\n\n` +
                    `*Tente usar um termo de busca diferente ou verifique a grafia.*`
            }
          ]
        };
      }

      let resultText = `**Busca por "${name}"**\n\n` +
                      `**Resultados encontrados:** ${users.length}\n\n`;

      resultText += '**Usuarios encontrados:**\n';
      users.forEach((user, index) => {
        const userType = user._type === 'admin' ? 'Administrador' :
                        user._type === 'attendant' ? 'Atendente' :
                        'Cliente';
        const activeStatus = user.active ? 'Ativo' : 'Inativo';

        resultText += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email} | **Tipo:** ${userType} | **Status:** ${activeStatus}\n`;
      });

      resultText += '\n*Para criar ou atualizar um ticket com responsavel, use o ID do usuario desejado no parametro `responsible_id`.*';

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
            text: `**Erro interno ao buscar usuario "${name}"**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexao e configuracoes da API.*`
          }
        ]
      };
    }
  }
}

module.exports = UserHandlers;

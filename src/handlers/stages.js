/**
 * Handlers para operações relacionadas a estágios
 */

const TiFluxAPI = require('../api/tiflux-api');

class StageHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para buscar estágios de uma mesa por ID ou nome da mesa
   */
  async handleSearchStage(args) {
    const { desk_id, desk_name, limit, offset } = args;

    if (!desk_id && !desk_name) {
      throw new Error('desk_id ou desk_name e obrigatorio');
    }

    try {
      let finalDeskId = desk_id;

      // Se desk_name foi fornecido, buscar o ID da mesa
      if (desk_name && !desk_id) {
        const deskSearchResponse = await this.api.searchDesks(desk_name);

        if (deskSearchResponse.error) {
          return {
            content: [
              {
                type: 'text',
                text: `**Erro ao buscar mesa "${desk_name}"**\n\n` +
                      `**Erro:** ${deskSearchResponse.error}\n\n` +
                      `*Verifique se o nome da mesa esta correto ou use desk_id diretamente.*`
              }
            ]
          };
        }

        const desks = deskSearchResponse.data || [];
        if (desks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `**Mesa "${desk_name}" nao encontrada**\n\n` +
                      `*Verifique se o nome esta correto ou use desk_id diretamente.*`
              }
            ]
          };
        }

        if (desks.length > 1) {
          let desksList = '**Mesas encontradas:**\n';
          desks.forEach((desk, index) => {
            desksList += `${index + 1}. **ID:** ${desk.id} | **Nome:** ${desk.name} | **Display:** ${desk.display_name}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: `**Multiplas mesas encontradas para "${desk_name}"**\n\n` +
                      `${desksList}\n` +
                      `*Use desk_id especifico ou seja mais especifico no desk_name.*`
              }
            ]
          };
        }

        finalDeskId = desks[0].id;
      }

      const filters = {
        limit: limit || 20,
        offset: offset || 1
      };

      const response = await this.api.searchStages(finalDeskId, filters);

      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**Erro ao buscar estagios da mesa ID ${finalDeskId}**\n\n` +
                    `**Codigo:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se a mesa existe e se voce tem permissao para acessar os dados de estagios.*`
            }
          ]
        };
      }

      const stages = response.data || [];

      if (stages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**Busca de estagios para mesa ID ${finalDeskId}**\n\n` +
                    `**Resultado:** Nenhum estagio encontrado\n\n` +
                    `*Esta mesa pode nao ter estagios cadastrados.*`
            }
          ]
        };
      }

      let resultText = `**Estagios da Mesa ID ${finalDeskId}**\n\n` +
                      `**Total de estagios:** ${stages.length}\n\n`;

      resultText += '**Estagios encontrados:**\n';
      stages.forEach((stage, index) => {
        const firstStage = stage.first_stage ? 'Inicial' : '';
        const lastStage = stage.last_stage ? 'Final' : '';
        const stageType = firstStage || lastStage || 'Intermediario';
        const maxTime = stage.max_time || 'N/A';

        resultText += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index} | **Tipo:** ${stageType} | **Tempo Max:** ${maxTime}\n`;
      });

      resultText += '\n*Para atualizar um ticket para um estagio, use o ID do estagio no parametro `stage_id` ou use o nome no parametro `stage_name` junto com `desk_id` ou `desk_name`.*';

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
            text: `**Erro interno ao buscar estagios**\n\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexao e configuracoes da API.*`
          }
        ]
      };
    }
  }
}

module.exports = StageHandlers;

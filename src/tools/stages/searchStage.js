/**
 * Slice: search_stage — lista estagios de uma mesa.
 *
 * Endpoints: GET /desks (resolver desk_name -> desk_id) + GET /desks/{id}/stages.
 * Regra: aceita desk_id OU desk_name (um dos dois obrigatorio). Se ambos
 * ausentes, throw. Se ambos presentes, desk_id vence.
 */

const { textResponse } = require('../_shared/response');
const { resolveDeskName } = require('../_shared/deskResolver');

const schema = {
  name: 'search_stage',
  description: 'Buscar estagios de uma mesa no TiFlux para usar em atualizacao de tickets',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID da mesa para buscar estagios'
      },
      desk_name: {
        type: 'string',
        description: 'Nome da mesa para busca automatica (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados").'
      },
      limit: {
        type: 'number',
        description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
      },
      offset: {
        type: 'number',
        description: 'Numero da pagina (padrao: 1)'
      }
    },
    required: []
  }
};

function formatStagesList(finalDeskId, stages) {
  let text = `**Estagios da Mesa ID ${finalDeskId}**\n\n` +
             `**Total de estagios:** ${stages.length}\n\n`;

  text += '**Estagios encontrados:**\n';
  stages.forEach((stage, index) => {
    const firstStage = stage.first_stage ? 'Inicial' : '';
    const lastStage = stage.last_stage ? 'Final' : '';
    const stageType = firstStage || lastStage || 'Intermediario';
    const maxTime = stage.max_time || 'N/A';

    text += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index} | **Tipo:** ${stageType} | **Tempo Max:** ${maxTime}\n`;
  });

  text += '\n*Para atualizar um ticket para um estagio, use o ID do estagio no parametro `stage_id` ou use o nome no parametro `stage_name` junto com `desk_id` ou `desk_name`.*';
  return text;
}

async function execute(args, { api }) {
  const { desk_id, desk_name, limit, offset } = args;

  if (!desk_id && !desk_name) {
    throw new Error('desk_id ou desk_name e obrigatorio');
  }

  try {
    let finalDeskId = desk_id;

    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    const filters = {
      limit: limit || 20,
      offset: offset || 1
    };

    const response = await api.searchStages(finalDeskId, filters);

    if (response.error) {
      return textResponse(
        `**Erro ao buscar estagios da mesa ID ${finalDeskId}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se a mesa existe e se voce tem permissao para acessar os dados de estagios.*`
      );
    }

    const stages = response.data || [];

    if (stages.length === 0) {
      return textResponse(
        `**Busca de estagios para mesa ID ${finalDeskId}**\n\n` +
        `**Resultado:** Nenhum estagio encontrado\n\n` +
        `*Esta mesa pode nao ter estagios cadastrados.*`
      );
    }

    return textResponse(formatStagesList(finalDeskId, stages));
  } catch (error) {
    return textResponse(
      `**Erro interno ao buscar estagios**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatStagesList };

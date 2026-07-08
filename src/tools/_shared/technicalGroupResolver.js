/**
 * technicalGroupResolver.js — Helper compartilhado para resolucao de grupo tecnico por nome.
 *
 * Reusa entityResolver + fuzzyMatch existentes — nenhum novo helper criado.
 *
 * Logica de resolucao:
 *   1. Se technical_group_id presente → usa direto (sem chamada de API).
 *   2. Se technical_group_name → busca grupos via api.listTechnicalGroups({ limit: 200 })
 *      + fuzzyMatchItems. 1 match → resolve. 0-match / N-matches / sem filtro →
 *      lista grupos disponíveis (id — name) e pede ao usuario escolher.
 *
 * Os 3 branches nao-felizes (nenhum filtro / 0-match / N-matches) convergem para
 * o mesmo texto de "enumere e peca escolha" — comportamento definido na spec.
 *
 * Retorno:
 *   { error: false, groupId: number }   — resolvido
 *   { error: true,  response: MCPResponse } — lista de grupos + pedido de escolha
 */

const { fuzzyMatchItems } = require('./fuzzyMatch');
const { errorResponse } = require('./errors');

/**
 * Formata a lista de grupos para exibicao ao usuario.
 * @param {Array} groups - array de { id, name }
 * @param {boolean} truncated - se a lista foi truncada
 * @returns {string}
 */
function formatGroupList(groups, truncated) {
  let list = groups.map(g => `• **${g.id}** — ${g.name}`).join('\n');
  if (truncated) {
    list += '\n\n*Nota: lista truncada (mais de 200 grupos). Use technical_group_id diretamente se o grupo nao aparecer.*';
  }
  return list;
}

/**
 * Resolve technical_group_id ou technical_group_name para um groupId numerico.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} params
 * @param {number} [params.technical_group_id] - ID direto (prioridade)
 * @param {string} [params.technical_group_name] - nome para busca fuzzy
 * @returns {Promise<{error: boolean, groupId?: number, response?: object}>}
 */
async function resolveTechnicalGroup(api, { technical_group_id, technical_group_name } = {}) {
  // Caminho rapido: ID direto
  if (technical_group_id != null) {
    return { error: false, groupId: technical_group_id };
  }

  // Buscar todos os grupos (1 pagina de 200 cobre o caso comum)
  const groupsResponse = await api.listTechnicalGroups({ limit: 200 });

  if (groupsResponse.error) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Erro ao buscar grupos técnicos**\n\n` +
        `**Erro:** ${groupsResponse.error}\n\n` +
        `*Tente novamente ou use technical_group_id diretamente.*`
      )
    };
  }

  const groups = groupsResponse.data || [];
  const truncated = groups.length >= 200;

  // Sem filtro de nome → listar e pedir escolha
  if (!technical_group_name) {
    const list = formatGroupList(groups, truncated);
    return {
      error: true,
      response: errorResponse(
        `**⚠️ Grupo técnico não informado**\n\n` +
        `Informe **technical_group_id** ou **technical_group_name**.\n\n` +
        `**Grupos disponíveis:**\n${list}\n\n` +
        `*Use o ID ou o nome exato do grupo desejado.*`
      )
    };
  }

  // Fuzzy match por nome
  const { matches } = fuzzyMatchItems(technical_group_name, groups, g => g.name);

  // 1 match → sucesso
  if (matches.length === 1) {
    return { error: false, groupId: matches[0].item.id };
  }

  // 0 matches → listar e pedir escolha
  if (matches.length === 0) {
    const list = formatGroupList(groups, truncated);
    return {
      error: true,
      response: errorResponse(
        `**⚠️ Grupo técnico "${technical_group_name}" não encontrado**\n\n` +
        `**Grupos disponíveis:**\n${list}\n\n` +
        `*Use technical_group_id ou escolha um nome da lista acima.*`
      )
    };
  }

  // N matches → listar candidatos e pedir escolha
  const candidates = matches.map(m => m.item);
  const list = formatGroupList(candidates, false);
  return {
    error: true,
    response: errorResponse(
      `**⚠️ Múltiplos grupos técnicos encontrados para "${technical_group_name}"**\n\n` +
      `**Candidatos:**\n${list}\n\n` +
      `*Use technical_group_id para identificar o grupo exato.*`
    )
  };
}

module.exports = { resolveTechnicalGroup };

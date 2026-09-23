/**
 * Slice: delete_knowledge — arquiva (soft-delete) um conhecimento pelo ID.
 *
 * Endpoint: DELETE /knowledges/{id}
 * Resposta de sucesso: 204 sem corpo.
 *
 * Efeitos do DELETE (soft delete, confirmado no api_rails): archived=true — o registro e
 * as versoes ficam preservados — e o artigo e desvinculado de todas as pastas.
 * Pela API nao ha restore: o artigo arquivado some das leituras (GET/PUT -> 404).
 * O app do TiFlux consegue restaurar, mas as pastas precisam ser religadas.
 *
 * Permissao requerida: "Gerenciar conhecimento".
 *
 * Pre-flight best-effort: consulta GET /knowledges/{id} antes do DELETE apenas
 * para ecoar o titulo na mensagem de confirmacao. Se o pre-flight falhar, o
 * DELETE acontece normalmente (a contagem/titulo e omitida, nunca abortada).
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');

const schema = {
  name: 'delete_knowledge',
  description:
    'Arquivar (soft delete) um conhecimento da base de conhecimento pelo ID. ' +
    'O conteudo e o historico de versoes sao preservados, mas o artigo e desvinculado de TODAS as pastas ' +
    'em que estava publicado. ATENCAO: NAO PODE SER DESFEITO PELA API — o artigo arquivado some das leituras ' +
    '(get_knowledge/update_knowledge retornam 404) e so pode ser restaurado pelo app do TiFlux, ' +
    'onde as pastas precisam ser religadas. ' +
    'Requer a permissao "Gerenciar conhecimento". Para editar o conteudo antes de arquivar, use update_knowledge.',
  inputSchema: {
    type: 'object',
    properties: {
      knowledge_id: {
        type: 'number',
        description: 'ID do conhecimento a ser arquivado (obtido via list_knowledges ou get_knowledge).'
      }
    },
    required: ['knowledge_id']
  }
};

async function execute(args, { api }) {
  const knowledge_id = requireIntField(args, 'knowledge_id');

  // Pre-flight best-effort: buscar titulo para mensagem de confirmacao.
  // Falha do pre-flight NAO aborta o DELETE.
  let tituloEcho = '';
  try {
    const preflightResponse = await api.getKnowledge(knowledge_id);
    if (!preflightResponse.error && preflightResponse.data && preflightResponse.data.title) {
      tituloEcho = ` "${preflightResponse.data.title}"`;
    }
  } catch (_) {
    // silencioso: pre-flight e informativo apenas
  }

  try {
    const response = await api.deleteKnowledge(knowledge_id);

    if (response.error) {
      const isNotFound = response.status === 404;
      const isForbidden = response.status === 403;
      return apiFailureResponse(
        `**Erro ao arquivar conhecimento #${knowledge_id}**`,
        response,
        isNotFound
          ? '*Conhecimento inexistente, ja arquivado ou nao visivel para o usuario. Sem a permissao "Gerenciar conhecimento", apenas conhecimentos publicos e os do grupo de atendentes sao acessiveis.*'
          : isForbidden
            ? '*A permissao "Gerenciar conhecimento" e necessaria para arquivar conhecimentos.*'
            : '*Verifique se o conhecimento existe e se voce tem permissao para arquiva-lo.*'
      );
    }

    let text = `**Conhecimento #${knowledge_id}${tituloEcho} arquivado com sucesso!**\n\n`;
    text += `**Efeitos:**\n`;
    text += `  • Artigo marcado como arquivado (archived = true) — conteudo e versoes preservados\n`;
    text += `  • Desvinculado de todas as pastas onde estava publicado\n\n`;
    text += `*Atencao: o arquivamento nao pode ser desfeito pela API — o artigo some das leituras (404). `;
    text += `So pode ser restaurado pelo app do TiFlux, religando as pastas.*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao arquivar conhecimento #${knowledge_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

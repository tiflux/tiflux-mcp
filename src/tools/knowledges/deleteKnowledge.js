/**
 * Slice: delete_knowledge — arquiva (soft-delete) um conhecimento pelo ID.
 *
 * Endpoint: DELETE /knowledges/{id}
 * Resposta de sucesso: 204 sem corpo.
 *
 * Efeitos do DELETE: archived=true + desvincula o artigo de todas as pastas.
 * NAO existe endpoint de restore — o arquivamento e permanente pela API.
 *
 * Permissao requerida: "Gerenciar base de conhecimento".
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
    'ATENCAO: o ARQUIVAMENTO E IRREVERSIVEL PELA API — nao existe endpoint de restore nem de edicao. ' +
    'O artigo e desvinculado de TODAS as pastas em que estava publicado. ' +
    'Requer a permissao "Gerenciar base de conhecimento".',
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
          ? '*Conhecimento inexistente ou nao visivel para o usuario. Sem a permissao "Gerenciar base de conhecimento", apenas conhecimentos publicos e os do grupo de atendentes sao acessiveis.*'
          : isForbidden
            ? '*A permissao "Gerenciar base de conhecimento" e necessaria para arquivar conhecimentos.*'
            : '*Verifique se o conhecimento existe e se voce tem permissao para arquiva-lo.*'
      );
    }

    let text = `**Conhecimento #${knowledge_id}${tituloEcho} arquivado com sucesso!**\n\n`;
    text += `**Efeitos:**\n`;
    text += `  • Artigo marcado como arquivado (archived = true)\n`;
    text += `  • Desvinculado de todas as pastas onde estava publicado\n\n`;
    text += `*Atencao: o arquivamento e irreversivel pela API TiFlux — nao existe endpoint de restore nem de edicao.*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao arquivar conhecimento #${knowledge_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

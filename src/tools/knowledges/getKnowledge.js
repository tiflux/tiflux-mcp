/**
 * Slice: get_knowledge — busca detalhe completo de um conhecimento pelo ID.
 *
 * Endpoint: GET /knowledges/{id}
 * Retorna: id, title, description (convertido de HTML para Markdown), tags,
 *          private, created_at, updated_at.
 *
 * Limitacao da API v2: NAO existe PUT/DELETE /knowledges/{id}.
 * Para editar um artigo, e necessario criar um novo com create_knowledge.
 *
 * Permissao: sem permissao especial retorna apenas conhecimentos publicos e
 * os do grupo de atendentes do usuario. 404 se nao visivel.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { htmlToMarkdown } = require('../_shared/htmlToMarkdown');

const schema = {
  name: 'get_knowledge',
  description: 'Buscar detalhe completo de um conhecimento da base de conhecimento pelo ID. O corpo (description) e retornado em Markdown (convertido de HTML). ATENCAO: a API v2 NAO permite editar nem apagar um conhecimento existente — para atualizar o conteudo, crie um artigo novo com create_knowledge.',
  inputSchema: {
    type: 'object',
    properties: {
      knowledge_id: {
        type: 'number',
        description: 'ID do conhecimento a ser buscado (obtido via list_knowledges).'
      }
    },
    required: ['knowledge_id']
  }
};

function formatKnowledge(knowledge) {
  const privado = knowledge.private ? 'Privado' : 'Publico';
  const tags = Array.isArray(knowledge.tags) && knowledge.tags.length > 0
    ? knowledge.tags.join(', ')
    : '—';
  const criado = knowledge.created_at
    ? new Date(knowledge.created_at).toLocaleDateString('pt-BR')
    : '—';
  const atualizado = knowledge.updated_at
    ? new Date(knowledge.updated_at).toLocaleDateString('pt-BR')
    : '—';

  let text = `**Conhecimento: ${knowledge.title || 'N/A'}**\n\n`;
  text += `**ID:** ${knowledge.id}\n`;
  text += `**Visibilidade:** ${privado}\n`;
  text += `**Tags:** ${tags}\n`;
  text += `**Criado em:** ${criado}\n`;
  text += `**Atualizado em:** ${atualizado}\n`;

  const body = htmlToMarkdown(knowledge.description || '');
  if (body) {
    text += `\n---\n\n${body}\n`;
  }

  text += '\n*Nota: a API v2 nao permite editar nem apagar este conhecimento. Para atualizar o conteudo, crie um artigo novo com create_knowledge.*';

  return text;
}

async function execute(args, { api }) {
  const knowledge_id = requireIntField(args, 'knowledge_id');

  try {
    const response = await api.getKnowledge(knowledge_id);

    if (response.error) {
      const isNotFound = response.status === 404;
      return apiFailureResponse(
        `**Erro ao buscar conhecimento #${knowledge_id}**`,
        response,
        isNotFound
          ? '*Conhecimento inexistente ou nao visivel para o usuario. Sem a permissao "Gerenciar base de conhecimento", apenas conhecimentos publicos e os do grupo de atendentes sao acessiveis.*'
          : '*Verifique se o conhecimento existe e se voce tem permissao para acessá-lo.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return apiFailureResponse(
        `**Resposta inesperada ao buscar conhecimento #${knowledge_id}**`,
        { error: 'Resposta da API sem dados do conhecimento', status: response.status || 200 },
        `*Verifique se o conhecimento #${knowledge_id} existe.*`
      );
    }

    return textResponse(formatKnowledge(response.data));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao buscar conhecimento #${knowledge_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatKnowledge };

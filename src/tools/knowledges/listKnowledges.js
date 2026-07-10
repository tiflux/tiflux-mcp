/**
 * Slice: list_knowledges — lista conhecimentos da base de conhecimento.
 *
 * Endpoint: GET /knowledges
 * Suporta filtros opcionais: search, knowledge_folder_ids (array de int → CSV),
 * limit, offset.
 *
 * Permissao:
 * - Sem permissao especial: publicos + do grupo de atendentes do usuario.
 * - Com "Gerenciar base de conhecimento": todos os conhecimentos.
 *
 * Nota: a API retorna `description` truncada em 300 caracteres.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_knowledges',
  description: 'Listar conhecimentos da base de conhecimento. Suporta busca por titulo/tags/descricao e filtro por pasta. Sem permissao especial, retorna apenas conhecimentos publicos e os do grupo de atendentes do usuario; com a permissao "Gerenciar base de conhecimento" retorna todos. A descricao e exibida truncada em ate 300 caracteres (preview — conteudo parcial).',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Busca por titulo, tags ou inicio da descricao do conhecimento (case-insensitive).'
      },
      knowledge_folder_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Filtrar por IDs de pastas de conhecimento. Exemplo: [1, 2, 3].'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatKnowledgesList(knowledges, opts = {}) {
  if (!knowledges || knowledges.length === 0) {
    return (
      'Nenhum conhecimento encontrado.\n\n' +
      '*Se voce nao tem a permissao "Gerenciar base de conhecimento", apenas conhecimentos publicos e os ' +
      'do seu grupo de atendentes sao retornados. Verifique os filtros aplicados ou ajuste as permissoes.*'
    );
  }

  const { total, offset, limit, verbosity } = opts;
  // Quando o total (X-Total-Items) excede o que veio nesta pagina, deixa
  // explicito "N de TOTAL" para nao subcontar buscas paginadas.
  const hasTotal = total !== undefined && total !== null && total !== knowledges.length;
  const countLabel = hasTotal ? `${knowledges.length} de ${total}` : `${knowledges.length}`;

  let text = `**Conhecimentos (${countLabel})**\n\n`;
  text += '| ID | Titulo | Privado | Pastas | Tags | Atualizado |\n';
  text += '|---|---|---|---|---|---|\n';

  knowledges.forEach(k => {
    const title = k.title || '—';
    const privado = k.private ? 'Sim' : 'Nao';
    const pastas = Array.isArray(k.knowledge_folder_ids) && k.knowledge_folder_ids.length > 0
      ? k.knowledge_folder_ids.join(', ')
      : '—';
    const tags = Array.isArray(k.tags) && k.tags.length > 0
      ? k.tags.join(', ')
      : '—';
    const atualizado = k.updated_at
      ? new Date(k.updated_at).toLocaleDateString('pt-BR')
      : '—';
    text += `| ${k.id} | ${title} | ${privado} | ${pastas} | ${tags} | ${atualizado} |\n`;
  });

  text += '\n*A descricao e exibida truncada em ate 300 caracteres pela API (preview parcial).*';
  text += '\n' + pagination(
    { offset, limit, count: knowledges.length, total, unit: 'conhecimentos' },
    verbosity
  );
  return text;
}

async function execute(args, { api, verbosity }) {
  const { search, knowledge_folder_ids, limit, offset } = args;

  try {
    const filters = {};

    if (search !== undefined) filters.search = search;
    if (Array.isArray(knowledge_folder_ids) && knowledge_folder_ids.length > 0) {
      filters.knowledge_folder_ids = knowledge_folder_ids;
    }
    if (limit !== undefined) filters.limit = parseInt(limit) || 20;
    if (offset !== undefined) filters.offset = parseInt(offset) || 1;

    const response = await api.listKnowledges(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar conhecimentos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e os filtros aplicados.*`
      );
    }

    const knowledges = response.data || [];
    return textResponse(formatKnowledgesList(knowledges, {
      total: response.total,
      offset: filters.offset,
      limit: filters.limit,
      verbosity
    }));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar conhecimentos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatKnowledgesList };

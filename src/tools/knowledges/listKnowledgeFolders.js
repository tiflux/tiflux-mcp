/**
 * Slice: list_knowledge_folders — lista pastas da base de conhecimento.
 *
 * Endpoint: GET /knowledge-folders
 * Suporta filtros opcionais: search, offset, limit.
 *
 * Permissao:
 * - Sem permissao especial: pastas que contem conhecimentos publicos ou do grupo do usuario.
 * - Com "Gerenciar base de conhecimento": todas as pastas.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { pagination, truncate } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { parseIntStrict } = require('../_shared/validators');

// Bounds do endpoint (Swagger GET /knowledge-folders): `offset` e NUMERO DA PAGINA
// (default 1, minimo 1); `limit` sao itens por pagina (default 20, min 1, max 200).
const OFFSET_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;

const schema = {
  name: 'list_knowledge_folders',
  description: 'Listar pastas da base de conhecimento. Suporta busca por titulo e paginacao. Sem permissao especial, retorna apenas pastas que contem conhecimentos publicos ou dos grupos de atendentes do usuario; com a permissao "Gerenciar base de conhecimento" retorna todas.',
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Busca por titulo da pasta (case-insensitive).'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatKnowledgeFoldersList(folders, opts = {}) {
  if (!folders || folders.length === 0) {
    return (
      'Nenhuma pasta de conhecimento encontrada.\n\n' +
      '*Se voce nao tem a permissao "Gerenciar base de conhecimento", apenas pastas com conhecimentos publicos ' +
      'ou dos seus grupos de atendentes sao retornadas. Verifique os filtros aplicados ou ajuste as permissoes.*'
    );
  }

  const { total, offset, limit, verbosity } = opts;
  const hasTotal = total !== undefined && total !== null && total !== folders.length;
  const countLabel = hasTotal ? `${folders.length} de ${total}` : `${folders.length}`;

  let text = `**Pastas de Conhecimento (${countLabel})**\n\n`;
  text += '| ID | Titulo | Descricao | Icone | Qtd | Tags |\n';
  text += '|---|---|---|---|---|---|\n';

  folders.forEach(f => {
    const titulo = f.title || '—';
    const descricao = truncate(f.description || '', 60) || '—';
    const icone = f.icon || '—';
    const qtd = f.qty_knowledges !== undefined ? f.qty_knowledges : '—';
    const tags = Array.isArray(f.tags) && f.tags.length > 0
      ? f.tags.join(', ')
      : '—';
    text += `| ${f.id} | ${titulo} | ${descricao} | ${icone} | ${qtd} | ${tags} |\n`;
  });

  text += '\n' + pagination(
    { offset, limit, count: folders.length, total, unit: 'pastas' },
    verbosity
  );
  return text;
}

async function execute(args, { api, verbosity }) {
  const { search, limit, offset } = args;

  // Validacao ANTES do try: input externo invalido ('abc', '0x10', 1.5, -1) vira
  // erro explicito de validacao, em vez de ser coagido em silencio (`parseInt(x) || 20`
  // transformava `limit: 0` em 20 e `'0x10'` em 16) ou de cair no catch de "erro
  // interno". `parseIntStrict` e o mesmo helper usado no get_knowledge vizinho —
  // sem padrao misto dentro do modulo. Valores validos sao apenas CLAMPADOS aos
  // bounds do Swagger (listagem read-only nao deve falhar por estar fora da faixa).
  const filters = {};

  if (search !== undefined) filters.search = search;
  if (limit !== undefined) {
    filters.limit = Math.min(Math.max(parseIntStrict(limit, 'limit'), LIMIT_MIN), LIMIT_MAX);
  }
  if (offset !== undefined) {
    filters.offset = Math.max(parseIntStrict(offset, 'offset'), OFFSET_MIN);
  }

  try {
    const response = await api.listKnowledgeFolders(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar pastas de conhecimento**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e os filtros aplicados.*`
      );
    }

    const folders = response.data || [];
    return textResponse(formatKnowledgeFoldersList(folders, {
      total: response.total,
      offset: filters.offset,
      limit: filters.limit,
      verbosity
    }));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar pastas de conhecimento**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatKnowledgeFoldersList };

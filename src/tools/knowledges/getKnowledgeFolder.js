/**
 * Slice: get_knowledge_folder — busca detalhe completo de uma pasta de conhecimento pelo ID.
 *
 * Endpoint: GET /knowledge-folders/{id}
 * Retorna: id, title, description (texto plano, nao HTML), icon (nullable),
 *          tags[], qty_knowledges, knowledges:[{id, title}].
 *
 * Nota: qty_knowledges pode ser maior que knowledges.length quando o usuario
 * nao tem permissao para ver todos os artigos da pasta.
 *
 * Permissao: 404 se pasta nao visivel para o usuario.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { escapeCell } = require('../_shared/markdown');

const schema = {
  name: 'get_knowledge_folder',
  description: 'Buscar detalhe completo de uma pasta da base de conhecimento pelo ID, incluindo a lista de conhecimentos publicados nela. Use folder_id obtido via list_knowledge_folders. Retorna: titulo, descricao, icone, tags, quantidade total de artigos e lista dos artigos visiveis. Se qty_knowledges for maior que o numero de artigos listados, o usuario nao tem permissao para ver todos.',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'number',
        description: 'ID da pasta de conhecimento a ser buscada (obtido via list_knowledge_folders).'
      }
    },
    required: ['folder_id']
  }
};

function format(folder) {
  const icone = folder.icon || '—';
  const tags = Array.isArray(folder.tags) && folder.tags.length > 0
    ? folder.tags.join(', ')
    : '—';
  const descricao = folder.description || '—';

  const knowledges = Array.isArray(folder.knowledges) ? folder.knowledges : [];
  const qtyTotal = folder.qty_knowledges !== undefined ? folder.qty_knowledges : knowledges.length;
  const qtyVisiveis = knowledges.length;

  let text = `**Pasta de Conhecimento: ${folder.title || 'N/A'}**\n\n`;
  text += `**ID:** ${folder.id}\n`;
  text += `**Icone:** ${icone}\n`;
  text += `**Tags:** ${tags}\n`;
  text += `**Descricao:** ${descricao}\n`;

  // Exibir ambos os numeros quando divergem (artigos ocultos por permissao)
  if (qtyTotal !== qtyVisiveis) {
    text += `**Artigos:** ${qtyVisiveis} visiveis de ${qtyTotal} no total (${qtyTotal - qtyVisiveis} oculto(s) por permissao)\n`;
  } else {
    text += `**Artigos:** ${qtyTotal}\n`;
  }

  if (knowledges.length > 0) {
    text += `\n**Conhecimentos publicados nesta pasta:**\n\n`;
    text += `| ID | Titulo |\n`;
    text += `|---|---|\n`;
    knowledges.forEach(k => {
      // escapeCell: um `|` (ou quebra de linha) no titulo vindo da API quebraria as
      // colunas da tabela Markdown inteira.
      text += `| ${escapeCell(k.id)} | ${k.title ? escapeCell(k.title) : '—'} |\n`;
    });
  } else {
    text += `\n*Nenhum conhecimento visivel nesta pasta.*`;
  }

  return text;
}

async function execute(args, { api }) {
  const folder_id = requireIntField(args, 'folder_id');

  try {
    const response = await api.getKnowledgeFolder(folder_id);

    if (response.error) {
      const isNotFound = response.status === 404;
      return apiFailureResponse(
        `**Erro ao buscar pasta de conhecimento #${folder_id}**`,
        response,
        isNotFound
          ? '*Pasta inexistente ou nao visivel para o usuario. Sem a permissao "Gerenciar base de conhecimento", apenas pastas com conhecimentos publicos ou dos grupos de atendentes sao retornadas.*'
          : '*Verifique se a pasta existe e se voce tem permissao para acessá-la.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return apiFailureResponse(
        `**Resposta inesperada ao buscar pasta #${folder_id}**`,
        { error: 'Resposta da API sem dados da pasta', status: response.status || 200 },
        `*Verifique se a pasta #${folder_id} existe.*`
      );
    }

    return textResponse(format(response.data));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao buscar pasta de conhecimento #${folder_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format };

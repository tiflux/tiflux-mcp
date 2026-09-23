/**
 * Slice: update_knowledge_folder — atualiza parcialmente uma pasta de conhecimento existente.
 *
 * Endpoint: PUT /knowledge-folders/{id}
 * Permissao requerida: "knowledge" (mesma role de update_knowledge/delete_knowledge).
 * Todos os campos sao opcionais — apenas os informados sao enviados.
 *
 * Nota: description e texto plano (e assim que o GET devolve) — sem conversao
 * Markdown→HTML (diferente do update_knowledge).
 *
 * Nota critica sobre `icon`: `icon: null` explicito REMOVE o icone atual — distinto
 * de `icon` omitido, que preserva o valor atual. O guard de "campo informado" usa
 * `args[field] !== undefined`, que trata `null` como informado corretamente. O
 * schema JSON do campo precisa aceitar `type: ['string', 'null']` (nao so string),
 * senao um cliente MCP que valide o schema estritamente pode recusar enviar `null`.
 *
 * Guard client-side: nenhum campo informado → errorResponse antes de chamar a API.
 * Validacoes de conteudo (titulo vazio/>255, icone nao-emoji, tag com virgula, soma
 * de tags >255) ficam na API — o 422 ja traz mensagem legivel via apiFailureResponse.
 *
 * Saida de sucesso NAO reimprime knowledges[]: o endpoint nao altera artigos e a
 * lista pode ser grande — use get_knowledge_folder para ve-los.
 *
 * Validado contra ../api_rails (2026-09-23, branch develop, FETCH_HEAD bb3b7c2):
 * campos aceitos batem 1:1 (title, description, icon, tags); "Removendo o icone da
 * pasta" confirma o comportamento de `icon: null`; 404 para pasta inexistente ou de
 * outra organizacao; permissao "knowledge" confirmada.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');

const UPDATABLE_FIELDS = ['title', 'description', 'icon', 'tags'];

const schema = {
  name: 'update_knowledge_folder',
  description:
    'Atualizar parcialmente uma pasta da base de conhecimento do TiFlux (titulo, descricao, icone, tags). ' +
    'Apenas os campos informados sao atualizados — campos omitidos permanecem inalterados. ' +
    'Esta rota nao altera os artigos publicados na pasta; use get_knowledge_folder para ve-los. ' +
    'Requer a permissao "Gerenciar conhecimento".',
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: {
        type: 'number',
        description: 'ID da pasta de conhecimento a ser atualizada (obtido via list_knowledge_folders ou get_knowledge_folder).'
      },
      title: {
        type: 'string',
        description: 'Novo titulo da pasta (max. 255 caracteres; string vazia e rejeitada pela API).'
      },
      description: {
        type: 'string',
        description: 'Nova descricao da pasta. Texto plano — nao aceita Markdown/HTML (diferente de update_knowledge).'
      },
      icon: {
        type: ['string', 'null'],
        description:
          'Novo icone da pasta: um unico emoji (ex: "🚀"). Enviar null explicitamente REMOVE o icone atual — ' +
          'distinto de omitir o campo, que preserva o icone existente. Icone vazio ("") ou com mais de 1 emoji e rejeitado pela API (422).'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Substitui todas as tags atuais da pasta. Cada tag nao pode conter virgula; a soma das tags (contando as virgulas separadoras) nao pode passar de 255 caracteres. ' +
          'Array vazio ([]) remove todas as tags.'
      }
    },
    required: ['folder_id']
  }
};

function format(folder, { folder_id, camposAlterados, tagsEnviadas }) {
  const icone = folder.icon || '—';
  const tags = Array.isArray(folder.tags) && folder.tags.length > 0
    ? folder.tags.join(', ')
    : '—';
  const descricao = folder.description || '—';
  const qtyKnowledges = folder.qty_knowledges !== undefined ? folder.qty_knowledges : '—';

  let text = `**Pasta de conhecimento #${folder.id || folder_id} atualizada**\n\n`;
  text += `**ID:** ${folder.id || folder_id}\n`;
  text += `**Titulo:** ${folder.title || '—'}\n`;
  text += `**Icone:** ${icone}\n`;
  text += `**Tags:** ${tags}\n`;
  text += `**Descricao:** ${descricao}\n`;
  text += `**Artigos:** ${qtyKnowledges}\n`;
  text += `**Campos alterados:** ${camposAlterados}\n`;

  if (tagsEnviadas) {
    const aviso = Array.isArray(folder.tags) && folder.tags.length === 0
      ? 'Todas as tags foram removidas.'
      : 'Tags substituidas.';
    text += `\n*${aviso}*`;
  }

  text += `\n\n*Use get_knowledge_folder para ver os artigos publicados nesta pasta.*`;

  return text;
}

async function execute(args, { api }) {
  const folder_id = requireIntField(args, 'folder_id');

  // Montar body apenas com os campos informados (exceto folder_id).
  // args[field] !== undefined trata `null` explicito como "informado" —
  // essencial para icon: null limpar o icone (ver nota de cabecalho).
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) {
      body[field] = args[field];
    }
  }

  // Guard: nenhum campo para atualizar
  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**Erro: nenhum campo para atualizar a pasta de conhecimento #${folder_id}**\n\n` +
      `Informe ao menos um campo: title, description, icon ou tags.\n\n` +
      `*Use get_knowledge_folder para ver o estado atual antes de atualizar.*`
    );
  }

  try {
    const response = await api.updateKnowledgeFolder(folder_id, body);

    if (response.error) {
      const status = response.status;
      const byStatus = {
        403: {
          title: `**Erro ao atualizar pasta de conhecimento #${folder_id}: sem permissao**`,
          tail: '*A permissao "Gerenciar conhecimento" e necessaria para editar pastas.*'
        },
        404: {
          title: `**Erro ao atualizar pasta de conhecimento #${folder_id}: nao encontrada**`,
          tail: '*Pasta inexistente ou de outra organizacao.*'
        }
      };
      const variant = byStatus[status] || {
        title: `**Erro ao atualizar pasta de conhecimento #${folder_id}**`,
        tail: '*Verifique os dados informados e suas permissoes.*'
      };
      return apiFailureResponse(variant.title, response, variant.tail);
    }

    const folder = response.data || {};
    const camposAlterados = Object.keys(body).join(', ');
    const tagsEnviadas = body.tags !== undefined;

    return textResponse(format(folder, { folder_id, camposAlterados, tagsEnviadas }));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao atualizar pasta de conhecimento #${folder_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format };

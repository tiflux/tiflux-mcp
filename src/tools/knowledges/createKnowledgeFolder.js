/**
 * Slice: create_knowledge_folder — cria uma nova pasta de conhecimentos.
 *
 * Endpoint: POST /knowledge-folders
 * Obrigatorio: title (nao vazio, <=255 chars — validado pela API).
 * Opcionais: description (texto plano, sem conversao Markdown→HTML — mesmo
 * criterio do update_knowledge_folder), icon (um unico emoji), tags (array de
 * strings: sem virgula, sem vazio apos strip, soma <=255 chars).
 *
 * organization_id e deletable sao definidos pelo servidor (organization_id do
 * usuario autenticado; deletable sempre true para pasta criada via API). Se o
 * cliente enviar esses campos, a API real REJEITA a request com 400
 * (error_code 40001, "found unpermitted parameter(s)") — validado ao vivo em
 * 2026-10-02 (ver checklist da spec, "Itens Descobertos na Validacao") —, entao
 * a tool nao os expoe no schema.
 *
 * Sem guard client-side de "nenhum campo informado" (diferente do update):
 * title e sempre obrigatorio e ja e o unico campo realmente necessario. O guard
 * de title ausente/vazio devolve um errorResponse de validacao proprio (antes
 * do try), para nao cair no internalErrorResponse ("Verifique sua conexao...")
 * e nao interpolar "undefined" no titulo.
 *
 * Resposta 201 tem o mesmo shape do GET/PUT (KnowledgeFolderBlueprint view
 * :show) — pasta nasce sempre vazia (qty_knowledges: 0, knowledges: []).
 *
 * Validado contra ../api_rails (2026-10-02, branch develop): campos aceitos
 * batem com update_knowledge_folder (compartilham KnowledgeFolders::BodyParams);
 * title e o unico campo que muda de opcional (update) para obrigatorio (create).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');

const OPTIONAL_FIELDS = ['description', 'icon', 'tags'];

const schema = {
  name: 'create_knowledge_folder',
  description:
    'Criar uma nova pasta na base de conhecimento do TiFlux. Campo obrigatorio: title (max. 255 caracteres). ' +
    'Campos opcionais: description (texto plano — nao aceita Markdown/HTML, diferente de create_knowledge), ' +
    'icon (um unico emoji) e tags (array de strings, sem virgula, soma <=255 caracteres). ' +
    'A pasta nasce sempre vazia (sem conhecimentos publicados) — use create_knowledge + knowledge_folder_ids ' +
    'para publicar artigos nela. Requer a permissao "Gerenciar conhecimento". ' +
    'Para editar uma pasta existente, use update_knowledge_folder.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titulo da pasta (obrigatorio, max. 255 caracteres; string vazia e rejeitada pela API).'
      },
      description: {
        type: 'string',
        description: 'Descricao da pasta. Texto plano — nao aceita Markdown/HTML (diferente de create_knowledge).'
      },
      icon: {
        type: 'string',
        description: 'Icone da pasta: um unico emoji (ex: "🚀"). Vazio ("") ou com mais de 1 emoji e rejeitado pela API (422).'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Tags da pasta. Cada tag nao pode conter virgula; a soma das tags (contando as virgulas separadoras) nao pode passar de 255 caracteres.'
      }
    },
    required: ['title']
  }
};

function format(folder) {
  const icone = folder.icon || '—';
  const tags = Array.isArray(folder.tags) && folder.tags.length > 0
    ? folder.tags.join(', ')
    : '—';
  const descricao = folder.description || '—';
  const qtyKnowledges = folder.qty_knowledges !== undefined ? folder.qty_knowledges : 0;

  let text = `**Pasta de conhecimento #${folder.id} criada**\n\n`;
  text += `**ID:** ${folder.id}\n`;
  text += `**Titulo:** ${folder.title || '—'}\n`;
  text += `**Icone:** ${icone}\n`;
  text += `**Tags:** ${tags}\n`;
  text += `**Descricao:** ${descricao}\n`;
  text += `**Artigos:** ${qtyKnowledges}\n`;

  text += `\n*Pasta criada vazia — use create_knowledge com knowledge_folder_ids: [${folder.id}] para publicar artigos nela.*`;

  return text;
}

async function execute(args, { api }) {
  // Guard de validacao: erro de input do usuario, nao falha interna/conexao.
  const title = args?.title;
  if (title === undefined || title === null || title === '') {
    return errorResponse(
      `**Erro: title e obrigatorio para criar uma pasta de conhecimento**\n\n` +
      `Informe o titulo da pasta (max. 255 caracteres).`
    );
  }

  try {
    const body = { title: args.title };
    for (const field of OPTIONAL_FIELDS) {
      if (args[field] !== undefined) {
        body[field] = args[field];
      }
    }

    const response = await api.createKnowledgeFolder(body);

    if (response.error) {
      const status = response.status;
      const byStatus = {
        403: {
          title: `**Erro ao criar pasta de conhecimento "${args.title}": sem permissao**`,
          tail: '*A permissao "Gerenciar conhecimento" e necessaria para criar pastas.*'
        }
      };
      const variant = byStatus[status] || {
        title: `**Erro ao criar pasta de conhecimento "${args.title}"**`,
        tail: '*Verifique os dados informados e suas permissoes.*'
      };
      return apiFailureResponse(variant.title, response, variant.tail);
    }

    const folder = response.data || {};

    return textResponse(format(folder));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao criar pasta de conhecimento "${args.title}"**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format };

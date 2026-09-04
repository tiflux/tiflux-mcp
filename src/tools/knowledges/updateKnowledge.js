/**
 * Slice: update_knowledge — atualiza parcialmente um conhecimento existente.
 *
 * Endpoint: PUT /knowledges/{id}
 * Permissao requerida: "Gerenciar conhecimento".
 * Todos os campos sao opcionais — apenas os informados sao enviados.
 *
 * Guards client-side:
 *   1. Nenhum campo atualizavel informado → erro antes de chamar a API.
 *   2. private: false + client_ids/technical_group_ids nao-vazios → erro (422 antecipado).
 *
 * Nota: description em Markdown e convertido para HTML antes de enviar.
 * Enviar description cria nova versao do artigo.
 *
 * Contrato validado empiricamente contra a API viva em 2026-09-01 (org de teste,
 * artigo descartavel criado e arquivado no fim). Observado:
 *   - PUT /knowledges/{id} existe e responde 200 (PATCH tambem responde 200).
 *   - Os 8 campos de UPDATABLE_FIELDS sao aceitos; campo desconhecido → 400.
 *   - Update parcial: enviar so `title` preserva `description` (nao apaga).
 *   - `knowledge_folder_ids: []` → 422 ("can't be blank"); `title: ""` e
 *     `description: ""` → 422 idem.
 *   - `private: false` sozinho zera `client_ids` e `technical_group_ids`.
 *   - `private: false` + vinculos nao-vazios → 422 (guard 2 antecipa esse erro).
 *   - ID inexistente → 404.
 * Nao verificavel pela API: a retencao das "10 ultimas versoes" (nao ha endpoint
 * de versoes) — permanece afirmacao condicional ("segundo o contrato da API").
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');

const UPDATABLE_FIELDS = [
  'title',
  'description',
  'private',
  'tags',
  'client_ids',
  'technical_group_ids',
  'knowledge_folder_ids',
  'services_catalogs_item_ids'
];

/**
 * Normaliza `private` para booleano estrito antes dos guards.
 *
 * O schema declara boolean, mas um cliente MCP pode enviar a string "false".
 * Confirmado contra a API viva em 2026-09-01: ela coage "false" para false
 * (zera os vinculos) — sem normalizar aqui, o guard 2 nao dispara e o conflito
 * so aparece como 422 tardio da API.
 * Valor irreconhecivel e devolvido intacto: a validacao final e da API.
 */
function normalizePrivate(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}

const schema = {
  name: 'update_knowledge',
  description:
    'Atualizar parcialmente um conhecimento existente na base de conhecimento do TiFlux. ' +
    'Apenas os campos informados sao atualizados — campos omitidos permanecem inalterados. ' +
    'Requer a permissao "Gerenciar conhecimento". ' +
    'ATENCAO: enviar o campo description cria uma nova versao do artigo (segundo o contrato da API, apenas as 10 ultimas versoes sao retidas). ' +
    'Use get_knowledge para ver o estado atual antes de atualizar.',
  inputSchema: {
    type: 'object',
    properties: {
      knowledge_id: {
        type: 'number',
        description: 'ID do conhecimento a ser atualizado (obtido via list_knowledges ou get_knowledge).'
      },
      title: {
        type: 'string',
        description: 'Novo titulo do conhecimento (max. 255 caracteres; string vazia e rejeitada pela API).'
      },
      description: {
        type: 'string',
        description:
          'Novo corpo do conhecimento. Aceita Markdown (o MCP converte para HTML antes de enviar) ou HTML cru (idempotente). ' +
          'ATENCAO: enviar este campo cria uma nova versao — segundo o contrato da API, apenas as 10 ultimas versoes sao retidas. ' +
          'String vazia e rejeitada pela API (422).'
      },
      private: {
        type: 'boolean',
        description:
          'Se false, torna o artigo publico e zera automaticamente client_ids e technical_group_ids. ' +
          'Nao envie client_ids ou technical_group_ids nao-vazios junto com private: false.'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Substitui as tags atuais. Cada tag nao pode conter virgula. Exemplo: ["VPN", "acesso remoto"].'
      },
      client_ids: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Substitui os clientes vinculados ao artigo. Array vazio remove todos. ' +
          'So aplicavel a artigos privados — enviar junto com private: false retorna erro.'
      },
      technical_group_ids: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Substitui os grupos tecnicos vinculados ao artigo. Array vazio remove todos. ' +
          'So aplicavel a artigos privados — enviar junto com private: false retorna erro.'
      },
      knowledge_folder_ids: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Substitui as pastas onde o artigo esta publicado. ' +
          'Array vazio e rejeitado pela API (422) — o artigo precisa estar em ao menos uma pasta.'
      },
      services_catalogs_item_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Substitui os itens de catalogo de servicos vinculados ao artigo. Array vazio remove todos.'
      }
    },
    required: ['knowledge_id']
  }
};

async function execute(args, { api }) {
  const knowledge_id = requireIntField(args, 'knowledge_id');

  // Montar body apenas com os campos informados (exceto knowledge_id)
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) {
      if (field === 'description') {
        body[field] = markdownToHtml(args[field]);
      } else if (field === 'private') {
        body[field] = normalizePrivate(args[field]);
      } else {
        body[field] = args[field];
      }
    }
  }

  // Guard 1: nenhum campo para atualizar
  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**Erro: nenhum campo para atualizar o conhecimento #${knowledge_id}**\n\n` +
      `Informe ao menos um campo: title, description, private, tags, client_ids, ` +
      `technical_group_ids, knowledge_folder_ids ou services_catalogs_item_ids.\n\n` +
      `*Use get_knowledge para ver o estado atual antes de atualizar.*`
    );
  }

  // Guard 2: conflito publico x vinculos
  const tornandoPublico = body.private === false;
  const temClientIds = Array.isArray(body.client_ids) && body.client_ids.length > 0;
  const temGroupIds = Array.isArray(body.technical_group_ids) && body.technical_group_ids.length > 0;
  if (tornandoPublico && (temClientIds || temGroupIds)) {
    return errorResponse(
      `**Erro: conflito entre private: false e vinculos nao-vazios no conhecimento #${knowledge_id}**\n\n` +
      `Um artigo publico nao pode ter client_ids ou technical_group_ids. ` +
      `Enviar private: false zera automaticamente esses vinculos na API — ` +
      `nao informe client_ids ou technical_group_ids junto com private: false.\n\n` +
      `*Corrija os parametros e tente novamente.*`
    );
  }

  try {
    const response = await api.updateKnowledge(knowledge_id, body);

    if (response.error) {
      const status = response.status;
      const byStatus = {
        403: {
          title: `**Erro ao atualizar conhecimento #${knowledge_id}: sem permissao**`,
          tail: '*A permissao "Gerenciar conhecimento" e necessaria para editar artigos.*'
        },
        404: {
          title: `**Erro ao atualizar conhecimento #${knowledge_id}: nao encontrado**`,
          tail: '*Conhecimento inexistente, arquivado, de outra organizacao ou nao visivel para o usuario.*'
        }
      };
      const variant = byStatus[status] || {
        title: `**Erro ao atualizar conhecimento #${knowledge_id}**`,
        tail: '*Verifique os dados informados e suas permissoes.*'
      };
      return apiFailureResponse(variant.title, response, variant.tail);
    }

    const k = response.data || {};
    const camposAlterados = Object.keys(body).join(', ');
    const privado = k.private !== undefined ? (k.private ? 'Privado' : 'Publico') : (body.private === false ? 'Publico' : 'Privado');
    const tags = Array.isArray(k.tags) && k.tags.length > 0
      ? k.tags.join(', ')
      : (Array.isArray(body.tags) ? body.tags.join(', ') || '—' : '—');
    const clientIds = Array.isArray(k.client_ids) && k.client_ids.length > 0
      ? k.client_ids.join(', ')
      : null;
    const groupIds = Array.isArray(k.technical_group_ids) && k.technical_group_ids.length > 0
      ? k.technical_group_ids.join(', ')
      : null;

    let text = `**Conhecimento #${knowledge_id} atualizado com sucesso!**\n\n`;
    text += `**ID:** ${k.id || knowledge_id}\n`;
    text += `**Titulo:** ${k.title || args.title || '—'}\n`;
    text += `**Visibilidade:** ${privado}\n`;
    text += `**Tags:** ${tags}\n`;
    text += `**Campos alterados:** ${camposAlterados}\n`;

    if (clientIds) {
      text += `**Clientes vinculados:** ${clientIds}\n`;
    }
    if (groupIds) {
      text += `**Grupos tecnicos vinculados:** ${groupIds}\n`;
    }

    const avisos = [];
    if (body.description !== undefined) {
      avisos.push('Nova versao do artigo criada (segundo o contrato da API, apenas as 10 ultimas versoes sao retidas).');
    }
    if (tornandoPublico) {
      avisos.push('Artigo tornado publico — client_ids e technical_group_ids foram zerados automaticamente.');
    }
    if (avisos.length > 0) {
      text += `\n*Atencao: ${avisos.join(' ')}*`;
    }

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao atualizar conhecimento #${knowledge_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: create_knowledge — cria um novo conhecimento na base de conhecimento.
 *
 * Endpoint: POST /knowledges
 * Obrigatorios: title, description (HTML), knowledge_folder_ids (array de int, >= 1).
 * Opcionais: tags, private, client_ids, technical_group_ids, services_catalogs_item_ids.
 *
 * Regra: client_ids e technical_group_ids so fazem sentido quando private = true.
 * Permissao requerida: "Gerenciar conhecimento".
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const OPTIONAL_FIELDS = [
  'tags',
  'private',
  'client_ids',
  'technical_group_ids',
  'services_catalogs_item_ids'
];

const schema = {
  name: 'create_knowledge',
  description: 'Criar um novo conhecimento na base de conhecimento do TiFlux. Campos obrigatorios: title, description (HTML) e knowledge_folder_ids (array com ao menos 1 ID de pasta). Os campos client_ids e technical_group_ids so se aplicam quando private = true. Requer a permissao "Gerenciar conhecimento".',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titulo do conhecimento (obrigatorio).'
      },
      description: {
        type: 'string',
        description: 'Corpo do conhecimento em HTML (obrigatorio). Exemplo: "<p>Conteudo do artigo.</p>"'
      },
      knowledge_folder_ids: {
        type: 'array',
        items: { type: 'number' },
        minItems: 1,
        description: 'IDs das pastas de conhecimento onde o artigo sera publicado (obrigatorio, ao menos 1). Exemplo: [12, 34].'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags para categorizar o conhecimento. Cada tag nao pode conter virgula. Exemplo: ["VPN", "acesso remoto"].'
      },
      private: {
        type: 'boolean',
        description: 'Se true (padrao), o conhecimento e privado e visivel apenas para os grupos/clientes vinculados. Se false, e publico.'
      },
      client_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs dos clientes com acesso ao conhecimento (so usado quando private = true). Exemplo: [100, 200].'
      },
      technical_group_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs dos grupos tecnicos com acesso ao conhecimento (so usado quando private = true). Exemplo: [5, 10].'
      },
      services_catalogs_item_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs dos itens de catalogo de servicos relacionados ao conhecimento. Exemplo: [301, 302].'
      }
    },
    required: ['title', 'description', 'knowledge_folder_ids']
  }
};

async function execute(args, { api }) {
  try {
    requireField(args, 'title');
    requireField(args, 'description');
    requireField(args, 'knowledge_folder_ids');

    if (!Array.isArray(args.knowledge_folder_ids) || args.knowledge_folder_ids.length === 0) {
      throw new Error('knowledge_folder_ids deve ser um array com ao menos 1 ID de pasta');
    }

    const body = {
      title: args.title,
      description: args.description,
      knowledge_folder_ids: args.knowledge_folder_ids
    };

    for (const field of OPTIONAL_FIELDS) {
      if (args[field] !== undefined) body[field] = args[field];
    }

    const response = await api.createKnowledge(body);

    if (response.error) {
      return apiFailureResponse(
        `**Erro ao criar conhecimento "${args.title}"**`,
        response,
        '*Verifique os dados informados e suas permissoes. A permissao "Gerenciar conhecimento" e necessaria.*'
      );
    }

    const k = response.data || {};
    const privado = k.private !== undefined ? (k.private ? 'Privado' : 'Publico') : (args.private === false ? 'Publico' : 'Privado');
    const pastas = Array.isArray(k.knowledge_folder_ids) && k.knowledge_folder_ids.length > 0
      ? k.knowledge_folder_ids.join(', ')
      : args.knowledge_folder_ids.join(', ');
    const tags = Array.isArray(k.tags) && k.tags.length > 0
      ? k.tags.join(', ')
      : (Array.isArray(args.tags) && args.tags.length > 0 ? args.tags.join(', ') : '—');

    let text = `**Conhecimento criado com sucesso!**\n\n`;
    text += `**ID:** ${k.id || '(sem ID)'}\n`;
    text += `**Titulo:** ${k.title || args.title}\n`;
    text += `**Visibilidade:** ${privado}\n`;
    text += `**Pastas:** ${pastas}\n`;
    text += `**Tags:** ${tags}\n`;

    if (Array.isArray(k.client_ids) && k.client_ids.length > 0) {
      text += `**Clientes vinculados:** ${k.client_ids.join(', ')}\n`;
    }
    if (Array.isArray(k.technical_group_ids) && k.technical_group_ids.length > 0) {
      text += `**Grupos tecnicos vinculados:** ${k.technical_group_ids.join(', ')}\n`;
    }
    if (Array.isArray(k.services_catalogs_item_ids) && k.services_catalogs_item_ids.length > 0) {
      text += `**Itens de catalogo vinculados:** ${k.services_catalogs_item_ids.join(', ')}\n`;
    }

    text += `\n*Conhecimento criado via API TiFlux. Use o ID ${k.id || '(sem ID)'} para referencias futuras.*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao criar conhecimento "${args.title}"**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

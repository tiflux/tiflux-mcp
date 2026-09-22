/**
 * Slice: create_entity — cria um campo personalizado (entity/grupo) na organizacao.
 *
 * Endpoint: POST /entities
 * Body enviado plano (sem wrapper "entity") — a API faz o wrap internamente
 * (Rails wrap_parameters), como os demais slices de create deste codebase.
 *
 * Guardrail BE-003: a chamada de transporte (api.createEntity) e so transporte;
 * toda a validacao/resolucao/formatacao vive aqui.
 *
 * IMPORTANTE (regras de negocio verificadas em 2026-09-22 contra a Swagger):
 *   - Requer role "manage_entities". Sem ela: 403 40301.
 *   - applied_in em ticket/equipment/catalogo exige licenca de Tickets. Sem ela: 403 40302 (detail.applied_in).
 *   - Organizacoes sem o novo formato de campos personalizados de catalogo: erro citando
 *     "cannot create entities applied in catalogs" — nao ha como habilitar via API.
 *   - So pode existir 1 entity ATIVA por catalogo/area/item — 2a tentativa → 422 no campo do vinculo.
 *   - menu_item e forcado para false pela API quando applied_in e solicitant ou qualquer catalogo.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveCatalogContext, resolveAreaContext } = require('../services_catalogs/catalogResolver');

const APPLIED_IN_VALUES = [
  'ticket', 'equipment', 'client', 'solicitant',
  'services_catalog', 'services_catalogs_area', 'services_catalogs_item'
];

const CATALOG_LINK_FIELDS = ['services_catalog_id', 'services_catalogs_area_id', 'services_catalogs_item_id'];

const schema = {
  name: 'create_entity',
  description:
    'Criar um campo personalizado (entity/grupo) no TiFlux — o primeiro passo para montar um campo personalizado ' +
    '(ex: selecao unica em um item de catalogo). ' +
    '⚠️ **Confirme com o usuario antes de executar**, resumindo nome, applied_in e vinculo: esta tool altera estrutura ' +
    'que afeta formularios de ticket/catalogo/cliente da organizacao inteira. Reforco extra necessario para ' +
    'applied_in em services_catalog ou services_catalogs_area (alcance maior que em item). ' +
    'Requer a role **manage_entities**; applied_in de ticket/equipment/catalogo tambem exige licenca de Tickets. ' +
    'So pode existir 1 entity ativa por catalogo/area/item — use list_entities para checar antes. ' +
    'Proximo passo apos criar: create_entity_field para adicionar os subcampos.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do campo personalizado (grupo). Obrigatorio.'
      },
      applied_in: {
        type: 'string',
        enum: APPLIED_IN_VALUES,
        description: 'Onde o campo sera aplicado. Obrigatorio. Determina qual outro parametro e exigido: "ticket" (desk_ids opcional), ' +
          '"equipment" (equipment_type_id opcional), "services_catalog" (services_catalog_id/services_catalog_name), ' +
          '"services_catalogs_area" (services_catalogs_area_id ou area_name+catalogo), "services_catalogs_item" (services_catalogs_item_id).'
      },
      description: {
        type: 'string',
        description: 'Descricao do campo personalizado (opcional).'
      },
      menu_item: {
        type: 'boolean',
        description: 'Se o campo e um item de menu (opcional). Forcado para false pela API quando applied_in e solicitant ou qualquer catalogo.'
      },
      desk_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs das mesas onde o campo se aplica. So valido com applied_in="ticket" (erro local caso contrario). Se omitido, aplica a todas as mesas.'
      },
      equipment_type_id: {
        type: 'number',
        description: 'ID do tipo de equipamento. So valido com applied_in="equipment" (erro local caso contrario). Se omitido, aplica a todos os tipos.'
      },
      services_catalog_id: {
        type: 'number',
        description: 'ID do catalogo de servicos (para applied_in="services_catalog", ou como contexto de area_name em "services_catalogs_area"; erro local com outro applied_in). Tem precedencia sobre services_catalog_name.'
      },
      services_catalog_name: {
        type: 'string',
        description: 'Nome do catalogo para resolucao automatica (alternativa a services_catalog_id). Mesmos applied_in aceitos que services_catalog_id.'
      },
      services_catalogs_area_id: {
        type: 'number',
        description: 'ID da area de catalogo. So valido com applied_in="services_catalogs_area" (erro local caso contrario). Tem precedencia sobre area_name.'
      },
      area_name: {
        type: 'string',
        description: 'Nome da area para resolucao automatica (requer services_catalog_id ou services_catalog_name). So valido com applied_in="services_catalogs_area".'
      },
      services_catalogs_item_id: {
        type: 'number',
        description: 'ID do item de catalogo. So valido com applied_in="services_catalogs_item" (erro local caso contrario). Obtenha via search_catalog_item ou list_services_catalog_items — resolucao por nome nao e suportada aqui.'
      }
    },
    required: ['name', 'applied_in']
  }
};

function detailMentions(detail, text) {
  if (!detail) return false;
  return Object.values(detail).some(v => [v].flat().join(' ').toLowerCase().includes(text));
}

const flatJoin = (value) => [value].flat().filter(Boolean).join(' ');

// Parametro de vinculo → applied_in em que ele e aceito. Fora deles → erro local
// (mesma guarda de desk_ids/equipment_type_id; antes eram descartados em silencio).
const SCOPED_PARAMS = {
  desk_ids: ['ticket'],
  equipment_type_id: ['equipment'],
  services_catalog_id: ['services_catalog', 'services_catalogs_area'],
  services_catalog_name: ['services_catalog', 'services_catalogs_area'],
  services_catalogs_area_id: ['services_catalogs_area'],
  area_name: ['services_catalogs_area'],
  services_catalogs_item_id: ['services_catalogs_item']
};

function validateArgs(args) {
  const { applied_in } = args;
  if (!APPLIED_IN_VALUES.includes(applied_in)) {
    const accepted = APPLIED_IN_VALUES.map(v => '`' + v + '`').join(', ');
    return errorResponse(
      `**❌ \`applied_in\` invalido: "${applied_in}"**\n\n` +
      `Valores aceitos: ${accepted}.`
    );
  }

  const misplaced = Object.keys(SCOPED_PARAMS)
    .find(param => args[param] !== undefined && !SCOPED_PARAMS[param].includes(applied_in));
  if (misplaced) {
    const allowed = SCOPED_PARAMS[misplaced].map(v => `\`applied_in="${v}"\``).join(' ou ');
    return errorResponse(
      `**❌ \`${misplaced}\` so e valido com ${allowed}**\n\n` +
      `Voce informou \`applied_in="${applied_in}"\`. Remova \`${misplaced}\` ou ajuste \`applied_in\`.`
    );
  }
  return null;
}

// Resolve o vinculo de catalogo/area/item exigido pelo applied_in.
// Retorna { fields } para mesclar no body, ou { response } em caso de erro.
async function resolveLink(api, args) {
  switch (args.applied_in) {
    case 'services_catalog': {
      const ctx = await resolveCatalogContext(api, args);
      return ctx.error ? { response: ctx.response } : { fields: { services_catalog_id: ctx.servicesCatalogId } };
    }
    case 'services_catalogs_area': {
      const ctx = await resolveAreaContext(api, args);
      return ctx.error ? { response: ctx.response } : { fields: { services_catalogs_area_id: ctx.areaId } };
    }
    case 'services_catalogs_item':
      if (!args.services_catalogs_item_id) {
        return {
          response: errorResponse(
            `**❌ Parametro obrigatorio ausente**\n\n` +
            `Informe \`services_catalogs_item_id\` (obtenha via \`search_catalog_item\` ou \`list_services_catalog_items\`).`
          )
        };
      }
      return { fields: { services_catalogs_item_id: args.services_catalogs_item_id } };
    default:
      return { fields: {} };
  }
}

function forbiddenResponse(response, detail, applied_in) {
  if (detailMentions(detail, 'cannot create entities applied in catalogs')) {
    return errorResponse(
      `**❌ Organizacao nao habilitada para campos personalizados em catalogo**\n\n` +
      `${flatJoin(detail.applied_in || detail.error)}\n\n` +
      `*Nao ha como habilitar via API — entre em contato com o suporte TiFlux.*`
    );
  }
  if (detail?.applied_in) {
    return errorResponse(
      `**❌ Licenca insuficiente para \`applied_in="${applied_in}"\`**\n\n` +
      `${[detail.applied_in].flat().join(' ')}\n\n` +
      `*E necessaria a licenca de Tickets para criar campos aplicados em ticket, equipment ou catalogo.*`
    );
  }
  return errorResponse(
    `**❌ Sem permissao para criar campos personalizados**\n\n` +
    `**Codigo:** ${response.status}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    `*E necessaria a role **manage_entities** no grupo de permissao do seu usuario.*`
  );
}

function validationResponse(detail, applied_in) {
  if (!detail) return null;
  const linkField = CATALOG_LINK_FIELDS.find(f => detail[f]);
  if (linkField) {
    return errorResponse(
      `**❌ Ja existe um campo personalizado ativo nesse vinculo**\n\n` +
      `**\`${linkField}\`:** ${[detail[linkField]].flat().join(', ')}\n\n` +
      `*Use \`list_entities applied_in=${applied_in}\` para localizar a entity existente.*`
    );
  }
  const fields = Object.entries(detail)
    .map(([field, msgs]) => `**\`${field}\`:** ${[msgs].flat().join(', ')}`)
    .join('\n');
  return fields ? errorResponse(`**❌ Erro de validacao ao criar campo personalizado**\n\n${fields}`) : null;
}

function failureResponse(response, applied_in) {
  const detail = extractApiErrorDetail(response);
  if (response.status === 403) return forbiddenResponse(response, detail, applied_in);
  return validationResponse(detail, applied_in) || apiFailureResponse(
    `**❌ Erro ao criar campo personalizado**`,
    response,
    '*Verifique se voce possui a role **manage_entities** e se os parametros informados sao validos.*'
  );
}

function formatLink(sc) {
  if (!sc) return '';
  const parts = [];
  if (sc.catalog_name) parts.push(`catalogo "${sc.catalog_name}" (#${sc.catalog_id})`);
  if (sc.area_name) parts.push(`area "${sc.area_name}" (#${sc.area_id})`);
  if (sc.item_name) parts.push(`item "${sc.item_name}" (#${sc.item_id})`);
  return parts.length > 0 ? `**Vinculo:** ${parts.join(' → ')}\n` : '';
}

function formatCreated(entity, { name, applied_in }) {
  let text = `**✅ Campo personalizado criado com sucesso!**\n\n`;
  text += `**ID:** ${entity.id}\n`;
  text += `**Nome:** ${entity.name || name}\n`;
  text += `**Applied in:** ${entity.applied_in || applied_in}\n`;
  text += formatLink(entity.service_catalog);
  if (Array.isArray(entity.desk_ids) && entity.desk_ids.length > 0) {
    text += `**Mesas:** ${entity.desk_ids.join(', ')}\n`;
  }
  text += `\n*Proximo passo: \`create_entity_field\` com \`entity_id=${entity.id}\` para adicionar os subcampos.*`;
  return text;
}

async function execute(args, { api }) {
  requireField(args, 'name');
  requireField(args, 'applied_in');

  const invalid = validateArgs(args);
  if (invalid) return invalid;

  const { name, applied_in, description, menu_item, desk_ids, equipment_type_id } = args;
  const body = { name, applied_in };
  if (description !== undefined) body.description = description;
  if (menu_item !== undefined) body.menu_item = menu_item;
  if (desk_ids !== undefined) body.desk_ids = desk_ids;
  if (equipment_type_id !== undefined) body.equipment_type_id = equipment_type_id;

  const link = await resolveLink(api, args);
  if (link.response) return link.response;
  Object.assign(body, link.fields);

  try {
    const response = await api.createEntity(body);
    if (response.error) return failureResponse(response, applied_in);
    return textResponse(formatCreated(response.data || {}, { name, applied_in }));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao criar campo personalizado**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

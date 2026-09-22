/**
 * Slice: update_entity — atualiza parcialmente um campo personalizado (entity/grupo).
 *
 * Endpoint: PUT /entities/{id}
 * Update parcial: so os campos informados vao no body.
 *
 * IMUTAVEIS pela API (nao expostos aqui): applied_in, services_catalog_id,
 * services_catalogs_area_id, services_catalogs_item_id — enviar qualquer um
 * retorna 400 40001 "found unpermitted parameter". Para mudar o alvo, crie
 * outro grupo e inative o antigo (active: false).
 *
 * Nao existe DELETE de entity na API v2 — o caminho reversivel para "desfazer"
 * um grupo criado por engano e update_entity { active: false }.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const UPDATABLE_FIELDS = ['name', 'description', 'active', 'menu_item', 'desk_ids', 'equipment_type_id'];

const schema = {
  name: 'update_entity',
  description:
    'Atualizar parcialmente um campo personalizado (entity/grupo) existente no TiFlux — apenas os campos informados ' +
    'sao alterados. Permite renomear, mudar descricao/mesas/tipo de equipamento/menu_item e **ativar/inativar** o grupo. ' +
    '⚠️ **Confirme com o usuario antes de executar**, resumindo o que sera alterado — reforco extra necessario quando ' +
    '`active: false` for informado (inativa o grupo e esconde todos os subcampos dos formularios). ' +
    '**Imutaveis:** `applied_in` e o vinculo de catalogo (services_catalog_id/services_catalogs_area_id/services_catalogs_item_id) ' +
    'nao podem ser alterados — para mudar o alvo, crie outro grupo com create_entity e inative este. ' +
    'Nao existe exclusao na API v2; o caminho reversivel para "desfazer" um grupo e `active: false` (reative com `active: true`).',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do campo personalizado (entity) a ser atualizado. Obrigatorio. Obtenha via list_entities.'
      },
      name: {
        type: 'string',
        description: 'Novo nome do campo personalizado (opcional).'
      },
      description: {
        type: 'string',
        description: 'Nova descricao do campo personalizado (opcional).'
      },
      active: {
        type: 'boolean',
        description: 'Ativar (true) ou inativar (false) o grupo (opcional). Inativar esconde todos os subcampos dos formularios — confirme com o usuario antes.'
      },
      menu_item: {
        type: 'boolean',
        description: 'Se o campo e um item de menu (opcional). Nao alteravel em entities com applied_in="solicitant" ou de catalogo (a API recusa com 422).'
      },
      desk_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs das mesas onde o campo se aplica (opcional). So valido em entities com applied_in="ticket".'
      },
      equipment_type_id: {
        type: 'number',
        description: 'ID do tipo de equipamento (opcional). So valido em entities com applied_in="equipment".'
      }
    },
    required: ['id']
  }
};

function yesNoOrDash(value) {
  if (value === undefined) return '—';
  return value ? 'Sim' : 'Nao';
}

function failureResponse(response, id) {
  const status = response.status;

  if (status === 400) {
    return errorResponse(
      `**❌ Erro ao atualizar entity #${id}: parametro nao permitido**\n\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*\`applied_in\` e o vinculo de catalogo sao imutaveis apos a criacao — crie outro grupo com create_entity para mudar o alvo.*`
    );
  }

  if (status === 404) {
    return errorResponse(
      `**❌ Entity #${id} nao encontrada**\n\n` +
      `*Use \`list_entities\` para localizar a entity correta.*`
    );
  }

  const detail = extractApiErrorDetail(response);
  const fields = detail
    ? Object.entries(detail).map(([field, msgs]) => `**\`${field}\`:** ${[msgs].flat().join(', ')}`).join('\n')
    : '';
  if (fields) {
    return errorResponse(`**❌ Erro de validacao ao atualizar entity #${id}**\n\n${fields}`);
  }

  return apiFailureResponse(
    `**❌ Erro ao atualizar entity #${id}**`,
    response,
    '*Verifique se voce possui a role **manage_entities** e se os parametros informados sao validos.*'
  );
}

async function execute(args, { api }) {
  requireField(args, 'id');
  const { id } = args;

  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe ao menos um campo para atualizar a entity #${id}.\n\n` +
      `*Campos disponiveis: name, description, active, menu_item, desk_ids, equipment_type_id.*`
    );
  }

  try {
    const response = await api.updateEntity(id, body);

    if (response.error) return failureResponse(response, id);

    const entity = response.data || {};
    const updatedFields = Object.keys(body).join(', ');

    let text = `**✅ Campo personalizado #${id} atualizado com sucesso!**\n\n`;
    text += `**Campos atualizados:** ${updatedFields}\n`;
    text += `**Nome:** ${entity.name ?? '—'}\n`;
    text += `**Ativa:** ${yesNoOrDash(entity.active)}\n`;
    if (Array.isArray(entity.desk_ids) && entity.desk_ids.length > 0) {
      text += `**Mesas:** ${entity.desk_ids.join(', ')}\n`;
    }

    if (body.active === false) {
      text += `\n*⚠️ Grupo inativado: os subcampos deixam de aparecer nos formularios. Para reativar, use \`update_entity { id: ${id}, active: true }\`.*`;
    }

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar entity #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

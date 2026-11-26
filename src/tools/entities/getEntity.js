/**
 * Slice: get_entity — detalhe de um campo personalizado (entity/grupo), incluindo
 * as mesas vinculadas (com nome).
 *
 * Endpoint: GET /entities/{id}
 * A listagem (GET /entities) nao devolve desk_ids — so o detalhe traz.
 *
 * Semantica de mesas (applied_in = "ticket"): `desk_ids: []` significa que o
 * campo vale para TODAS as mesas da organizacao.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, withValidationResponse, toolErrorResponse } = require('../_shared/errors');
const { requirePathIdField, ID_PARAM_HINTS } = require('../_shared/validators');
const { resolveDeskNames, renderDeskTable } = require('./deskNames');

const schema = {
  name: 'get_entity',
  description:
    'Ver os detalhes de um campo personalizado (entity/grupo) do TiFlux: nome, onde se aplica (applied_in), se esta ativo, ' +
    'descricao, menu_item, vinculo de catalogo ou tipo de equipamento e **as mesas vinculadas, pelo nome**. ' +
    'Use para responder "em quais mesas o campo X aparece?" (list_entities nao traz as mesas). ' +
    'Campo de ticket sem nenhuma mesa vinculada vale para **todas** as mesas. ' +
    'Para incluir/remover uma mesa sem sobrescrever as demais, use update_entity com add_desk_ids/remove_desk_ids.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do campo personalizado (entity). Obrigatorio. Obtenha via list_entities.'
      }
    },
    required: ['id']
  }
};

function yesNo(value) {
  if (value === undefined || value === null) return '—';
  return value ? 'Sim' : 'Nao';
}

function formatServiceCatalog(sc) {
  if (!sc || typeof sc !== 'object') return [];
  const lines = [];
  if (sc.catalog_id !== undefined && sc.catalog_id !== null) lines.push(`**Catalogo:** ${sc.catalog_name || '—'} (#${sc.catalog_id})`);
  if (sc.area_id !== undefined && sc.area_id !== null) lines.push(`**Area:** ${sc.area_name || '—'} (#${sc.area_id})`);
  if (sc.item_id !== undefined && sc.item_id !== null) lines.push(`**Item:** ${sc.item_name || '—'} (#${sc.item_id})`);
  return lines;
}

/**
 * Bloco "Mesas" do detalhe. Exportado para o update_entity reaproveitar.
 *
 * @param {object} entity - { applied_in, desk_ids }
 * @param {Map<number,string>} names - mapa resolvido por resolveDeskNames
 */
function formatDesksSection(entity, names) {
  if (entity.applied_in !== 'ticket') {
    return `**Mesas:** nao se aplica (campo aplicado em \`${entity.applied_in ?? '—'}\`)\n`;
  }
  const ids = Array.isArray(entity.desk_ids) ? entity.desk_ids : [];
  if (ids.length === 0) {
    return '**Mesas:** **Todas as mesas** (nenhuma mesa especifica vinculada)\n';
  }
  return `**Mesas vinculadas (${ids.length}):**\n\n${renderDeskTable(ids, names)}`;
}

function formatEntity(entity, names = new Map()) {
  let text = `**Campo personalizado #${entity.id}: ${entity.name ?? '—'}**\n\n`;
  text += `**Aplicado em:** ${entity.applied_in ?? '—'}\n`;
  text += `**Ativo:** ${yesNo(entity.active)}\n`;
  if (entity.description) text += `**Descricao:** ${entity.description}\n`;
  text += `**Item de menu:** ${yesNo(entity.menu_item)}\n`;
  if (entity.equipment_type_id !== undefined && entity.equipment_type_id !== null) {
    text += `**Tipo de equipamento:** #${entity.equipment_type_id}\n`;
  }
  for (const line of formatServiceCatalog(entity.service_catalog)) text += `${line}\n`;
  text += `\n${formatDesksSection(entity, names)}`;

  if (entity.applied_in === 'ticket') {
    text += `\n*Para incluir ou remover uma mesa sem alterar as demais, use \`update_entity\` com \`add_desk_ids\` / \`remove_desk_ids\`.*`;
  } else {
    text += `\n*Para ver os subcampos, use \`list_entity_fields\` com entity_id ${entity.id}.*`;
  }
  return text;
}

function failureResponse(response, id) {
  if (Number(response.status) === 404) {
    return errorResponse(
      `**❌ Campo personalizado #${id} nao encontrado**\n\n` +
      `*Use \`list_entities\` para localizar o ID correto.*`
    );
  }
  if (Number(response.status) === 403) {
    return apiFailureResponse(
      `**❌ Sem permissao para ver o campo personalizado #${id}**`,
      response,
      '*Verifique se voce possui a role **manage_entities** (permissao de gerenciar campos personalizados).*'
    );
  }
  return apiFailureResponse(`**❌ Erro ao buscar campo personalizado #${id}**`, response, '', { hints: true });
}

async function execute(args, { api }) {
  // id vira path param: inteiro positivo estrito ("..", "1/2" nao chegam a URL).
  const id = Number(requirePathIdField(args, 'id', { hint: ID_PARAM_HINTS.entity }));

  try {
    const response = await api.getEntity(id);
    if (response.error) return failureResponse(response, id);

    const entity = response.data || {};
    const deskIds = entity.applied_in === 'ticket' && Array.isArray(entity.desk_ids) ? entity.desk_ids : [];
    const { names } = await resolveDeskNames(api, deskIds);

    return textResponse(formatEntity(entity, names));
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar campo personalizado #${id}`, error);
  }
}

module.exports = {
  name: schema.name,
  schema,
  execute: withValidationResponse('Erro ao buscar campo personalizado', execute),
  format: formatEntity,
  formatDesksSection,
  failureResponse
};

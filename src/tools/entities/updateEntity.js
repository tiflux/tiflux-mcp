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
const { errorResponse, apiFailureResponse, extractApiErrorDetail, withValidationResponse, toolErrorResponse } = require('../_shared/errors');
const { requirePathIdField, parseIntStrict, ValidationError, ID_PARAM_HINTS } = require('../_shared/validators');
const { resolveDeskNames, formatDeskList } = require('./deskNames');
const { formatDesksSection, failureResponse: getFailureResponse } = require('./getEntity');

const UPDATABLE_FIELDS = ['name', 'description', 'active', 'menu_item', 'desk_ids', 'equipment_type_id'];
const DESK_DELTA_FIELDS = ['add_desk_ids', 'remove_desk_ids'];
// Teto por lista: cada ID de add fora das mesas ativas vira um GET /desks/{id} de validacao
// (deskNames.js limita os demais lookups a MAX_DESK_LOOKUPS, em lotes).
const MAX_DESK_DELTA = 50;

const schema = {
  name: 'update_entity',
  description:
    'Atualizar parcialmente um campo personalizado (entity/grupo) existente no TiFlux — apenas os campos informados ' +
    'sao alterados. Permite renomear, mudar descricao/mesas/tipo de equipamento/menu_item e **ativar/inativar** o grupo. ' +
    '**Mesas (campo de ticket):** para incluir ou remover uma mesa mantendo as demais, use `add_desk_ids` / `remove_desk_ids` ' +
    '(o MCP le as mesas atuais e envia a lista mesclada). `desk_ids` **substitui** a lista inteira; `desk_ids: []` faz o campo ' +
    'valer em **todas** as mesas. Remover a ultima mesa via `remove_desk_ids` e recusado (o campo passaria a valer em todas as mesas) — ' +
    'para isso, peca explicitamente `desk_ids: []`. Incluir mesa via `add_desk_ids` em campo que hoje vale para **todas** as mesas ' +
    '(sem mesa vinculada) tambem e recusado (restringiria o campo as mesas informadas) — para isso, confirme com o usuario e use `desk_ids: [...]`. ' +
    `Ate ${MAX_DESK_DELTA} IDs por lista. Add/remove leem e regravam a lista (sem trava): edicao concorrente das mesas no portal entre a leitura e a gravacao pode ser sobrescrita. ` +
    'Veja as mesas atuais com get_entity. ' +
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
        description: 'ID do campo personalizado (entity) a ser atualizado. Obrigatorio. Obtenha via list_entities ou get_entity.'
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
        description: 'Lista COMPLETA de IDs das mesas onde o campo se aplica (opcional) — **substitui** a lista inteira. ' +
          '`[]` faz o campo valer em **todas** as mesas. Para incluir/remover uma mesa use add_desk_ids/remove_desk_ids. ' +
          'So valido em entities com applied_in="ticket". Nao combine com add_desk_ids/remove_desk_ids.'
      },
      add_desk_ids: {
        type: 'array',
        items: { type: 'number' },
        maxItems: MAX_DESK_DELTA,
        description: 'IDs de mesas a INCLUIR, mantendo as ja vinculadas (opcional). So valido em applied_in="ticket". ' +
          'IDs de mesa inexistentes sao recusados antes de enviar. Recusado se o campo hoje vale para todas as mesas (sem mesa vinculada) — ' +
          `nesse caso use desk_ids: [...]. Ate ${MAX_DESK_DELTA} IDs. Nao combine com desk_ids.`
      },
      remove_desk_ids: {
        type: 'array',
        items: { type: 'number' },
        maxItems: MAX_DESK_DELTA,
        description: 'IDs de mesas a REMOVER, mantendo as demais (opcional). So valido em applied_in="ticket". ' +
          `Nao remove a ultima mesa (campo sem mesa vale para todas) — para isso use desk_ids: []. Ate ${MAX_DESK_DELTA} IDs. Nao combine com desk_ids.`
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

function failureResponse(response, id, { deskIdsSent = false } = {}) {
  const status = response.status;

  if (status === 400) {
    return errorResponse(
      `**❌ Erro ao atualizar entity #${id}: parametro nao permitido**\n\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*\`applied_in\` e o vinculo de catalogo sao imutaveis apos a criacao — crie outro grupo com create_entity para mudar o alvo.*`
    );
  }

  // PUT com desk_ids de mesa inexistente/de outra organizacao tambem responde 404
  // (40401/40402, detail "Couldn't find ServiceDesk::Desk ...") — confirmado ao vivo em 2026-11-25.
  // O 404 da propria entity vem como "Couldn't find Entity ..." (reconfirmado ao vivo no PR #147);
  // o match exige a classe exata e so vale quando o body levou desk_ids.
  if (status === 404 && deskIdsSent && /ServiceDesk::Desk\b/.test(JSON.stringify(response.detail ?? ''))) {
    return errorResponse(
      `**❌ Mesa nao encontrada ao atualizar entity #${id}**\n\n` +
      `Algum ID em \`desk_ids\` nao existe nesta organizacao. Nenhuma alteracao foi aplicada.\n\n` +
      `*Confira os IDs com \`list_desks\` (ou use \`add_desk_ids\`, que valida as mesas antes de enviar).*`
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

/**
 * desk_ids devolvido pela API → lista de inteiros positivos, ou null se vier algo
 * fora desse formato (nao regravar lista corrompida: NaN viraria null no PUT).
 */
function toIdList(value) {
  if (value === undefined || value === null) return [];
  const ids = [value].flat().map(Number);
  if (ids.some(deskId => !Number.isInteger(deskId) || deskId <= 0)) return null;
  return [...new Set(ids)];
}

/**
 * Valida uma lista de IDs de mesa antes de qualquer chamada: cada ID inteiro
 * positivo (sem coercao silenciosa — "abc" viraria NaN). add/remove tem teto
 * MAX_DESK_DELTA; desk_ids (lista completa) nao.
 * @throws {ValidationError}
 */
function parseDeskIdList(args, field, { max = MAX_DESK_DELTA } = {}) {
  const values = args[field] === undefined || args[field] === null ? [] : [args[field]].flat();
  const hint = `Informe ${field} como lista de IDs de mesa (inteiros positivos). Para achar o ID, use list_desks.`;
  if (max !== null && values.length > max) {
    throw new ValidationError(`${field} aceita no maximo ${MAX_DESK_DELTA} IDs por chamada (recebidos ${values.length})`, {
      hint: `Divida a alteracao em chamadas de ate ${MAX_DESK_DELTA} mesas, ou use desk_ids com a lista completa.`
    });
  }
  return [...new Set(values.map((value) => {
    const deskId = parseIntStrict(value, field, { hint });
    if (deskId <= 0) throw new ValidationError(`${field} deve conter apenas IDs inteiros positivos`, { hint });
    return deskId;
  }))];
}

function hasDeskDelta(args) {
  return DESK_DELTA_FIELDS.some(field => args[field] !== undefined);
}

/**
 * Read-modify-write de add_desk_ids/remove_desk_ids.
 *
 * @returns {Promise<{ response: object } | { deskIds: number[], diff: object, names: Map }>}
 *   `response` = resposta MCP pronta (erro local, erro da API ou "nada a alterar").
 */
async function planDeskDelta(api, id, { add, remove }) {
  const both = add.filter(deskId => remove.includes(deskId));
  if (both.length > 0) {
    return { response: errorResponse(
      `**⚠️ Mesa em add_desk_ids e remove_desk_ids ao mesmo tempo**\n\n` +
      `IDs: ${both.join(', ')}. Informe cada mesa em apenas uma das listas.`
    ) };
  }

  const current = await api.getEntity(id);
  // Erro na LEITURA previa: mensagem de leitura, nao "erro ao atualizar" (nada foi gravado).
  if (current.error) return { response: getFailureResponse(current, id) };

  const entity = current.data || {};
  if (entity.applied_in !== 'ticket') {
    return { response: errorResponse(
      `**❌ Mesas nao se aplicam ao campo personalizado #${id}**\n\n` +
      `O campo e aplicado em \`${entity.applied_in ?? '—'}\` — mesas (add_desk_ids/remove_desk_ids/desk_ids) so valem para campos com applied_in="ticket".`
    ) };
  }

  const currentIds = toIdList(entity.desk_ids);
  if (currentIds === null) {
    return { response: errorResponse(
      `**❌ Mesas do campo personalizado #${id} vieram em formato inesperado da API**\n\n` +
      `Nenhuma alteracao foi enviada (regravar a lista poderia corrompe-la). ` +
      `Confira o campo com \`get_entity\` ou use \`desk_ids\` com a lista completa.`
    ) };
  }
  const toAdd = add.filter(deskId => !currentIds.includes(deskId));

  // Espelho do passo 6 (spec, passo 6b): campo sem mesa vale para TODAS; incluir uma mesa o restringiria a ela.
  if (currentIds.length === 0 && toAdd.length > 0) {
    return { response: errorResponse(
      `**⚠️ Inclusao recusada: o campo #${id} hoje vale para todas as mesas**\n\n` +
      `Campo de ticket sem mesa vinculada aparece em **todas** as mesas da organizacao — incluir ` +
      `${toAdd.join(', ')} via \`add_desk_ids\` restringiria o campo a essa(s) mesa(s), em vez de manter as demais.\n\n` +
      `*Se a intencao e mesmo restringir o campo, confirme com o usuario e use ` +
      `\`update_entity { id: ${id}, desk_ids: [${toAdd.join(', ')}] }\` com a lista completa.*`
    ) };
  }

  // add primeiro: sao os IDs que precisam de validacao (getDesk 404) e nunca ficam fora do teto de lookups.
  // remove nao vinculado nao e resolvido (sai so "#id").
  const removeLinked = remove.filter(deskId => currentIds.includes(deskId));
  const { names, unknownIds } = await resolveDeskNames(api, [...toAdd, ...currentIds, ...removeLinked]);

  const unknownToAdd = toAdd.filter(deskId => unknownIds.includes(deskId));
  if (unknownToAdd.length > 0) {
    return { response: errorResponse(
      `**❌ Mesa(s) nao encontrada(s): ${unknownToAdd.join(', ')}**\n\n` +
      `Nenhuma alteracao foi enviada. Confira os IDs com \`list_desks\`.`
    ) };
  }

  const diff = {
    added: toAdd,
    removed: removeLinked,
    alreadyLinked: add.filter(deskId => currentIds.includes(deskId)),
    notLinked: remove.filter(deskId => !currentIds.includes(deskId))
  };
  const deskIds = currentIds.filter(deskId => !diff.removed.includes(deskId)).concat(diff.added);

  if (deskIds.length === 0 && diff.removed.length > 0) {
    return { response: errorResponse(
      `**⚠️ Remocao recusada: o campo #${id} ficaria sem nenhuma mesa**\n\n` +
      `Campo de ticket sem mesa vinculada passa a valer para **todas** as mesas da organizacao — ` +
      `remover a ultima mesa nao esconde o campo, espalha ele.\n\n` +
      `*Se a intencao e mesmo fazer o campo valer em todas as mesas, confirme com o usuario e use ` +
      `\`update_entity { id: ${id}, desk_ids: [] }\`. Para esconder o campo, use \`active: false\`.*`
    ) };
  }

  return { deskIds, diff, names };
}

function formatDiffLines(diff, names) {
  if (!diff) return '';
  const rows = [
    ['Incluidas', diff.added],
    ['Removidas', diff.removed],
    ['Ja vinculadas', diff.alreadyLinked],
    ['Nao estavam vinculadas', diff.notLinked]
  ];
  return rows
    .filter(([, ids]) => ids.length > 0)
    .map(([label, ids]) => `**${label}:** ${formatDeskList(ids, names)}\n`)
    .join('');
}

function noDeskChangeResponse(id, diff, names) {
  return textResponse(
    `**ℹ️ Nada a alterar nas mesas do campo personalizado #${id}**\n\n` +
    formatDiffLines(diff, names) +
    `\n*Nenhuma alteracao foi enviada a API.*`
  );
}

async function formatSuccess({ api, id, body, entity, plan }) {
  const updatedFields = Object.keys(body).join(', ');

  let text = `**✅ Campo personalizado #${id} atualizado com sucesso!**\n\n`;
  text += `**Campos atualizados:** ${updatedFields}\n`;
  text += `**Nome:** ${entity.name ?? '—'}\n`;
  text += `**Ativa:** ${yesNoOrDash(entity.active)}\n`;

  if (body.desk_ids !== undefined) {
    const finalIds = Array.isArray(entity.desk_ids) ? entity.desk_ids : body.desk_ids;
    // Com plano (add/remove), todos os IDs finais ja foram consultados — nao repetir a rajada de lookups.
    const names = plan ? plan.names : (await resolveDeskNames(api, finalIds)).names;
    text += formatDiffLines(plan?.diff, names);
    text += `\n${formatDesksSection({ applied_in: entity.applied_in || 'ticket', desk_ids: finalIds }, names)}`;
    if (finalIds.length === 0) {
      text += `\n*⚠️ Sem mesa vinculada: o campo agora aparece em **todas** as mesas da organizacao.*\n`;
    }
  }

  if (body.active === false) {
    text += `\n*⚠️ Grupo inativado: os subcampos deixam de aparecer nos formularios. Para reativar, use \`update_entity { id: ${id}, active: true }\`.*`;
  }
  return text;
}

/**
 * Validacoes locais (sem API). Devolve a resposta de erro ou o body parcial.
 */
function buildBody(args, id, withDelta) {
  if (withDelta && args.desk_ids !== undefined) {
    return { response: errorResponse(
      `**⚠️ Parametros conflitantes**\n\n` +
      `\`desk_ids\` substitui a lista inteira de mesas; \`add_desk_ids\`/\`remove_desk_ids\` alteram so as mesas informadas. ` +
      `Use um ou outro.`
    ) };
  }

  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }
  if (body.desk_ids !== undefined) body.desk_ids = parseDeskIdList(args, 'desk_ids', { max: null });

  if (Object.keys(body).length === 0 && !withDelta) {
    return { response: errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe ao menos um campo para atualizar a entity #${id}.\n\n` +
      `*Campos disponiveis: name, description, active, menu_item, desk_ids, add_desk_ids, remove_desk_ids, equipment_type_id.*`
    ) };
  }
  return { body };
}

async function execute(args, { api }) {
  // id vira path param: inteiro positivo estrito ("..", "1/2" nao chegam a URL).
  const id = Number(requirePathIdField(args, 'id', { hint: ID_PARAM_HINTS.entity }));
  const withDelta = hasDeskDelta(args);

  const built = buildBody(args, id, withDelta);
  if (built.response) return built.response;
  const { body } = built;
  const delta = withDelta
    ? { add: parseDeskIdList(args, 'add_desk_ids'), remove: parseDeskIdList(args, 'remove_desk_ids') }
    : null;

  try {
    let plan = null;
    if (withDelta) {
      plan = await planDeskDelta(api, id, delta);
      if (plan.response) return plan.response;
      const unchanged = plan.diff.added.length === 0 && plan.diff.removed.length === 0;
      if (unchanged && Object.keys(body).length === 0) return noDeskChangeResponse(id, plan.diff, plan.names);
      if (!unchanged) body.desk_ids = plan.deskIds;
    }

    const response = await api.updateEntity(id, body);
    if (response.error) return failureResponse(response, id, { deskIdsSent: body.desk_ids !== undefined });

    const text = await formatSuccess({ api, id, body, entity: response.data || {}, plan });
    return textResponse(text);
  } catch (error) {
    return toolErrorResponse(`Erro ao atualizar entity #${id}`, error);
  }
}

module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao atualizar campo personalizado', execute) };

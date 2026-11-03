/**
 * Slice: update_ticket_entities — atualiza campos personalizados (entities) de um ticket.
 *
 * Endpoint: PUT /tickets/{ticket_number}/entities (via api.updateTicketEntities).
 * Limite: 50 campos por requisicao.
 *
 * Atualizacao parcial (H8): a API grava os itens validos e responde 207
 * `{ error_code: 20701, detail: { entities: ["The property '#/<i>/value': ..."] } }`.
 * O indice `<i>` aponta o item enviado; o slice mapeia para o entity_field_id e
 * mostra o que foi salvo e o que foi recusado. Nenhum item salvo → isError.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveEntities, formatUpdatedFields, buildEntitiesSchema } = require('../_shared/entityFieldResolver');

const PARTIAL_STATUS = 207;
const PARTIAL_ERROR_CODE = 20701;

const schema = {
  name: 'update_ticket_entities',
  description: 'Atualizar campos personalizados (entities) de um ticket no TiFlux. Suporta até 50 campos por requisição. Se a API recusar parte dos campos (ex.: e-mail inválido), os válidos são gravados e a resposta é "Atualização parcial", com o motivo de cada campo recusado; se nenhum for gravado, é erro. Para campos checkbox com múltiplas opções, envie um item por opção com entity_field_id + entity_field_option_id + value: "true"/"false".\n\n**Prefira IDs quando conhecidos** para evitar round-trips de resolução. Use entity_name/entity_field_name/entity_field_option_name para resolver automaticamente quando não tiver os IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser atualizado' },
      entities: buildEntitiesSchema('get_ticket')
    },
    required: ['ticket_number', 'entities']
  }
};

function isPartialResponse(response) {
  return response.status === PARTIAL_STATUS || response.data?.error_code === PARTIAL_ERROR_CODE;
}

// "The property '#/1/value': is not a valid email" → 1 (indice do item enviado). Sem indice → null.
function errorIndex(message) {
  const match = /#\/(\d+)(?:\/|'|$)/.exec(String(message));
  return match ? Number.parseInt(match[1], 10) : null;
}

function fieldLabel(entity, index) {
  return entity ? `campo ${entity.entity_field_id}` : `item ${index}`;
}

// Agrupa os erros de `detail.entities[]` pelo indice do item enviado; erro sem
// indice reconhecivel (ou fora do array enviado) vai como geral.
function groupPartialErrors(messages, sentCount) {
  const failedByIndex = new Map();
  const general = [];
  for (const message of messages) {
    const index = errorIndex(message);
    if (index === null || index >= sentCount) {
      general.push(String(message));
      continue;
    }
    if (!failedByIndex.has(index)) failedByIndex.set(index, []);
    failedByIndex.get(index).push(String(message));
  }
  return { failedByIndex, general };
}

function partialBody({ sent, savedEntities, failedByIndex, general, unknown }) {
  const savedLines = savedEntities.map(e => `• campo ${e.entity_field_id} — salvo`).join('\n');
  const failedLines = [...failedByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, errs]) => `• ${fieldLabel(sent[i], i)} — recusado: ${errs.join('; ')}`)
    .join('\n');
  const generalLines = general.map(m => `• ${m}`).join('\n');

  let out = '';
  if (!unknown) {
    out += `**Enviados:** ${sent.length} | **Salvos:** ${savedEntities.length} | **Recusados:** ${failedByIndex.size}\n\n`;
    if (savedLines) out += `**Salvos:**\n${savedLines}\n\n`;
  }
  if (failedLines) out += `**Recusados pela API:**\n${failedLines}\n\n`;
  if (generalLines) out += `**Erros da API${unknown ? ' (sem indicação do campo)' : ''}:**\n${generalLines}\n\n`;
  return out;
}

/**
 * 207: monta "salvos" × "recusados" a partir de `detail.entities[]`.
 * Nenhum item salvo → isError. Sem erro mapeado a item → nao afirma o que foi salvo.
 */
function partialUpdateResponse(ticketNumber, sent, detail) {
  const messages = Array.isArray(detail?.entities) ? detail.entities : [];
  const { failedByIndex, general } = groupPartialErrors(messages, sent.length);
  const savedEntities = sent.filter((_, i) => !failedByIndex.has(i));
  const unknown = failedByIndex.size === 0;
  const noneSaved = !unknown && savedEntities.length === 0;

  const title = noneSaved
    ? `**❌ Nenhum campo personalizado foi atualizado no ticket #${ticketNumber}**`
    : `**⚠️ Atualização parcial dos campos personalizados do ticket #${ticketNumber}**`;
  const hint = unknown
    ? `*A API indicou atualização parcial (207) sem apontar os campos; confira com get_ticket antes de repetir.*`
    : `*Corrija só os campos recusados e envie de novo; os salvos não precisam ser reenviados.*`;
  const out = `${title}\n\n${partialBody({ sent, savedEntities, failedByIndex, general, unknown })}${hint}`;

  return noneSaved ? errorResponse(out) : textResponse(out);
}

async function execute(args, { api }) {
  const { ticket_number, entities } = args;

  requireField(args, 'ticket_number');

  if (!entities || !Array.isArray(entities) || entities.length === 0) {
    throw new Error('entities é obrigatório e deve ser um array com pelo menos 1 campo');
  }

  if (entities.length > 50) {
    return errorResponse(
      `**❌ Limite excedido**\n\n` +
      `Você está tentando atualizar ${entities.length} campos, mas o limite é de 50 campos por requisição.\n\n` +
      `*Divida a atualização em múltiplas requisições.*`
    );
  }

  try {
    // Resolucao por nome (entity/field/option) + validacao por item — logica compartilhada.
    const resolution = await resolveEntities(entities, api);
    if (resolution.error) {
      return errorResponse(resolution.error);
    }
    const { resolvedEntities } = resolution;

    // Atualizar via API
    const response = await api.updateTicketEntities(ticket_number, { entities: resolvedEntities });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao atualizar campos personalizados do ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe, se os entity_field_id são válidos e se você tem permissão para editar.*`
      );
    }

    if (isPartialResponse(response)) {
      return partialUpdateResponse(ticket_number, resolvedEntities, response.data?.detail);
    }

    const entitiesText = formatUpdatedFields(response.data?.entities, resolvedEntities);

    return textResponse(
      `**✅ Campos personalizados atualizados com sucesso!**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Campos processados:** ${resolvedEntities.length}${entitiesText}\n\n` +
      `*✅ Campos atualizados via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar campos personalizados**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

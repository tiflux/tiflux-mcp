/**
 * Slice: update_entity_field — atualiza parcialmente um subcampo (entity_field).
 *
 * Endpoint: PUT /entities/{entity_id}/fields/{id}
 * Update parcial: so os campos informados vao no body.
 *
 * IMUTAVEL pela API (nao exposto aqui): field_type — enviar retorna 400 40001
 * "found unpermitted parameter". Para mudar o tipo, crie outro subcampo.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const UPDATABLE_FIELDS = ['name', 'required'];

const schema = {
  name: 'update_entity_field',
  description:
    'Atualizar parcialmente um subcampo (entity_field) existente no TiFlux — apenas os campos informados sao alterados. ' +
    'Permite renomear e alterar obrigatoriedade (`required`). ' +
    '⚠️ **Confirme com o usuario antes de executar** — reforco extra necessario quando `required: true` for informado ' +
    '(passa a bloquear abertura/fechamento de ticket em quem usa o catalogo/mesa vinculado). ' +
    '**Imutavel:** `field_type` nao pode ser alterado — para corrigir o tipo, crie outro subcampo com create_entity_field. ' +
    'Nao existe exclusao de subcampo na API v2.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'number',
        description: 'ID do campo personalizado (entity) pai. Obrigatorio.'
      },
      id: {
        type: 'number',
        description: 'ID do subcampo (entity_field) a ser atualizado. Obrigatorio. Obtenha via list_entity_fields.'
      },
      name: {
        type: 'string',
        description: 'Novo nome do subcampo (opcional).'
      },
      required: {
        type: 'boolean',
        description: 'Nova obrigatoriedade do subcampo (opcional). `true` passa a bloquear abertura/fechamento de ticket sem preenchimento — confirme com o usuario antes.'
      }
    },
    required: ['entity_id', 'id']
  }
};

function yesNoOrDash(value) {
  if (value === undefined) return '—';
  return value ? 'Sim' : 'Nao';
}

async function execute(args, { api }) {
  requireField(args, 'entity_id');
  requireField(args, 'id');
  const { entity_id, id } = args;

  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe ao menos um campo para atualizar o subcampo #${id}.\n\n` +
      `*Campos disponiveis: name, required.*`
    );
  }

  try {
    const response = await api.updateEntityField(entity_id, id, body);

    if (response.error) {
      const status = response.status;

      if (status === 400) {
        return errorResponse(
          `**❌ Erro ao atualizar subcampo #${id}: parametro nao permitido**\n\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*\`field_type\` e imutavel apos a criacao — crie outro subcampo com create_entity_field para mudar o tipo.*`
        );
      }

      if (status === 404) {
        return errorResponse(
          `**❌ Entity ou subcampo nao encontrado (entity_id=${entity_id}, id=${id})**\n\n` +
          `*Use \`list_entity_fields\` para localizar o subcampo correto.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao atualizar subcampo #${id}**`,
        response,
        '*Verifique se voce possui a role **manage_entities** e se os parametros informados sao validos.*'
      );
    }

    const field = response.data || {};
    const updatedFields = Object.keys(body).join(', ');

    let text = `**✅ Subcampo #${id} atualizado com sucesso!**\n\n`;
    text += `**Campos atualizados:** ${updatedFields}\n`;
    text += `**Nome:** ${field.name ?? '—'}\n`;
    text += `**Tipo:** ${field.field_type ?? '—'}\n`;
    text += `**Obrigatorio:** ${yesNoOrDash(field.required)}\n`;

    if (body.required === true) {
      text += `\n*⚠️ Campo agora obrigatorio: passa a bloquear abertura/fechamento de ticket sem preenchimento.*`;
    }

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar subcampo #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

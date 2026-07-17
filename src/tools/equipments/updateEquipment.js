/**
 * Slice: update_equipment — atualiza um recurso/equipamento existente.
 *
 * Endpoint: PUT /equipments/{id} (via api.updateEquipment).
 * Obrigatorio: equipment_id.
 * Demais campos opcionais — so envia os informados.
 *
 * Nota: client_id NAO pode ser alterado via PUT — campo fora do schema de update.
 * Para trocar o cliente, crie um novo recurso.
 *
 * Permissoes necessarias: "Gerenciar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');

const schema = {
  name: 'update_equipment',
  description:
    'Atualizar um recurso/equipamento existente no TiFlux. ' +
    'Obrigatorio: equipment_id (ID do recurso a atualizar). ' +
    'Campos opcionais: name, equipment_type_id, equipment_group_id, acquisition_date, warranty_date. ' +
    'Apenas os campos informados sao enviados na atualizacao. ' +
    'client_id nao pode ser alterado — para trocar o cliente, crie um novo recurso. ' +
    'Use list_equipment_types e list_equipment_groups (com client_id) para descobrir IDs validos. ' +
    'Requer permissao "Gerenciar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      equipment_id: {
        type: 'number',
        description: 'ID do recurso a ser atualizado (obrigatorio)'
      },
      name: {
        type: 'string',
        description: 'Novo nome do recurso (maximo 255 caracteres). Opcional.'
      },
      equipment_type_id: {
        type: 'number',
        description: 'Novo tipo do recurso (ID — use list_equipment_types). Opcional.'
      },
      equipment_group_id: {
        type: 'number',
        description:
          'Novo grupo do recurso (ID — use list_equipment_groups com client_id do recurso; ' +
          'grupo deve pertencer ao mesmo cliente). Opcional.'
      },
      acquisition_date: {
        type: 'string',
        description: 'Nova data de aquisicao (formato YYYY-MM-DD). Opcional.'
      },
      warranty_date: {
        type: 'string',
        description: 'Nova data de fim de garantia (formato YYYY-MM-DD; deve ser >= acquisition_date). Opcional.'
      }
    },
    required: ['equipment_id']
  }
};

async function execute(args, { api }) {
  try {
    // ID validado estritamente (inteiro) antes de virar path na URL — nunca
    // interpolar argumento MCP cru em `/equipments/${id}`.
    const equipmentId = requireIntField(args, 'equipment_id');
    const body = {};

    if (args.name !== undefined) body.name = args.name;
    if (args.equipment_type_id !== undefined) body.equipment_type_id = args.equipment_type_id;
    if (args.equipment_group_id !== undefined) body.equipment_group_id = args.equipment_group_id;
    if (args.acquisition_date !== undefined) body.acquisition_date = args.acquisition_date;
    if (args.warranty_date !== undefined) body.warranty_date = args.warranty_date;

    const response = await api.updateEquipment(equipmentId, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar recurso #${args.equipment_id}**`,
        response,
        '*Verifique se o recurso existe, se o grupo pertence ao cliente do recurso, e suas permissoes.*'
      );
    }

    const eq = response.data || {};
    const updatedFields = Object.keys(body).join(', ') || 'nenhum campo alterado';
    return textResponse(
      `**✅ Recurso atualizado com sucesso!**\n\n` +
      `**ID:** ${eq.id || args.equipment_id}\n` +
      `**Nome:** ${eq.name || '—'}\n` +
      `**Campos atualizados:** ${updatedFields}\n` +
      `\n*✅ Recurso atualizado via API TiFlux.*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar recurso #${args.equipment_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

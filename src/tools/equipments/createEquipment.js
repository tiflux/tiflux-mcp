/**
 * Slice: create_equipment — cria um novo recurso/equipamento no TiFlux.
 *
 * Endpoint: POST /equipments (via api.createEquipment).
 * Obrigatorios: name, client_id, equipment_type_id.
 * Opcional: equipment_group_id (se omitido, a API associa ao primeiro grupo do cliente),
 *           acquisition_date, warranty_date (YYYY-MM-DD).
 *
 * Divergencia Swagger x dominio (confirmada durante /implement):
 *   - equipment_group_id: Swagger diz opcional; corpo real aceita omissao com fallback.
 *   - Formato do body: flat (sem wrapper), conforme Swagger.
 *
 * Permissoes necessarias: "Gerenciar recursos" + Licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField, requireIntField } = require('../_shared/validators');

const schema = {
  name: 'create_equipment',
  description:
    'Criar um novo recurso/equipamento no TiFlux. ' +
    'Obrigatorios: name (nome do recurso), client_id (ID do cliente), equipment_type_id (ID do tipo — use list_equipment_types para descobrir). ' +
    'Opcional: equipment_group_id (ID do grupo — use list_equipment_groups com client_id para descobrir; se omitido, a API associa ao primeiro grupo do cliente), ' +
    'acquisition_date e warranty_date (formato YYYY-MM-DD; warranty_date deve ser >= acquisition_date). ' +
    'Tipos e grupos sao configurados por organizacao — consulte list_equipment_types e list_equipment_groups antes de criar. ' +
    'Requer permissao "Gerenciar recursos" e Licenca Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do recurso (obrigatorio, maximo 255 caracteres)'
      },
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o recurso pertence (obrigatorio)'
      },
      equipment_type_id: {
        type: 'number',
        description: 'ID do tipo de recurso (obrigatorio — use list_equipment_types para descobrir os tipos disponiveis na organizacao)'
      },
      equipment_group_id: {
        type: 'number',
        description:
          'ID do grupo de recursos (opcional — use list_equipment_groups com client_id para descobrir; ' +
          'se omitido, a API associa automaticamente ao primeiro grupo do cliente)'
      },
      acquisition_date: {
        type: 'string',
        description: 'Data de aquisicao do recurso (opcional, formato YYYY-MM-DD)'
      },
      warranty_date: {
        type: 'string',
        description: 'Data de fim de garantia (opcional, formato YYYY-MM-DD; deve ser >= acquisition_date)'
      }
    },
    required: ['name', 'client_id', 'equipment_type_id']
  }
};

async function execute(args, { api }) {
  try {
    requireField(args, 'name');
    // client_id/equipment_type_id validados estritamente como inteiros (paridade com
    // update_equipment) — evita repassar string arbitraria verbatim no body do POST.
    const clientId = requireIntField(args, 'client_id');
    const equipmentTypeId = requireIntField(args, 'equipment_type_id');
    const body = {
      name: args.name,
      client_id: clientId,
      equipment_type_id: equipmentTypeId
    };

    if (args.equipment_group_id !== undefined) body.equipment_group_id = args.equipment_group_id;
    if (args.acquisition_date !== undefined) body.acquisition_date = args.acquisition_date;
    if (args.warranty_date !== undefined) body.warranty_date = args.warranty_date;

    const response = await api.createEquipment(body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar recurso "${args.name}"**`,
        response,
        '*Verifique os dados informados (client_id, equipment_type_id, equipment_group_id) e suas permissoes.*'
      );
    }

    const eq = response.data || {};
    return textResponse(
      `**✅ Recurso criado com sucesso!**\n\n` +
      `**ID:** ${eq.id}\n` +
      `**Nome:** ${eq.name || args.name}\n` +
      `**Cliente:** ${eq.client?.name || args.client_id}\n` +
      `**Tipo:** ${eq.equipment_type?.name || args.equipment_type_id}\n` +
      (eq.equipment_group ? `**Grupo:** ${eq.equipment_group.name}\n` : '') +
      `\n*✅ Recurso criado via API TiFlux. Use o ID ${eq.id} para atualizacoes.*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao criar recurso "${args.name}"**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };

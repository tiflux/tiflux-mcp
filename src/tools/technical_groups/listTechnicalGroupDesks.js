/**
 * Slice: list_technical_group_desks — mesas relacionadas a um grupo de atendentes.
 *
 * Endpoint: GET /technical-groups/{id}/desks (via api.listTechnicalGroupDesks).
 *
 * Campos (shape inferido do `example` da Swagger — endpoint sem schema formal):
 * id, name, display_name, active, appointment_type.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { row } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');
const { TECHNICAL_GROUP, groupIdSchemaProperty, createGroupSubresourceList } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_technical_group_desks',
  description: 'Listar as mesas (desks) relacionadas a um grupo de atendentes. Informe technical_group_id (obtido via list_technical_groups). Retorna id, nome, nome de exibicao, se a mesa esta ativa e o tipo de apontamento. Requer permissao "Gerenciar mesas de servicos".',
  inputSchema: {
    type: 'object',
    properties: {
      ...groupIdSchemaProperty(TECHNICAL_GROUP),
      ...paginationSchemaProperties()
    },
    required: ['technical_group_id']
  }
};

function renderItem(verbosity) {
  return (desk) => {
    const id = desk.id ?? '—';
    const name = desk.name || '—';
    const active = desk.active ? 'Sim' : 'Nao';
    if (verbosity === 'compact') return `${row([id, name, active])}\n`;
    const displayName = desk.display_name || name;
    const appointmentType = desk.appointment_type || '—';
    return `**${escapeCell(displayName)}** (#${id})\n- Nome interno: ${escapeCell(name)}\n- Ativa: ${active}\n- Tipo de apontamento: ${appointmentType}\n\n`;
  };
}

const execute = createGroupSubresourceList({
  kind: TECHNICAL_GROUP,
  apiMethod: 'listTechnicalGroupDesks',
  action: 'listar mesas',
  itemsLabel: 'Mesas',
  emptyMessage: (id) => `**Nenhuma mesa encontrada para o grupo de atendentes #${id}**`,
  unit: 'mesas',
  renderItem
});

module.exports = { name: schema.name, schema, execute };

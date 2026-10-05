/**
 * Slice: list_technical_group_clients — clientes relacionados a um grupo de atendentes.
 *
 * Endpoint: GET /technical-groups/{id}/clients (via api.listTechnicalGroupClients).
 *
 * Campos (shape inferido do `example` da Swagger — endpoint sem schema formal):
 * id, name, social, social_revenue (CNPJ), status.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { row } = require('../_shared/format');
const { escapeCell } = require('../_shared/markdown');
const { TECHNICAL_GROUP, groupIdSchemaProperty, createGroupSubresourceList } = require('../_shared/organizationGroups');

const schema = {
  name: 'list_technical_group_clients',
  description: 'Listar os clientes relacionados a um grupo de atendentes. Informe technical_group_id (obtido via list_technical_groups). Retorna id, nome, razao social, CNPJ (social_revenue) e status (ativo/inativo). Requer permissao "Gerenciar mesas de servicos".',
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
  return (client) => {
    const id = client.id ?? '—';
    const name = client.name || '—';
    const status = client.status ? 'Ativo' : 'Inativo';
    if (verbosity === 'compact') return `${row([id, name, status])}\n`;
    const social = client.social ? escapeCell(client.social) : '—';
    const cnpj = client.social_revenue ? escapeCell(client.social_revenue) : '—';
    return `**${escapeCell(name)}** (#${id})\n- Razao social: ${social}\n- CNPJ: ${cnpj}\n- Status: ${status}\n\n`;
  };
}

const execute = createGroupSubresourceList({
  kind: TECHNICAL_GROUP,
  apiMethod: 'listTechnicalGroupClients',
  action: 'listar clientes',
  itemsLabel: 'Clientes',
  emptyMessage: (id) => `**Nenhum cliente encontrado para o grupo de atendentes #${id}**`,
  unit: 'clientes',
  renderItem
});

module.exports = { name: schema.name, schema, execute };

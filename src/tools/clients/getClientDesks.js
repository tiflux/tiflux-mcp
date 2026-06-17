/**
 * Slice: get_client_desks — lista mesas relacionadas a um cliente.
 *
 * Endpoint: GET /clients/{id}/desks (via api.getClientDesks).
 */

const { listClientSubresource } = require('../_shared/clientShared');

const schema = {
  name: 'get_client_desks',
  description: 'Listar as mesas (desks) vinculadas a um cliente no TiFlux. Retorna paginado.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      offset: {
        type: 'number',
        description: 'Número da página (padrão: 1)'
      },
      limit: {
        type: 'number',
        description: 'Mesas por página (padrão: 20, máximo: 200)'
      }
    },
    required: ['client_id']
  }
};

function renderDesk(desk, index) {
  let text = `**${index + 1}. ${desk.display_name || desk.name || 'N/A'}**\n`;
  text += `   • **ID:** ${desk.id}\n`;
  if (desk.name && desk.name !== desk.display_name) {
    text += `   • **Nome interno:** ${desk.name}\n`;
  }
  text += `   • **Ativa:** ${desk.active ? 'Sim' : 'Não'}\n`;
  return text + '\n';
}

function execute(args, ctx) {
  return listClientSubresource(args, ctx, {
    fetch: (api, clientId, options) => api.getClientDesks(clientId, options),
    title: 'Mesas',
    pluralLower: 'mesas',
    foundWord: 'encontradas',
    emptyTitle: 'Nenhuma mesa vinculada',
    emptyHint: 'Este cliente não possui mesas vinculadas ou a lista está vazia nesta página.',
    renderItem: renderDesk
  });
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: list_client_contacts — lista contatos de um cliente.
 *
 * Endpoint: GET /clients/{client_id}/contacts (via api.getClientContacts).
 * Reusa listClientSubresource; clampagem de limit no slice (BL-008).
 * Nota: a API retorna o telefone no campo `telephone` (e recebe no campo `number`).
 */

const { listClientSubresource } = require('../_shared/clientShared');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_client_contacts',
  description: 'Listar os contatos (telefone/e-mail) cadastrados de um cliente no TiFlux. Retorna lista paginada com responsável, uso, telefone e e-mail.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      ...paginationSchemaProperties()
    },
    required: ['client_id']
  }
};

function renderContact(contact, index) {
  let text = `**${index + 1}. Contato #${contact.id}**\n`;
  text += `   • **Responsável:** ${contact.owner || '—'}\n`;
  text += `   • **Uso:** ${contact.use || '—'}\n`;
  text += `   • **Telefone:** ${contact.telephone || '—'}\n`;
  text += `   • **E-mail:** ${contact.email || '—'}\n`;
  return text + '\n';
}

function execute(args, ctx) {
  // BL-008: clamp antes de passar ao helper (currentLimit usa options.limit para paginacao)
  const effectiveLimit = Math.min(200, Math.max(1, parseInt(args.limit) || 20));
  const effectiveOffset = Math.max(1, parseInt(args.offset) || 1);
  return listClientSubresource(
    { ...args, limit: effectiveLimit, offset: effectiveOffset },
    ctx,
    {
      fetch: (api, clientId, options) => api.getClientContacts(clientId, options),
      title: 'Contatos',
      pluralLower: 'contatos',
      foundWord: 'encontrados',
      emptyTitle: 'Nenhum contato cadastrado',
      emptyHint: 'Este cliente não possui contatos cadastrados ou a lista está vazia nesta página.',
      renderItem: renderContact
    }
  );
}

module.exports = { name: schema.name, schema, execute };

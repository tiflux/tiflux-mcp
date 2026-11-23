/**
 * Slice: get_client_technical_groups — lista grupos técnicos relacionados a um cliente.
 *
 * Endpoint: GET /clients/{id}/technical-groups (via api.getClientTechnicalGroups).
 */

const { listClientSubresource } = require('../_shared/clientShared');
const { withValidationResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'get_client_technical_groups',
  description: 'Listar os grupos técnicos vinculados a um cliente no TiFlux. Retorna paginado.',
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

function renderGroup(group, index) {
  let text = `**${index + 1}. ${group.name || 'N/A'}**\n`;
  text += `   • **ID:** ${group.id}\n`;
  if (group.description) {
    text += `   • **Descrição:** ${group.description}\n`;
  }
  if (group.active !== undefined) {
    text += `   • **Ativo:** ${group.active ? 'Sim' : 'Não'}\n`;
  }
  return text + '\n';
}

function execute(args, ctx) {
  return listClientSubresource(args, ctx, {
    fetch: (api, clientId, options) => api.getClientTechnicalGroups(clientId, options),
    title: 'Grupos Técnicos',
    pluralLower: 'grupos técnicos',
    foundWord: 'encontrados',
    emptyTitle: 'Nenhum grupo técnico vinculado',
    emptyHint: 'Este cliente não possui grupos técnicos vinculados ou a lista está vazia nesta página.',
    renderItem: renderGroup
  });
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar grupos técnicos do cliente', execute) };

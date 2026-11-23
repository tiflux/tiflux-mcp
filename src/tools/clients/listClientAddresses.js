/**
 * Slice: list_client_addresses — lista endereços de um cliente.
 *
 * Endpoint: GET /clients/{client_id}/addresses (via api.getClientAddresses).
 * Reusa listClientSubresource; clampagem de limit no slice (BL-008).
 */

const { listClientSubresource } = require('../_shared/clientShared');
const { withValidationResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_client_addresses',
  description: 'Listar os endereços cadastrados de um cliente no TiFlux. Retorna lista paginada com rua, número, bairro, cidade, estado e CEP.',
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

function renderAddress(address, index) {
  let text = `**${index + 1}. Endereço #${address.id}**\n`;
  text += `   • **Logradouro:** ${address.street || '—'}, ${address.number != null ? address.number : '—'}\n`;
  if (address.complement) {
    text += `   • **Complemento:** ${address.complement}\n`;
  }
  text += `   • **Bairro:** ${address.neighborhood || '—'}\n`;
  text += `   • **Cidade/Estado:** ${address.city || '—'} / ${address.state || '—'}\n`;
  text += `   • **CEP:** ${address.cep || '—'}\n`;
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
      fetch: (api, clientId, options) => api.getClientAddresses(clientId, options),
      title: 'Endereços',
      pluralLower: 'endereços',
      foundWord: 'encontrados',
      emptyTitle: 'Nenhum endereço cadastrado',
      emptyHint: 'Este cliente não possui endereços cadastrados ou a lista está vazia nesta página.',
      renderItem: renderAddress
    }
  );
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar endereços do cliente', execute) };

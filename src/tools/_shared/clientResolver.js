/**
 * clientResolver.js — Helper compartilhado para resolucao client_name -> client_id.
 *
 * Encapsula a logica de busca de cliente por nome, seguindo o padrao de deskResolver.js.
 * Usa api.searchClients() para busca server-side por substring.
 *
 * Retorno:
 *   { error: false, clientId: number, client: object }  — 1 cliente encontrado
 *   { error: true,  response: MCPResponse }              — 0, N ou erro de API
 *
 * O shape de `response` e identico ao que textResponse() produz, entao os
 * slices podem simplesmente fazer:
 *
 *   const resolved = await resolveClientName(api, client_name);
 *   if (resolved.error) return resolved.response;
 *   finalClientId = resolved.clientId;
 */

const { textResponse } = require('./response');

/**
 * Resolve um nome de cliente para client_id usando searchClients.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} clientName - nome (parcial ou exato) do cliente
 * @returns {Promise<{error: boolean, clientId?: number, client?: object, response?: object}>}
 */
async function resolveClientName(api, clientName) {
  const clientSearchResponse = await api.searchClients(clientName);

  if (clientSearchResponse.error) {
    return {
      error: true,
      response: textResponse(
        `**❌ Erro ao buscar cliente "${clientName}"**\n\n` +
        `**Erro:** ${clientSearchResponse.error}\n\n` +
        `*Verifique se o nome do cliente está correto ou use client_id diretamente.*`
      )
    };
  }

  const clients = clientSearchResponse.data || [];

  if (clients.length === 0) {
    return {
      error: true,
      response: textResponse(
        `**❌ Cliente "${clientName}" não encontrado**\n\n` +
        `*Verifique se o nome está correto ou use client_id diretamente.*`
      )
    };
  }

  if (clients.length > 1) {
    let clientsList = '**Clientes encontrados:**\n';
    clients.forEach((client, index) => {
      clientsList += `${index + 1}. **ID:** ${client.id} | **Nome:** ${client.name}\n`;
    });

    return {
      error: true,
      response: textResponse(
        `**⚠️ Múltiplos clientes encontrados para "${clientName}"**\n\n` +
        `${clientsList}\n` +
        `*Use client_id específico ou seja mais específico no client_name.*`
      )
    };
  }

  return {
    error: false,
    clientId: clients[0].id,
    client: clients[0]
  };
}

module.exports = { resolveClientName };

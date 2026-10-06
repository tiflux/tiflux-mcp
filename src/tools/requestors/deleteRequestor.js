/**
 * Slice: delete_requestor — exclui um solicitante de um cliente.
 *
 * Endpoint: DELETE /clients/{client_id}/requestors/{id} (via api.deleteRequestor).
 * A Swagger nao documenta a resposta 2xx; o transporte normaliza 204/corpo nulo
 * para `{ data: null, status: 204 }`.
 *
 * Pre-flight best-effort: GET /clients/{client_id}/requestors/{id} so para ecoar o nome
 * na confirmacao. Falha do pre-flight NAO bloqueia o DELETE (a API decide).
 *
 * Observado em 2026-10-06 (base de teste): 204 sem corpo; o solicitante some das listagens, mas
 * GET /clients/{c}/requestors/{id} ainda o devolve e um 2o DELETE responde 204 de novo (soft delete).
 *
 * Erros: 404 (40401) solicitante inexistente ou de outro cliente;
 * 403 (40301) sem a permissao "Gerenciar clientes e grupos de recursos".
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');

const schema = {
  name: 'delete_requestor',
  description:
    'Excluir um solicitante de um cliente. ATENÇÃO: ação irreversível pela API — o solicitante não pode ser ' +
    'restaurado pelo MCP. O solicitante precisa pertencer ao client_id informado (use list_requestors ou ' +
    'search_requestor para obter os IDs). Requer a permissão "Gerenciar clientes e grupos de recursos".',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: { type: 'number', description: 'ID do cliente ao qual o solicitante pertence (obrigatório)' },
      requestor_id: { type: 'number', description: 'ID do solicitante a ser excluído (obrigatório)' }
    },
    required: ['client_id', 'requestor_id']
  }
};

async function fetchRequestorName(api, clientId, requestorId) {
  try {
    const res = await api.getRequestor(clientId, requestorId);
    if (!res.error && res.data && typeof res.data.name === 'string' && res.data.name.trim() !== '') {
      return res.data.name.trim();
    }
  } catch {
    // silencioso: pre-flight e informativo apenas
  }
  return null;
}

function failure(clientId, requestorId, response) {
  const code = extractApiErrorCode(response);
  const codeSuffix = code ? ' (erro ' + code + ')' : '';
  if (response.status === 404 || code === 40401) {
    return errorResponse(
      `**❌ Solicitante #${requestorId} não encontrado no cliente #${clientId}**\n\n` +
      `**Código:** ${response.status}${codeSuffix}\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*O solicitante não existe ou não pertence a este cliente. Confira os IDs com list_requestors.*`
    );
  }
  if (response.status === 403) {
    return errorResponse(
      `**❌ Sem permissão para excluir o solicitante #${requestorId}**\n\n` +
      `**Código:** 403${codeSuffix}\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*É necessária a permissão "Gerenciar clientes e grupos de recursos".*`
    );
  }
  return apiFailureResponse(
    `**❌ Erro ao excluir o solicitante #${requestorId} do cliente #${clientId}**`,
    response,
    '*Verifique se o cliente e o solicitante existem e se você tem permissão.*'
  );
}

function requirePositiveId(args, field) {
  const id = requireIntField(args, field);
  // 0 passa no parseIntStrict mas nunca e um ID valido: evita um DELETE /clients/0/... inutil.
  if (id <= 0) throw new Error(`${field} deve ser um número inteiro positivo`);
  return id;
}

async function execute(args, { api }) {
  const client_id = requirePositiveId(args, 'client_id');
  const requestor_id = requirePositiveId(args, 'requestor_id');

  try {
    const name = await fetchRequestorName(api, client_id, requestor_id);
    const response = await api.deleteRequestor(client_id, requestor_id);

    if (response.error) return failure(client_id, requestor_id, response);

    const label = name ? `Solicitante #${requestor_id} (${name})` : `Solicitante #${requestor_id}`;
    return textResponse(
      `**✅ ${label} removido com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n\n` +
      `*A exclusão não pode ser desfeita pela API.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao excluir o solicitante #${requestor_id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };

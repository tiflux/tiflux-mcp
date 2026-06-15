/**
 * Slice: archive_chat — finaliza (encerra) um chat.
 *
 * Endpoint: PUT /chats/{id}/archive (via api.archiveChat).
 * Aceita services_catalogs_item_id, obrigatório apenas quando a org usa
 * "Usar catálogo de serviços no chat" (a API retorna 422 sem ele nesse caso).
 * Sucesso: 202 (Accepted) — tratado como sucesso.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireIntField, parseIntStrict } = require('../_shared/validators');
const { chatWriteApiError } = require('./chatWriteErrors');

const schema = {
  name: 'archive_chat',
  description: `Finalizar (encerrar) um chat no TiFlux.

**services_catalogs_item_id (condicional):** obrigatorio APENAS se a configuracao da organizacao for "Usar catalogo de servicos no chat" — nesse caso a API retorna 422 sem ele. Nao ha busca por nome (a busca de itens de catalogo exige desk_id, que o chat nao fornece); informe o ID diretamente quando necessario.

A API responde 202 (Accepted) — o encerramento pode ser processado de forma assincrona.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID numérico do chat a finalizar (aceita também string numérica — o handler faz parseInt)'
      },
      services_catalogs_item_id: {
        type: 'number',
        description: 'ID do item de catálogo de serviços. Condicional: obrigatório apenas quando a org usa "Usar catálogo de serviços no chat" (senão a API retorna 422).'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  const id = requireIntField(args, 'id');
  const { services_catalogs_item_id } = args;

  // Coerção estrita do ID opcional antes de montar o body (M1).
  const parsedCatalogItemId = services_catalogs_item_id !== undefined
    ? parseIntStrict(services_catalogs_item_id, 'services_catalogs_item_id')
    : undefined;

  try {
    const body = {};
    if (parsedCatalogItemId !== undefined) {
      body.services_catalogs_item_id = parsedCatalogItemId;
    }

    const response = await api.archiveChat(id, body);

    if (response.error) {
      return chatWriteApiError(response, {
        label: 'finalizar chat',
        id,
        notFoundHint: 'Verifique se o ID está correto e se você tem acesso a este chat.',
        validationHint: 'Sua organização pode estar configurada para "Usar catálogo de serviços no chat" — nesse caso informe services_catalogs_item_id.'
      });
    }

    let detailsText = '';
    if (parsedCatalogItemId !== undefined) {
      detailsText = `**Item de catálogo:** ID ${parsedCatalogItemId}\n`;
    }

    // 202 Accepted: a API ACEITOU a solicitação; o encerramento pode ser
    // processado de forma assíncrona — não afirmamos finalização definitiva
    // nem timestamp local de conclusão (B1/B2/M2).
    return textResponse(
      `**✅ Chat #${id} — encerramento solicitado (202 Accepted)**\n\n` +
      `${detailsText}` +
      `*A API aceitou a solicitação; o encerramento pode ser processado de forma assíncrona.*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao finalizar chat #${id}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

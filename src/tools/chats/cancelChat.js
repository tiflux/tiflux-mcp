/**
 * Slice: cancel_chat — cancela (descarta) um chat.
 *
 * Endpoint: PUT /chats/{id}/cancel (via api.cancelChat), sem body.
 * Sucesso: 202 `{ status: "enqueued", job_id }` — o cancelamento é processado de
 * forma assíncrona; a API não devolve o status final (ele aparece em get_chat).
 * Diferente de archive_chat: não exige ticket vinculado, item de catálogo nem
 * atendente online.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireIntField, ValidationError } = require('../_shared/validators');
const { chatWriteApiError } = require('./chatWriteErrors');

const schema = {
  name: 'cancel_chat',
  description: `Cancelar (descartar) um chat no TiFlux.

**Cancelar x finalizar:** cancelar descarta o atendimento e NAO exige ticket vinculado, item de catalogo nem atendente online. Finalizar (\`archive_chat\`) encerra o atendimento seguindo as regras da organizacao (ticket, catalogo). Na duvida entre os dois, use \`archive_chat\`.

**So cancele quando o usuario pedir explicitamente.** O cancelamento NAO pode ser desfeito pela API.

Aceita chats ainda ativos (fila, inbox, em atendimento); chat ja cancelado ou ja finalizado retorna erro. Exige as permissoes "Acessar o chat" e "Cancelar chat" (sem bypass de administrador) e que o grupo de atendentes do usuario esteja ligado ao departamento do chat.

A API responde 202 (Accepted) com um job_id — o cancelamento e processado de forma assincrona; confira o resultado com \`get_chat\`.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID numérico do chat a cancelar (aceita também string numérica)'
      }
    },
    required: ['id']
  }
};

// O transporte retenta em timeout/erro de rede (inclusive PUT): se o 1o PUT chegou e
// so a resposta se perdeu, o retry recebe 422 "already been canceled". Por isso a dica
// nao afirma que outra pessoa cancelou — o efeito pedido (chat cancelado) esta garantido.
const ALREADY_CANCELED_HINT =
  'O chat já está cancelado — pode ter sido um cancelamento anterior ou esta mesma solicitação ' +
  '(reenvio automático após timeout). Em ambos os casos o chat está cancelado; confira com `get_chat`.';

const FORBIDDEN_HINT =
  'Cancelar exige as permissões "Acessar o chat" e "Cancelar chat" no seu grupo de permissões ' +
  '(não há bypass de administrador), e o seu grupo de atendentes precisa estar ligado ao ' +
  'departamento do chat. Chat de outra organização também retorna 403.';

async function execute(args, { api }) {
  const id = requireIntField(args, 'id');
  // Escrita irreversível: id 0 nunca é chat válido — barra antes do request.
  if (id <= 0) throw new ValidationError('id deve ser um inteiro positivo');

  try {
    const response = await api.cancelChat(id);

    if (response.error) {
      return chatWriteApiError(response, {
        label: 'cancelar chat',
        id,
        notFoundHint: 'Verifique se o ID está correto.',
        validationHint: 'Verifique se o ID do chat é um inteiro positivo.',
        forbiddenHint: FORBIDDEN_HINT,
        alreadyCanceledHint: ALREADY_CANCELED_HINT
      });
    }

    const jobId = response.data?.job_id;
    const jobLine = jobId ? `**Job:** ${jobId}\n` : '';

    return textResponse(
      `**✅ Cancelamento do chat #${id} enfileirado (202 Accepted)**\n\n` +
      `${jobLine}\n` +
      `*O cancelamento é processado de forma assíncrona — a API não devolve o status final. ` +
      `Confira o resultado com \`get_chat\`.*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao cancelar chat #${id}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

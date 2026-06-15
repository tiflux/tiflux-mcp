/**
 * Slice: update_chat — atualiza um chat existente.
 *
 * Endpoint: PUT /chats/{id} (via api.updateChat).
 * Transfere atendente (user_id), departamento (department_id) e/ou vincula ticket (ticket_number).
 * Resolve user_name via api.searchUsers (user_id tem precedência, multi-match inline).
 * Envia apenas campos informados; se nenhum campo informado, retorna aviso sem chamar a API.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireIntField, parseIntStrict } = require('../_shared/validators');
const { chatWriteApiError } = require('./chatWriteErrors');

const schema = {
  name: 'update_chat',
  description: `Atualizar um chat existente no TiFlux: transferir atendente (user_id), transferir departamento (department_id) e/ou vincular a um ticket (ticket_number).

So e possivel atualizar um chat que NAO esteja cancelado ou encerrado.

**user_name (conveniencia):** resolve o atendente por nome via busca de usuarios; user_id tem precedencia. **Caveat (BL-007):** GET /users retorna 403 para contas nao-admin — a resolucao por nome so funciona com API key de admin; nesse caso use user_id diretamente.

**Sem department_name / catalog_item_name:** a API v2 nao expoe busca de departamento; informe department_id diretamente.

Informe pelo menos um de: user_id, user_name, department_id, ticket_number.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID numérico do chat a atualizar (aceita também string numérica — o handler faz parseInt)'
      },
      user_id: {
        type: 'number',
        description: 'ID do atendente para o qual o chat será transferido (opcional)'
      },
      user_name: {
        type: 'string',
        description: 'Nome do atendente para busca automática (alternativa ao user_id; user_id tem precedência). Caveat BL-007: requer API key admin (GET /users retorna 403 para não-admin).'
      },
      department_id: {
        type: 'number',
        description: 'ID do departamento para o qual o chat será transferido (opcional). Não há busca por nome na API v2.'
      },
      ticket_number: {
        type: 'number',
        description: 'Número do ticket a vincular ao chat (opcional)'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  const id = requireIntField(args, 'id');
  const { user_id, user_name, department_id, ticket_number } = args;

  // Coerção estrita dos IDs opcionais ANTES de montar o body: input inválido
  // (ex.: "abc") vira erro claro em vez de NaN -> null no JSON (M1).
  const parsedUserId = user_id !== undefined ? parseIntStrict(user_id, 'user_id') : undefined;
  const parsedDepartmentId = department_id !== undefined ? parseIntStrict(department_id, 'department_id') : undefined;
  const parsedTicketNumber = ticket_number !== undefined ? parseIntStrict(ticket_number, 'ticket_number') : undefined;

  try {
    let finalUserId = parsedUserId;

    // Resolve user_name -> user_id (user_id tem precedência)
    if (user_name && parsedUserId === undefined) {
      const userSearchResponse = await api.searchUsers({
        name: user_name,
        active: true,
        type: 'attendant',
        limit: 10
      });

      if (userSearchResponse.error) {
        return errorResponse(
          `**Erro ao buscar usuário "${user_name}"**\n\n` +
          `**Erro:** ${userSearchResponse.error}\n\n` +
          `*Verifique se o nome está correto ou use user_id diretamente. Resolução por nome requer API key admin (BL-007).*`
        );
      }

      const users = userSearchResponse.data || [];
      if (users.length === 0) {
        return errorResponse(
          `**Usuário "${user_name}" não encontrado**\n\n` +
          `*Verifique se o nome está correto ou use user_id diretamente.*`
        );
      }

      if (users.length > 1) {
        let usersList = '**Usuários encontrados:**\n';
        users.forEach((user, index) => {
          usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
        });

        return errorResponse(
          `**Múltiplos usuários encontrados para "${user_name}"**\n\n` +
          `${usersList}\n` +
          `*Use user_id específico ou seja mais específico no user_name.*`
        );
      }

      finalUserId = users[0].id;
    }

    // Monta o body apenas com os campos informados (já coeridos para inteiro)
    const chatData = {};
    if (finalUserId !== undefined) chatData.user_id = finalUserId;
    if (parsedDepartmentId !== undefined) chatData.department_id = parsedDepartmentId;
    if (parsedTicketNumber !== undefined) chatData.ticket_number = parsedTicketNumber;

    if (Object.keys(chatData).length === 0) {
      return errorResponse(
        `**⚠️ Nenhum campo informado para atualização**\n\n` +
        `**Chat ID:** ${id}\n\n` +
        `*Informe pelo menos um campo: user_id, user_name, department_id ou ticket_number.*`
      );
    }

    const response = await api.updateChat(id, chatData);

    if (response.error) {
      return chatWriteApiError(response, {
        label: 'atualizar chat',
        id,
        notFoundHint: 'Verifique se o ID está correto e se o chat não está cancelado ou encerrado.',
        validationHint: 'Verifique os IDs informados (user_id/department_id/ticket_number) e se o chat está ativo.'
      });
    }

    let changesText = '**Alterações realizadas:**\n';
    if (chatData.user_id !== undefined) changesText += `• Atendente transferido: ID ${chatData.user_id}\n`;
    if (chatData.department_id !== undefined) changesText += `• Departamento transferido: ID ${chatData.department_id}\n`;
    if (chatData.ticket_number !== undefined) changesText += `• Ticket vinculado: #${chatData.ticket_number}\n`;

    // updated_at vem do servidor quando disponível; não inventamos timestamp local.
    const updatedAt = response.data && response.data.updated_at;
    const updatedLine = updatedAt ? `**Atualizado em:** ${updatedAt}\n\n` : '';

    return textResponse(
      `**✅ Chat #${id} atualizado com sucesso!**\n\n` +
      `${changesText}\n` +
      `${updatedLine}` +
      `*✅ Chat atualizado via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar chat #${id}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

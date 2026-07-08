/**
 * Slice: get_user — exibe detalhes completos de um usuário/agente pelo ID (admin-only).
 *
 * Endpoint: GET /users/{id} (via api.getUser).
 * Obrigatório: id.
 * Requer permissão de administrador — 403 retorna mensagem clara.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { footer } = require('../_shared/format');

const schema = {
  name: 'get_user',
  description: 'Exibir detalhes completos de um usuário/agente no TiFlux pelo ID (requer permissão de administrador). Retorna id, name, email, tipo, status ativo, grupo técnico, telefone, ramal, clientes vinculados, último login e configurações de autenticação.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do usuário a ser exibido (obrigatório)'
      }
    },
    required: ['id']
  }
};

function formatUser(user, verbosity) {
  let text = `**Usuário: ${user.name || 'N/A'}**\n\n`;
  text += `**ID:** ${user.id}\n`;
  text += `**Email:** ${user.email || 'N/A'}\n`;
  text += `**Tipo:** ${user._type || 'N/A'}\n`;
  text += `**Ativo:** ${user.active ? 'Sim' : 'Não'}\n`;

  if (user.technical_group_id != null) {
    text += `**Grupo Técnico (ID):** ${user.technical_group_id}\n`;
  }

  if (user.telephone) text += `**Telefone:** ${user.telephone}\n`;
  if (user.extension) text += `**Ramal:** ${user.extension}\n`;

  if (user.client_ids && Array.isArray(user.client_ids) && user.client_ids.length > 0) {
    text += `**Clientes vinculados:** ${user.client_ids.join(', ')}\n`;
  }

  if (user.last_login_at) text += `**Último login:** ${user.last_login_at}\n`;

  text += `**Google Auth:** ${user.gauth_enabled ? 'Habilitado' : 'Desabilitado'}\n`;

  if (user.signature) {
    text += `\n**Assinatura:** ${user.signature}\n`;
  }

  text += `\n${footer(verbosity)}`;
  return text;
}

async function execute(args, { api, verbosity }) {
  const id = requireIntField(args, 'id');

  try {
    const response = await api.getUser(id);

    if (response.error) {
      const is403 = response.status === 403;
      const is404 = response.status === 404;
      return apiFailureResponse(
        `**❌ Erro ao buscar usuário #${id}**`,
        response,
        is403
          ? '*Esta operação requer permissão de administrador.*'
          : is404
            ? '*Verifique se o usuário existe e se o ID está correto.*'
            : '*Verifique suas permissões e os dados informados.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar usuário #${id}**\n\n` +
        `A API retornou sucesso mas sem os dados do usuário.\n\n` +
        `*Verifique se o usuário #${id} existe.*`
      );
    }

    return textResponse(formatUser(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar usuário #${id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatUser };

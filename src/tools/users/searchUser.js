/**
 * Slice: search_user — busca usuarios no TiFlux por nome.
 *
 * Endpoint: GET /users (via api.searchUsers).
 * Uso tipico: resolver responsible_id para tickets.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'search_user',
  description: 'Buscar usuarios no TiFlux por nome para usar como responsavel em tickets',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do usuario a ser buscado (busca parcial)'
      },
      type: {
        type: 'string',
        description: 'Tipo de usuario (client, attendant, admin)',
        enum: ['client', 'attendant', 'admin']
      },
      active: {
        type: 'boolean',
        description: 'Filtrar usuarios ativos (true) ou inativos (false)'
      },
      limit: {
        type: 'number',
        description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
      },
      offset: {
        type: 'number',
        description: 'Numero da pagina (padrao: 1)'
      }
    },
    required: ['name']
  }
};

function formatUsersList(name, users) {
  let text = `**Busca por "${name}"**\n\n` +
             `**Resultados encontrados:** ${users.length}\n\n`;

  text += '**Usuarios encontrados:**\n';
  users.forEach((user, index) => {
    const userType = user._type === 'admin' ? 'Administrador' :
                     user._type === 'attendant' ? 'Atendente' :
                     'Cliente';
    const activeStatus = user.active ? 'Ativo' : 'Inativo';

    text += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email} | **Tipo:** ${userType} | **Status:** ${activeStatus}\n`;
  });

  text += '\n*Para criar ou atualizar um ticket com responsavel, use o ID do usuario desejado no parametro `responsible_id`.*';
  return text;
}

async function execute(args, { api }) {
  const { name, type, active, limit, offset } = args;

  requireField(args, 'name');

  try {
    const filters = {
      name,
      limit: limit || 20,
      offset: offset || 1
    };

    if (type !== undefined) filters.type = type;
    if (active !== undefined) filters.active = active;

    const response = await api.searchUsers(filters);

    if (response.error) {
      return textResponse(
        `**Erro ao buscar usuario "${name}"**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o nome esta correto e se voce tem permissao para acessar os dados de usuarios.*`
      );
    }

    const users = response.data || [];

    if (users.length === 0) {
      return textResponse(
        `**Busca por "${name}"**\n\n` +
        `**Resultado:** Nenhum usuario encontrado\n\n` +
        `*Tente usar um termo de busca diferente ou verifique a grafia.*`
      );
    }

    return textResponse(formatUsersList(name, users));
  } catch (error) {
    return textResponse(
      `**Erro interno ao buscar usuario "${name}"**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatUsersList };

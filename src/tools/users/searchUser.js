/**
 * Slice: search_user — busca usuarios no TiFlux por nome.
 *
 * Endpoint: GET /users (via api.smartSearchUsers).
 * Para usuarios admin: usa GET /users diretamente (caminho rapido).
 * Para usuarios nao-admin (403 em /users): aciona fallback automatico via
 * GET /technical-groups/{id}/users, com dedup e fuzzy match por nome.
 * Uso tipico: resolver responsible_id para tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'search_user',
  description: 'Buscar usuarios no TiFlux por nome para usar como responsavel em tickets. Para usuarios admin: busca via GET /users (rapido). Para usuarios nao-admin: aciona fallback automatico via grupos de atendimento (GET /technical-groups) — nao requer permissao admin.',
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

    const response = await api.smartSearchUsers(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao buscar usuario "${name}"**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o nome esta correto e se voce tem permissao para acessar os dados de usuarios (tentado via GET /users e via grupos de atendimento).*`
      );
    }

    const users = response.data || [];
    const fallbackNote = response._fallback === 'technical-groups'
      ? '\n\n*Nota: resultado obtido via grupos de atendimento (fallback para usuarios nao-admin).*'
      : '';
    const truncatedNote = response._truncated
      ? '\n\n*Aviso: a busca foi limitada a um subconjunto de grupos. Para busca completa, use responsible_id diretamente.*'
      : '';

    if (users.length === 0) {
      return textResponse(
        `**Busca por "${name}"**\n\n` +
        `**Resultado:** Nenhum usuario encontrado\n\n` +
        `*Tente usar um termo de busca diferente ou verifique a grafia.*` +
        fallbackNote + truncatedNote
      );
    }

    const resultText = formatUsersList(name, users) + fallbackNote + truncatedNote;
    return textResponse(resultText);
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar usuario "${name}"**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatUsersList };

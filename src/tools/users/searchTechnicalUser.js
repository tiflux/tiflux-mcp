/**
 * Slice: search_technical_user — busca atendentes tecnicos no TiFlux.
 *
 * Endpoint: GET /technical-users (via api.searchTechnicalUsers).
 * Nao exige permissao de gerenciamento de usuarios — funciona para admin e
 * atendente comum (exige apenas licenca de tickets ativa).
 * Uso tipico: descobrir responsible_id antes de criar/atualizar um ticket.
 *
 * Filtros server-side: name, email, desk_id, client_id, limit, offset.
 * Resposta: array plano de { id, email, name }.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');

const schema = {
  name: 'search_technical_user',
  description: 'Buscar atendentes tecnicos no TiFlux por nome, email, mesa ou cliente para usar como responsavel em tickets. Funciona para admin e atendente nao-admin (nao requer permissao de gerenciamento de usuarios — usa GET /technical-users). Use o ID retornado no campo responsible_id ao criar ou atualizar um ticket.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do atendente a ser buscado (busca parcial case-insensitive)'
      },
      email: {
        type: 'string',
        description: 'Email do atendente (busca parcial case-insensitive)'
      },
      desk_id: {
        type: 'number',
        description: 'ID da mesa para filtrar atendentes que atendem nessa mesa (opcional)'
      },
      client_id: {
        type: 'number',
        description: 'ID do cliente para filtrar atendentes que atendem esse cliente (opcional)'
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
    required: []
  }
};

/**
 * Formata lista de atendentes no modo compact (1 linha por atendente).
 */
function formatCompact(users) {
  let text = `Atendentes tecnicos (${users.length}):\n`;
  users.forEach(user => {
    text += `${user.id} | ${user.name} | ${user.email}\n`;
  });
  text += '\nUse o ID no campo responsible_id ao criar ou atualizar um ticket.';
  return text;
}

/**
 * Formata lista de atendentes no modo rich (card por atendente).
 */
function formatRich(users) {
  let text = `**Atendentes Tecnicos Encontrados:** ${users.length}\n\n`;
  users.forEach((user, index) => {
    text += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
  });
  text += '\n*Para criar ou atualizar um ticket com responsavel, use o ID do atendente no campo `responsible_id`.*\n';
  text += '\n✅ Dados obtidos via GET /technical-users';
  return text;
}

async function execute(args, { api, verbosity }) {
  const { name, email, desk_id, client_id, limit, offset } = args;
  const v = verbosity || 'rich';

  try {
    const filters = {
      limit: limit || 20,
      offset: offset || 1
    };

    if (name) filters.name = name;
    if (email) filters.email = email;
    if (desk_id != null) filters.desk_id = desk_id;
    if (client_id != null) filters.client_id = client_id;

    const response = await api.searchTechnicalUsers(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao buscar atendentes tecnicos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se sua organizacao possui licenca de tickets ativa.*`
      );
    }

    const users = response.data || [];

    if (users.length === 0) {
      const filterDesc = [
        name ? `nome="${name}"` : null,
        email ? `email="${email}"` : null,
        desk_id != null ? `desk_id=${desk_id}` : null,
        client_id != null ? `client_id=${client_id}` : null
      ].filter(Boolean).join(', ');

      return textResponse(
        `**Nenhum atendente tecnico encontrado**\n\n` +
        (filterDesc ? `Filtros: ${filterDesc}\n\n` : '') +
        `*Tente usar um termo de busca diferente ou verifique a grafia.*`
      );
    }

    if (v === 'compact') {
      return textResponse(formatCompact(users));
    }

    return textResponse(formatRich(users));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar atendentes tecnicos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatRich };

/**
 * Slice: search_requestor — busca solicitantes no TiFlux por nome, email ou telefone.
 *
 * Cadeia automatica de busca (tenta a proxima fonte em 403 OU 0 resultados, sem perguntar):
 *   1. GET /requestors                      — solicitantes globais (admin) → action: requestor_id
 *   2. GET /clients/{client_id}/requestors  — solicitantes do cliente (se client_id) → requestor_id
 *   3. GET /users                           — usuarios; nao sao solicitantes, mas o email serve
 *                                             como requestor_email → action: requestor_email
 *   4. GET /users/me                        — o proprio usuario; sugere abrir como ele mesmo via email
 *
 * Retorna o primeiro nivel que achar alguem. A LLM decide o proximo passo a partir da sugestao.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');

const schema = {
  name: 'search_requestor',
  description: 'Buscar solicitantes (requestors) no TiFlux por nome, email ou telefone. Cadeia automatica de fallback (tenta a proxima fonte em 403 ou quando nao encontra): GET /requestors (global) → GET /clients/{id}/requestors (se client_id) → GET /users (usa o email como requestor_email) → GET /users/me (sugere o proprio usuario). Util para resolver requestor_id/requestor_email antes de criar tickets, inclusive para atendentes nao-admin.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do solicitante a ser buscado (busca parcial, server-side)'
      },
      email: {
        type: 'string',
        description: 'Email do solicitante a ser buscado'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do solicitante (sem codigo de pais, sem simbolos)'
      },
      can_open_ticket: {
        type: 'boolean',
        description: 'Filtrar solicitantes que podem (true) ou nao podem (false) abrir ticket por email'
      },
      client_id: {
        type: 'number',
        description: 'ID do cliente para escopar a busca. Habilita o fallback automatico GET /clients/{id}/requestors quando o endpoint global /requestors retorna 403 (atendente sem permissao global).'
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

// Sucesso com pelo menos 1 registro (data e array nao-vazio).
function hasResults(resp) {
  return resp && !resp.error && Array.isArray(resp.data) && resp.data.length > 0;
}

// Erro real que deve aparecer (5xx, timeout, etc.) — NAO e 403 nem "vazio".
// 403 (permissao) e 0 resultados disparam a cadeia de fallback; erros duros nao.
function isHardError(resp) {
  return resp && resp.error && resp.status !== 403;
}

function formatRequestorsList(filters, requestors, source) {
  const filterDesc = filters.name ? `"${filters.name}"` :
                     filters.email ? `email "${filters.email}"` :
                     filters.telephone ? `telefone "${filters.telephone}"` :
                     'todos';

  let text = `**Busca de solicitantes — ${filterDesc}**\n\n`;
  if (source) text += `**Fonte:** ${source}\n`;
  text += `**Resultados encontrados:** ${requestors.length}\n\n`;

  text += '**Solicitantes encontrados:**\n';
  requestors.forEach((requestor, index) => {
    const canOpen = requestor.can_open_ticket ? 'Sim' : 'Nao';
    const clientName = requestor.client && requestor.client.name ? requestor.client.name : 'N/A';
    const email = requestor.email || 'N/A';
    const telephone = requestor.telephone || 'N/A';

    text += `${index + 1}. **ID:** ${requestor.id} | **Nome:** ${requestor.name} | **Email:** ${email} | **Telefone:** ${telephone} | **Cliente:** ${clientName} | **Pode abrir ticket:** ${canOpen}\n`;
  });

  // A API e paginada: quando a pagina vem cheia (length === limit) podem existir
  // mais resultados nao exibidos. Avisa para o caller nao concluir que viu todos.
  if (filters.limit && requestors.length >= filters.limit) {
    text += `\n*⚠️ Pagina cheia (${requestors.length} resultados): podem existir mais solicitantes. Refine a busca ou use \`offset\` para paginar.*\n`;
  }

  text += '\n*Para criar um ticket com este solicitante, use o ID no parametro `requestor_id`.*';
  return text;
}

// Nivel 3: usuarios encontrados em GET /users. Nao sao solicitantes (id != requestor_id),
// mas o email pode ser usado como requestor_email no create_ticket.
function formatUsersAsRequestors(term, users) {
  let text = `**Busca de solicitantes — "${term}"**\n\n` +
             `Nenhum *solicitante* encontrado, mas localizei usuario(s) com esse termo. ` +
             `Usuarios nao sao solicitantes — porem o **email** abaixo pode ser usado como ` +
             `\`requestor_email\` ao criar o ticket:\n\n`;
  users.forEach((u, index) => {
    text += `${index + 1}. **Nome:** ${u.name || 'N/A'} | **Email:** ${u.email || 'N/A'}\n`;
  });
  text += `\n*Para usar, passe \`requestor_email\` (o email acima) no \`create_ticket\`. A LLM decide o proximo passo.*`;
  return text;
}

// Nivel 4: o proprio usuario (GET /users/me). Sugere abrir como ele mesmo via email.
function formatSelfSuggestion(u, filterDesc) {
  return `**Busca de solicitantes — ${filterDesc}**\n\n` +
         `Nenhum solicitante nem usuario encontrado (ou sem permissao para busca-los).\n\n` +
         `**Sugestao:** abrir o ticket com voce mesmo como solicitante:\n` +
         `- **Nome:** ${u.name || 'N/A'} | **Email:** ${u.email || 'N/A'}\n\n` +
         `*Para usar, passe \`requestor_email: ${u.email || '<seu email>'}\` no \`create_ticket\`. ` +
         `A LLM decide o proximo passo.*`;
}

async function execute(args, { api }) {
  const { name, email, telephone, can_open_ticket, client_id, limit, offset } = args;

  // Pelo menos um filtro de busca e necessario
  if (!name && !email && !telephone && can_open_ticket === undefined) {
    return errorResponse(
      '**❌ Parametro obrigatorio ausente**\n\n' +
      'Informe pelo menos um filtro: `name`, `email`, `telephone` ou `can_open_ticket`.\n\n' +
      '*Exemplo: `name: "João Silva"` ou `email: "joao@empresa.com"`*'
    );
  }

  const filterDesc = name ? `"${name}"` : email ? `email "${email}"` : telephone ? `telefone "${telephone}"` : 'filtros informados';

  try {
    const filters = {
      limit: limit || 20,
      offset: offset || 1
    };

    if (name) filters.name = name;
    if (email) filters.email = email;
    if (telephone) filters.telephone = telephone;
    if (can_open_ticket !== undefined) filters.can_open_ticket = can_open_ticket;

    // NIVEL 1 — solicitantes globais (GET /requestors).
    const r1 = await api.searchRequestors(filters);
    if (hasResults(r1)) return textResponse(formatRequestorsList(filters, r1.data, 'GET /requestors'));
    // Erro duro (nao-403) na fonte primaria deve aparecer, nao ser mascarado pela cadeia.
    if (isHardError(r1)) {
      return errorResponse(
        `**Erro ao buscar solicitantes**\n\n` +
        `**Codigo:** ${r1.status}\n` +
        `**Mensagem:** ${r1.error}\n\n` +
        `*Verifique os filtros informados e se voce tem acesso ao modulo de solicitantes.*`
      );
    }

    // NIVEL 2 — solicitantes do cliente (GET /clients/{id}/requestors), quando ha client_id.
    // Acionado em 403 OU 0 resultados no nivel anterior.
    if (client_id) {
      const r2 = await api.searchClientRequestors(client_id, filters);
      if (hasResults(r2)) {
        return textResponse(formatRequestorsList(filters, r2.data, `GET /clients/${client_id}/requestors`));
      }
    }

    // NIVEL 3 — usuarios (GET /users), buscando pelo nome/email. Nao sao solicitantes,
    // mas o email serve como requestor_email. (Sem termo textual nao da pra buscar usuario.)
    const userTerm = name || email;
    if (userTerm) {
      const r3 = await api.searchUsers({ name: userTerm, limit: filters.limit });
      if (hasResults(r3)) return textResponse(formatUsersAsRequestors(userTerm, r3.data));
    }

    // NIVEL 4 — o proprio usuario (GET /users/me): sugere abrir como ele mesmo via email.
    const me = await api.fetchCurrentUser();
    if (me && !me.error && me.data && me.data.id) {
      return textResponse(formatSelfSuggestion(me.data, filterDesc));
    }

    // Nada encontrado em nenhuma das 4 fontes.
    return textResponse(
      `**Busca de solicitantes — ${filterDesc}**\n\n` +
      `**Resultado:** Nenhum solicitante encontrado (busquei em solicitantes, solicitantes do cliente, usuarios e usuario atual).\n\n` +
      `*Verifique a grafia, ou informe \`requestor_id\`/\`requestor_email\` diretamente ao criar o ticket.*`
    );
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar solicitantes**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatRequestorsList };

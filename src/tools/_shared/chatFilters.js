/**
 * Helpers compartilhados pelas 4 tools de listagem de chats (inbox, mine,
 * in_attendance, archived).
 *
 * As slices sao quase identicas na montagem do objeto de filtros repassado ao
 * client HTTP — co-localizar a parte comum aqui evita repetir o mesmo bloco em
 * cada `execute` (duplicacao real em >=4 slices). Cada slice complementa com os
 * campos exclusivos do seu endpoint (`user_id`/`status`, `canceled`,
 * `finished_at_*`).
 */

/**
 * Monta os filtros comuns a todos os endpoints de listagem de chats a partir
 * dos `args` da tool. Aplica os defaults de paginacao (offset=1, limit=20) e
 * repassa `created_at_*` 1:1 para a API v2 (sem transformacao).
 * @param {object} args - argumentos recebidos pela tool MCP
 * @returns {object} filtros comuns prontos para o client HTTP
 */
function commonChatListFilters(args = {}) {
  const {
    offset = 1,
    limit = 20,
    department_id,
    client_id,
    requestor_id,
    number,
    origins,
    started_by,
    created_at_start,
    created_at_end
  } = args;

  return {
    offset,
    limit,
    department_id,
    client_id,
    requestor_id,
    number,
    origins,
    started_by,
    created_at_start,
    created_at_end
  };
}

module.exports = { commonChatListFilters };

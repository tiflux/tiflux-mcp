/**
 * Helpers compartilhados pelas 4 tools de listagem de chats (inbox, mine,
 * in_attendance, archived).
 *
 * As slices sao quase identicas na montagem do objeto de filtros repassado ao
 * client HTTP — co-localizar a parte comum aqui evita repetir o mesmo bloco em
 * cada `execute` (duplicacao real em >=4 slices). Cada slice complementa com os
 * campos exclusivos do seu endpoint (`user_id`/`status`, `canceled`,
 * `finished_at_*`).
 *
 * --- H10: normalizacao de data pura (YYYY-MM-DD) em created_at_* e finished_at_* ---
 * A API v2 interpreta uma data pura sem hora como meia-noite UTC — um filtro
 * `created_at_start=2026-10-05` comeca 3h depois da meia-noite de Brasilia e
 * `created_at_end=2026-10-05` termina 3h ANTES do fim do dia em Brasilia,
 * fazendo um dia inteiro filtrado por data pura devolver vazio ou faltar itens
 * (achado H10 da auditoria 2026-10-06). Normalizamos no slice (guardrail
 * BE-003: logica de negocio nao entra no transporte) para o dia inteiro em
 * horario de Brasilia: inicio `T00:00:00-03:00`, fim `T23:59:59-03:00`.
 * Datetime com hora/fuso explicito passa intacto, e valor nao reconhecido como
 * data pura tambem passa intacto (a API valida e devolve 422 se for invalido).
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza uma data pura (YYYY-MM-DD) para o INICIO do dia em horario de
 * Brasilia (`T00:00:00-03:00`). Valores que nao sao data pura (datetime com
 * hora, string invalida, undefined) passam intactos.
 * @param {string|undefined} value
 * @returns {string|undefined}
 */
function normalizeDateStart(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return value;
  return `${value}T00:00:00-03:00`;
}

/**
 * Normaliza uma data pura (YYYY-MM-DD) para o FIM do dia em horario de
 * Brasilia (`T23:59:59-03:00`). Valores que nao sao data pura passam intactos.
 * @param {string|undefined} value
 * @returns {string|undefined}
 */
function normalizeDateEnd(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return value;
  return `${value}T23:59:59-03:00`;
}

/**
 * Monta os filtros comuns a todos os endpoints de listagem de chats a partir
 * dos `args` da tool. Aplica os defaults de paginacao (offset=1, limit=20) e
 * normaliza `created_at_*` quando vierem como data pura (H10).
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
    created_at_start: normalizeDateStart(created_at_start),
    created_at_end: normalizeDateEnd(created_at_end)
  };
}

/**
 * Normaliza `finished_at_start`/`finished_at_end` com a mesma regra de data
 * pura usada em `created_at_*` (H10). Exclusivo de `list_archived_chats`.
 * @param {object} args - `{ finished_at_start, finished_at_end }`
 * @returns {object}
 */
function normalizeFinishedAtFilters({ finished_at_start, finished_at_end } = {}) {
  return {
    finished_at_start: normalizeDateStart(finished_at_start),
    finished_at_end: normalizeDateEnd(finished_at_end)
  };
}

module.exports = { commonChatListFilters, normalizeFinishedAtFilters };

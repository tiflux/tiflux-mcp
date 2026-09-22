/**
 * userResolver.js — Helper compartilhado para resolucao responsible_name -> responsible_id.
 *
 * Encapsula o bloco duplicado nos slices createTicket, updateTicket e listTickets.
 *
 * Caminho PRIMARIO: api.searchTechnicalUsers() — GET /technical-users.
 * Nao exige permissao de gerenciamento de usuarios; funciona para admin e atendente comum.
 * Aceita scoping opcional por deskId/clientId para desambiguar via server-side.
 *
 * Caminho FALLBACK: smartSearchUsers(api, filters) — acionado apenas se o primario
 * retornar erro inesperado (404/403), preservando compatibilidade com orgs onde
 * /technical-users ainda nao esteja habilitado. Fica neste modulo (nao em
 * tiflux-api.js) por ser logica de negocio — busca direta GET /users, fallback
 * via GET /technical-groups + GET /technical-groups/{id}/users, dedup e fuzzy
 * match (guardrail BE-003: tiflux-api.js e so transporte).
 *
 * O branching 0/1/N/erro vive em entityResolver.js (compartilhado com deskResolver).
 *
 * Retorno:
 *   { error: false, userId: number, user: object }  — 1 usuario encontrado
 *   { error: true,  response: MCPResponse }          — 0, N ou erro de API
 *
 * O shape de `response` e identico ao que errorResponse() produz (com
 * isError: true — a resolucao e pre-condicao da operacao), entao os
 * slices podem simplesmente fazer:
 *
 *   const resolved = await resolveResponsibleName(api, responsible_name, { deskId, clientId });
 *   if (resolved.error) return resolved.response;
 *   finalResponsibleId = resolved.userId;
 */

const { resolveEntityByName } = require('./entityResolver');

const MAX_GROUPS_CAP = 20;

/**
 * Avalia se um usuario do fallback technical-groups esta ativo, de forma
 * tolerante a variacao de shape da API (boolean true, 1, "true", "1" ou campo
 * ausente => ativo). So consideramos inativo quando o campo esta presente e
 * explicitamente "desligado" — evita filtrar todos os usuarios por engano.
 */
function isUserActive(user) {
  const v = user.active;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return true;
}

/**
 * Busca usuarios com fallback para nao-admins via technical-groups.
 *
 * Fluxo:
 *   1. Tenta GET /users (admin: retorna lista completa; nao-admin: 403).
 *   2. Se 403: enumera GET /technical-groups (cap: MAX_GROUPS_CAP grupos),
 *      para cada grupo GET /technical-groups/{id}/users, dedup por id,
 *      aplica fuzzyMatchItems pelo nome, retorna no shape { data: [...] }.
 *
 * Cap defensivo: MAX_GROUPS_CAP grupos por busca para evitar custo em orgs grandes.
 * Se truncado, retorna `_truncated: true` no objeto de resposta.
 *
 * So usa metodos de transporte de `api` (searchUsers, listTechnicalGroups,
 * listTechnicalGroupUsers) — a logica de fallback/fuzzy/dedup vive aqui
 * (guardrail BE-003: tiflux-api.js fica so com transporte).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} filters - { name, type, active, limit, offset }
 */
async function smartSearchUsers(api, filters = {}) {
  const directResponse = await api.searchUsers(filters);

  // Caminho direto (admin ou sucesso): retorna imediatamente
  if (!directResponse.error) {
    return directResponse;
  }

  // Se nao for 403, nao e problema de permissao — repassa o erro
  if (directResponse.status !== 403) {
    return directResponse;
  }

  // Fallback: enumerar grupos e seus usuarios.
  // Pede um a mais que o cap para distinguir "exatamente o cap" de "ha mais grupos".
  const groupsResponse = await api.listTechnicalGroups({ offset: 1, limit: MAX_GROUPS_CAP + 1 });

  if (groupsResponse.error) {
    return {
      error: `Sem acesso a GET /users (403) e GET /technical-groups tambem falhou: ${groupsResponse.error}`,
      status: groupsResponse.status
    };
  }

  const allGroups = groupsResponse.data || [];
  const truncated = allGroups.length > MAX_GROUPS_CAP;
  const groups = truncated ? allGroups.slice(0, MAX_GROUPS_CAP) : allGroups;

  // Buscar usuarios de todos os grupos em paralelo (evita N+1 serializado)
  const perGroupResponses = await Promise.all(
    groups.map(group => api.listTechnicalGroupUsers(group.id))
  );

  // Coletar usuarios (dedup por id) e contabilizar grupos sem acesso
  const seenIds = new Set();
  const allUsers = [];
  let groupErrors = 0;

  for (const usersResponse of perGroupResponses) {
    if (usersResponse.error) {
      groupErrors++;
      continue; // skip grupos sem acesso
    }
    const users = usersResponse.data || [];
    for (const user of users) {
      if (user && user.id !== undefined && !seenIds.has(user.id)) {
        seenIds.add(user.id);
        allUsers.push(user);
      }
    }
  }

  // Se NENHUM grupo respondeu e houve falhas, o problema e de permissao —
  // nao deixar virar "usuario nao encontrado" silencioso (diagnostico enganoso).
  if (allUsers.length === 0 && groups.length > 0 && groupErrors === groups.length) {
    return {
      error: `Sem acesso a GET /users (403) e nenhum dos ${groups.length} grupos de atendimento retornou usuarios (provavel falta de permissao em /technical-groups/{id}/users).`,
      status: 403
    };
  }

  // Aplicar filtros client-side de forma DEFENSIVA: o shape exato de
  // /technical-groups/{id}/users nao e garantido pelo Swagger, entao so
  // excluimos um usuario quando o campo esta presente E contradiz o filtro.
  // Campo ausente nao derruba o resultado (evita "0 usuarios" silencioso).
  let filtered = allUsers;

  if (filters.active !== undefined) {
    filtered = filtered.filter(u => isUserActive(u) === filters.active);
  }

  if (filters.type) {
    filtered = filtered.filter(u => {
      const t = u._type !== undefined ? u._type : u.type;
      return t === undefined || t === null || t === filters.type;
    });
  }

  if (filters.name) {
    const { fuzzyMatchItems } = require('./fuzzyMatch');
    const { matches } = fuzzyMatchItems(filters.name, filtered, u => u.name);
    filtered = matches.map(m => m.item);
  }

  if (filters.limit && filters.limit < filtered.length) {
    filtered = filtered.slice(0, filters.limit);
  }

  return {
    data: filtered,
    _truncated: truncated,
    _fallback: 'technical-groups'
  };
}

/**
 * Resolve um nome de responsavel para responsible_id.
 *
 * Usa GET /technical-users como caminho primario (rapido, 1 round-trip, funciona
 * para admin e nao-admin). Fallback a smartSearchUsers apenas se primario retornar
 * erro inesperado (404 ou 403).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} name - nome (parcial ou exato) do responsavel
 * @param {object} [scope] - escopo opcional para desambiguacao server-side
 * @param {number} [scope.deskId] - ID da mesa (reduz resultados para atendentes da mesa)
 * @param {number} [scope.clientId] - ID do cliente (reduz resultados para atendentes do cliente)
 * @returns {Promise<{error: boolean, userId?: number, user?: object, response?: object}>}
 */
async function resolveResponsibleName(api, name, { deskId, clientId } = {}) {
  // Caminho primario: GET /technical-users (permissivo, sem admin)
  const primaryFilters = { name, limit: 10 };
  if (deskId != null) primaryFilters.desk_id = deskId;
  if (clientId != null) primaryFilters.client_id = clientId;

  const primaryResponse = await api.searchTechnicalUsers(primaryFilters);

  // Se primario retornou erro inesperado (404/403): acionar fallback
  const primaryFailed =
    primaryResponse.error &&
    (primaryResponse.status === 404 || primaryResponse.status === 403);

  let response;
  if (primaryFailed) {
    // Fallback: GET /users (admin) ou GET /technical-groups/{id}/users (nao-admin)
    response = await smartSearchUsers(api, {
      name,
      active: true,
      type: 'attendant',
      limit: 10
    });
  } else {
    response = primaryResponse;
  }

  return resolveEntityByName(response, {
    idKey: 'userId',
    itemKey: 'user',
    idOf: (u) => u.id,
    searchError: (err) =>
      `**Erro ao buscar usuario "${name}"**\n\n` +
      `**Erro:** ${err}\n\n` +
      `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`,
    notFound: (resp) => {
      const truncatedNote = resp._truncated
        ? '\n\n*Nota: a busca foi limitada a um subconjunto de grupos. Tente usar responsible_id diretamente se o usuario nao aparecer.*'
        : '';
      return (
        `**Usuario "${name}" nao encontrado**\n\n` +
        `*Verifique se o nome esta correto ou use responsible_id diretamente.*` +
        truncatedNote
      );
    },
    multiple: (users) => {
      let usersList = '**Usuarios encontrados:**\n';
      users.forEach((user, index) => {
        usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
      });
      return (
        `**Multiplos usuarios encontrados para "${name}"**\n\n` +
        `${usersList}\n` +
        `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
      );
    }
  });
}

module.exports = { resolveResponsibleName, smartSearchUsers, isUserActive };

/**
 * Helpers compartilhados pelas tools de grupos da organizacao — grupos de
 * atendentes (`src/tools/technical_groups/`) e grupos de permissoes
 * (`src/tools/role_groups/`).
 *
 * Os 9 slices dessas duas entidades repetiam o mesmo esqueleto: paginacao
 * offset/limit clampada, tratamento de erro 404/403 por grupo, renderizacao
 * paginada com auto-compact e o card de usuario (identico em
 * list_technical_group_users e list_role_group_users). Extraido aqui para que
 * cada slice declare so o que e especifico (endpoint, textos, renderItem).
 *
 * Puramente apresentacao/validacao — nenhuma chamada HTTP nova (BE-003).
 */

const { textResponse } = require('./response');
const { apiFailureResponse, internalErrorResponse, extractApiErrorCode } = require('./errors');
const { requireIntField, parseIntStrict } = require('./validators');
const { renderList, row, dateTime, listVerbosity } = require('./format');
const { escapeCell } = require('./markdown');

const OFFSET_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const DEFAULT_LIMIT = 20;

/** Grupo de atendentes (technical group). */
const TECHNICAL_GROUP = Object.freeze({
  idField: 'technical_group_id',
  noun: 'grupo de atendentes',
  label: 'Grupo de atendentes',
  listTool: 'list_technical_groups',
  permission: 'Gerenciar mesas de servicos'
});

/** Grupo de permissoes (role group). */
const ROLE_GROUP = Object.freeze({
  idField: 'role_group_id',
  noun: 'grupo de permissoes',
  label: 'Grupo de permissoes',
  listTool: 'list_role_groups',
  permission: 'Gerenciar grupos de permissao'
});

/** Propriedade de schema do ID obrigatorio do grupo (`{ <idField>: {...} }`). */
function groupIdSchemaProperty(kind) {
  return {
    [kind.idField]: {
      type: 'number',
      description: `ID do ${kind.noun} (obtido via ${kind.listTool}). Obrigatorio.`
    }
  };
}

/** Dica de erro 403 com a permissao exigida pelo grupo. */
function permissionTail(kind) {
  return `*Requer a permissao "${kind.permission}".*`;
}

/**
 * Le `limit`/`offset` de args, clampando limit em [1, 200] e offset >= 1.
 * Acrescenta ao objeto `filters` informado (permite filtros extras antes).
 *
 * `limit` e SEMPRE enviado (default 20) para que o transporte pagine com o
 * mesmo limit que o rodape de paginacao exibe — `api.listTechnicalGroupUsers`
 * tem default proprio de 200 (usado pelo userResolver), e sem limit explicito
 * a heuristica `count === limit` do rodape mentiria.
 */
function paginationFilters(args, filters = {}) {
  const { limit, offset } = args;
  filters.limit = limit === undefined
    ? DEFAULT_LIMIT
    : Math.min(Math.max(parseIntStrict(limit, 'limit'), LIMIT_MIN), LIMIT_MAX);
  if (offset !== undefined) {
    filters.offset = Math.max(parseIntStrict(offset, 'offset'), OFFSET_MIN);
  }
  return filters;
}

/**
 * Erro de API em endpoint `/<grupos>/{id}...`: 404 (ou codigo 40401) vira
 * "grupo nao encontrado"; demais erros usam `**❌ Erro ao <actionText>**`.
 */
function groupErrorResponse(kind, id, actionText, response) {
  const errorCode = extractApiErrorCode(response);
  const isNotFound = response.status === 404 || errorCode === 40401;

  if (isNotFound) {
    return apiFailureResponse(
      `**❌ ${kind.label} #${id} nao encontrado**`,
      response,
      `*Grupo inexistente ou de outra organizacao — use ${kind.listTool} para descobrir IDs validos.*`
    );
  }

  return apiFailureResponse(
    `**❌ Erro ao ${actionText}**`,
    response,
    response.status === 403
      ? permissionTail(kind)
      : '*Verifique se o grupo existe e se voce tem permissao para acessa-lo.*'
  );
}

/** `data` de GET /<grupos>/{id} precisa ser um objeto. */
function isGroupObject(data) {
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data);
}

/** Resposta de sucesso sem objeto de grupo valido. */
function unexpectedGroupResponse(kind, id, status) {
  return apiFailureResponse(
    `**⚠️ Resposta inesperada ao buscar ${kind.noun} #${id}**`,
    { error: 'Resposta da API sem dados do grupo', status: status || 200 },
    `*Verifique se o grupo #${id} existe.*`
  );
}

/**
 * Renderiza a pagina de uma listagem (com auto-compact) como resposta MCP.
 *
 * @param {object} response - resposta da API (`data`, `total`)
 * @param {object} filters - filtros enviados (`limit`/`offset`)
 * @param {object} ctx - `{ verbosity, verbosityExplicit }`
 * @param {object} opts - `{ title, emptyMessage, unit, renderItem }`;
 *   `renderItem(verbosity)` devolve o renderer de cada item
 */
function pagedListResponse(response, filters, ctx, { title, emptyMessage, unit, renderItem }) {
  const items = response.data || [];
  const { verbosity, notice } = listVerbosity(
    { verbosity: ctx.verbosity, verbosityExplicit: ctx.verbosityExplicit },
    items.length
  );

  const text = renderList({
    items,
    title,
    emptyMessage,
    renderItem: renderItem(verbosity),
    total: response.total,
    offset: filters.offset || OFFSET_MIN,
    limit: filters.limit || DEFAULT_LIMIT,
    unit,
    verbosity
  });

  return textResponse(text + notice);
}

/**
 * Cria o `execute` de uma listagem de sub-recurso de grupo
 * (`GET /<grupos>/{id}/<sub-recurso>` paginado).
 *
 * @param {object} opts
 * @param {object} opts.kind - TECHNICAL_GROUP ou ROLE_GROUP
 * @param {string} opts.apiMethod - metodo de TiFluxAPI `(id, filters)`
 * @param {string} opts.action - verbo + objeto (ex: 'listar mesas'); vira
 *   `<action> do <grupo> #<id>` nas mensagens de erro
 * @param {string} opts.itemsLabel - prefixo do titulo (ex: 'Mesas')
 * @param {Function} opts.emptyMessage - `(id) => string`
 * @param {string} opts.unit - unidade da paginacao (ex: 'mesas')
 * @param {Function} opts.renderItem - `(verbosity) => (item) => string`
 * @param {Function} [opts.extraFilters] - `(args) => object` filtros alem da paginacao
 */
function createGroupSubresourceList({ kind, apiMethod, action, itemsLabel, emptyMessage, unit, renderItem, extraFilters }) {
  return async function execute(args, ctx) {
    const id = requireIntField(args, kind.idField);
    const filters = paginationFilters(args, extraFilters ? extraFilters(args) : {});
    const actionText = `${action} do ${kind.noun} #${id}`;

    try {
      const response = await ctx.api[apiMethod](id, filters);
      if (response.error) return groupErrorResponse(kind, id, actionText, response);

      return pagedListResponse(response, filters, ctx, {
        title: `${itemsLabel} do ${kind.noun} #${id}`,
        emptyMessage: emptyMessage(id),
        unit,
        renderItem
      });
    } catch (error) {
      return internalErrorResponse(`**❌ Erro interno ao ${actionText}**`, error);
    }
  };
}

const USER_TYPE_LABELS = { admin: 'Administrador', attendant: 'Atendente', client: 'Cliente' };

function userTypeLabel(type) {
  if (!type) return '—';
  return USER_TYPE_LABELS[type] || type;
}

function lastLogin(value, verbosity) {
  if (!value) return verbosity === 'compact' ? 'nunca' : 'Nunca';
  return dateTime(value, verbosity);
}

/**
 * Renderer de usuario membro de grupo (mesmo shape em
 * /technical-groups/{id}/users e /role-groups/{id}/users).
 */
function renderGroupUser(verbosity) {
  return (user) => {
    const id = user.id ?? '—';
    const name = user.name || '—';
    const email = user.email || '—';
    const active = user.active ? 'Sim' : 'Nao';
    if (verbosity === 'compact') return `${row([id, name, email, active])}\n`;

    const type = userTypeLabel(user._type);
    const login = lastLogin(user.last_login_at, verbosity);
    const gauth = user.gauth_enabled ? 'Sim' : 'Nao';
    const group = user.technical_group_id != null ? `#${user.technical_group_id}` : '—';
    return (
      `**${escapeCell(name)}** (#${id})\n` +
      `- E-mail: ${escapeCell(email)}\n` +
      `- Tipo: ${type}\n` +
      `- Ativo: ${active}\n` +
      `- Ultimo login: ${login}\n` +
      `- 2FA: ${gauth}\n` +
      `- Grupo de atendentes: ${group}\n\n`
    );
  };
}

/** Renderer `id — nome` (listagens de grupos sem campos extras). */
function renderIdName(verbosity) {
  return (group) => {
    const id = group.id ?? '—';
    const name = group.name || '—';
    if (verbosity === 'compact') return `${row([id, name])}\n`;
    return `**ID ${id}** — ${escapeCell(name)}\n\n`;
  };
}

module.exports = {
  TECHNICAL_GROUP,
  ROLE_GROUP,
  groupIdSchemaProperty,
  permissionTail,
  paginationFilters,
  groupErrorResponse,
  isGroupObject,
  unexpectedGroupResponse,
  pagedListResponse,
  createGroupSubresourceList,
  renderGroupUser,
  renderIdName
};

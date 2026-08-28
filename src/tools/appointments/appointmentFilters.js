/**
 * appointmentFilters.js — helpers locais do modulo appointments.
 *
 * Compartilhados entre `list_appointments_global` e `list_appointments_report`,
 * que consomem o MESMO endpoint (GET /appointments) e portanto tem schema de
 * filtros, validacao de periodo, resolucao de nomes e mapeamento de erro
 * identicos. Antes cada slice mantinha copia literal desses blocos
 * (~80 linhas duplicadas — reprovado pelo quality gate de duplicacao).
 *
 * Fica aqui (e nao em `_shared/`) porque a duplicacao e local ao modulo
 * appointments (2 slices). Se um terceiro modulo precisar do mesmo, ai sim
 * promove para `src/tools/_shared/` — regra do CLAUDE.md (>= 3 slices).
 */

const { errorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { capIds } = require('../_shared/reportMath');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');

// Limite maximo de IDs por filtro — definido pela API v2 (erro 422 se excedido).
const MAX_IDS = 15;

const PARAM_HINT = '*Verifique os parâmetros (start_date/end_date obrigatórios, desk_ids deve ser numérico).*';

/**
 * Aviso exibido quando contract_ids esta ativo (A2 + A1).
 * Compartilhado entre list_appointments_global e list_appointments_report — a
 * exclusao de apontamentos sem contrato precisa ser visivel nos dois (o report
 * e usado em auditoria de faturamento; omissao silenciosa subnotifica horas).
 */
const CONTRACT_FILTER_NOTICE = '> ⚠️ **Filtro por contrato ativo:** apontamentos sem contrato são excluídos do resultado. Em contratos Shared, o `contract.id` retornado pode diferir do id filtrado (comportamento esperado da API — expande grupo→membro).';

/**
 * Mapeamento de tipo de atendimento (string da API → label PT-BR).
 * Consumido por listAppointments e listAppointmentsGlobal (unicos slices que renderizam
 * o rotulo de atendimento hoje).
 * Dedupe: antes cada slice mantinha copia local.
 */
const ATTENDANCE_LABELS = {
  External: 'Externo',
  Remote: 'Remoto',
  Internal: 'Interno'
};

/**
 * Mapeamento de tipo de servico (string da API → label PT-BR).
 */
const ATTENDANCE_KIND_LABELS = {
  Contract: 'Contrato',
  Loose: 'Avulso'
};

/**
 * Propriedades de schema comuns as tools de apontamentos globais.
 * Cada slice pode sobrescrever a `description` de um campo passando
 * `{ <campo>: 'nova descricao' }` — o resto herda o texto padrao.
 *
 * @param {Object<string,string>} [descriptions] - overrides por campo
 * @returns {object} bloco de `properties` pronto para spread no inputSchema
 */
function appointmentFilterSchemaProperties(descriptions = {}) {
  const desc = (field, fallback) => descriptions[field] || fallback;

  return {
    start_date: {
      type: 'string',
      description: 'Data inicial do período (YYYY-MM-DD). Obrigatório.'
    },
    end_date: {
      type: 'string',
      description: 'Data final do período (YYYY-MM-DD). Obrigatório.'
    },
    user_ids: {
      type: 'string',
      description: desc('user_ids', 'IDs dos técnicos separados por vírgula (máximo 15). Use user_names para resolução por nome.')
    },
    user_names: {
      type: 'string',
      description: desc('user_names', 'Nomes dos técnicos separados por vírgula para resolução automática (alternativa a user_ids). Ambiguidade → lista para desambiguação.')
    },
    desk_ids: {
      type: 'string',
      description: desc('desk_ids', 'IDs das mesas separados por vírgula (máximo 15). Use desk_names para resolução por nome.')
    },
    desk_names: {
      type: 'string',
      description: desc('desk_names', 'Nomes das mesas separados por vírgula para resolução automática (alternativa a desk_ids). Ambiguidade → lista para desambiguação.')
    },
    include_valorization: {
      type: 'boolean',
      description: desc('include_valorization', 'Incluir dados de valorização (tipo de atendimento, contrato/avulso, deslocamento, valor). Padrão: false.')
    },
    client_ids: {
      type: 'string',
      description: desc('client_ids', 'IDs dos clientes separados por vírgula (máximo 15). Use client_names para resolução por nome. Apontamentos sem contrato somem do resultado quando este filtro está ativo (comportamento da API). Em contratos Shared, o contract.id retornado pode diferir do id filtrado — isso é esperado (a API expande o grupo para o membro).')
    },
    client_names: {
      type: 'string',
      description: desc('client_names', 'Nomes dos clientes separados por vírgula para resolução automática (alternativa a client_ids). Máximo 15 clientes resolvidos — acima disso a chamada é rejeitada (não trunca). Ambiguidade → lista para desambiguação. Precedência: client_ids vence quando ambos forem informados.')
    },
    contract_ids: {
      type: 'string',
      description: desc('contract_ids', 'IDs dos contratos separados por vírgula (máximo 15). Atenção (A2): apontamentos sem contrato somem do resultado quando este filtro está ativo. Atenção (A1): em contratos Shared, o contract.id retornado pode ser diferente do id filtrado — isso é comportamento da API (expande grupo → membro) e NÃO indica erro nem filtragem incorreta.')
    }
  };
}

/**
 * Valida o limite de IDs para campos que rejeitam via 422 na API (D6).
 * Diferente de capIds() — que trunca silenciosamente — esta funcao rejeita
 * localmente quando o usuario passa mais que MAX_IDS ids, evitando relatorio
 * sobre amostra parcial sem aviso.
 *
 * Aplica-se a client_ids, contract_ids e aos ids resolvidos de client_names.
 * user_ids/desk_ids continuam truncando via capIds() por compatibilidade
 * retroativa (comportamento legado).
 *
 * @param {string} csv - CSV de IDs
 * @param {string} fieldName - nome do campo (para mensagem de erro)
 * @returns {{ error: boolean, ids?: string, response?: object }}
 */
function validateAndNormalizeIds(csv, fieldName) {
  if (!csv) return { error: false, ids: null };
  const ids = [...new Set(String(csv).split(',').map(s => s.trim()).filter(Boolean))];
  if (ids.length > MAX_IDS) {
    return {
      error: true,
      response: errorResponse(
        `**❌ Limite de IDs excedido em \`${fieldName}\`**\n\n` +
        `Recebidos: **${ids.length}** IDs. Limite: **${MAX_IDS}**.\n\n` +
        `*Reduza a lista para no máximo ${MAX_IDS} IDs e tente novamente.*`
      )
    };
  }
  return { error: false, ids: ids.join(',') };
}

/**
 * Valida a obrigatoriedade de start_date/end_date.
 * @param {object} args - argumentos da tool
 * @returns {object|null} resposta MCP de erro, ou null se o periodo esta ok
 */
function validateRequiredPeriod({ start_date, end_date }) {
  if (!start_date) {
    return errorResponse(
      '**❌ Parâmetro obrigatório ausente**\n\n' +
      '`start_date` é obrigatório. Informe a data inicial no formato YYYY-MM-DD.'
    );
  }
  if (!end_date) {
    return errorResponse(
      '**❌ Parâmetro obrigatório ausente**\n\n' +
      '`end_date` é obrigatório. Informe a data final no formato YYYY-MM-DD.'
    );
  }
  return null;
}

/**
 * Resolve um CSV de nomes para um CSV de IDs.
 * Aborta no primeiro nome ambiguo/inexistente, propagando a resposta do resolver.
 *
 * `cap: true` (padrao) trunca em 15 via capIds — comportamento legado de
 * user_names/desk_names. `cap: false` devolve todos os ids resolvidos, para o
 * chamador aplicar a validacao D6 (rejeitar em vez de truncar).
 *
 * @param {string} csvNames - nomes separados por virgula
 * @param {(name: string) => Promise<{error: boolean, id?: number|string, response?: object}>} resolveOne
 * @param {{cap?: boolean}} [options]
 * @returns {Promise<{error: boolean, ids?: string|null, response?: object}>}
 */
async function resolveCsvNamesToIds(csvNames, resolveOne, { cap = true } = {}) {
  const names = String(csvNames).split(',').map(s => s.trim()).filter(Boolean);
  const resolved = [];

  for (const name of names) {
    const r = await resolveOne(name);
    if (r.error) return { error: true, response: r.response };
    resolved.push(String(r.id));
  }

  const joined = resolved.join(',');
  return { error: false, ids: cap ? capIds(joined) : (joined || null) };
}

/**
 * Normaliza user_ids/desk_ids/client_ids/contract_ids, resolvendo nomes quando os IDs
 * nao forem informados diretamente (IDs tem precedencia sobre nomes).
 *
 * D6: client_ids, client_names (apos resolucao) e contract_ids sao validados com
 *     rejeicao local (nao truncados).
 * D8: contract_ids e repassado direto a API sem re-checagem client-side por contract.id —
 *     decisao de design deliberada: em contratos Shared, a API retorna o id do membro
 *     (diferente do id do grupo filtrado). Filtrar client-side descartaria todos os
 *     resultados de contratos Shared silenciosamente. Nao "consertar" este comportamento.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} args - { user_ids, user_names, desk_ids, desk_names, client_ids, client_names, contract_ids }
 * @returns {Promise<{error: boolean, userIds?: string|null, deskIds?: string|null, clientIds?: string|null, contractIds?: string|null, response?: object}>}
 */
async function resolveAppointmentFilterIds(api, { user_ids, user_names, desk_ids, desk_names, client_ids, client_names, contract_ids }) {
  let userIds = user_ids ? capIds(user_ids) : null;
  let deskIds = desk_ids ? capIds(desk_ids) : null;

  if (user_names && !user_ids) {
    const r = await resolveCsvNamesToIds(user_names, async (name) => {
      const resolved = await resolveResponsibleName(api, name);
      return resolved.error ? resolved : { error: false, id: resolved.userId };
    });
    if (r.error) return r;
    userIds = r.ids;
  }

  if (desk_names && !desk_ids) {
    const r = await resolveCsvNamesToIds(desk_names, async (name) => {
      const resolved = await resolveDeskName(api, name);
      return resolved.error ? resolved : { error: false, id: resolved.deskId };
    });
    if (r.error) return r;
    deskIds = r.ids;
  }

  // client_ids: D6 — rejeita se >15, sem truncar
  let clientIds = null;
  if (client_ids) {
    const v = validateAndNormalizeIds(client_ids, 'client_ids');
    if (v.error) return v;
    clientIds = v.ids;
  } else if (client_names) {
    // client_names: resolucao automatica via resolveClientName (client_ids tem precedencia).
    // D6 vale tambem aqui: sem cap silencioso — os ids resolvidos passam pela mesma
    // validacao de limite de client_ids, para nao gerar relatorio sobre amostra parcial.
    const r = await resolveCsvNamesToIds(client_names, async (name) => {
      const resolved = await resolveClientName(api, name);
      return resolved.error ? resolved : { error: false, id: resolved.clientId };
    }, { cap: false });
    if (r.error) return r;
    const v = validateAndNormalizeIds(r.ids, 'client_names');
    if (v.error) return v;
    clientIds = v.ids;
  }

  // contract_ids: D6 — rejeita se >15, sem truncar
  // D8: repassado direto a API; sem re-checagem client-side (ver jsdoc acima)
  let contractIds = null;
  if (contract_ids) {
    const v = validateAndNormalizeIds(contract_ids, 'contract_ids');
    if (v.error) return v;
    contractIds = v.ids;
  }

  return { error: false, userIds, deskIds, clientIds, contractIds };
}

/**
 * Mapeia erro do GET /appointments para resposta MCP amigavel.
 * 40304 → sem licenca; 403 → sem permissao na rota; demais → falha generica.
 *
 * @param {object} response - resposta com { error, status }
 * @param {string} failureTitle - titulo do erro generico (varia por tool)
 * @returns {object} resposta MCP de erro
 */
function appointmentsApiErrorResponse(response, failureTitle) {
  const errorCode = extractApiErrorCode(response);

  if (errorCode === 40304) {
    return errorResponse(
      '**❌ Sem licença para apontamentos**\n\n' +
      'Sua organização não possui licença ativa para o módulo de tickets/apontamentos (erro 40304).\n\n' +
      '*Entre em contato com o suporte TiFlux para verificar o licenciamento.*'
    );
  }

  if (response.status === 403) {
    return errorResponse(
      '**❌ Acesso negado ao endpoint de apontamentos**\n\n' +
      `**Código:** ${response.status} (erro ${errorCode || 'N/A'})\n` +
      '**Mensagem:** Sem permissão para acessar apontamentos globais.\n\n' +
      '*Verifique se o usuário possui a permissão "Visualizar relatórios dos técnicos" (view_users_manage) ou acesso ao módulo de relatórios.*'
    );
  }

  return apiFailureResponse(failureTitle, response, PARAM_HINT);
}

module.exports = {
  ATTENDANCE_LABELS,
  CONTRACT_FILTER_NOTICE,
  ATTENDANCE_KIND_LABELS,
  appointmentFilterSchemaProperties,
  validateRequiredPeriod,
  resolveAppointmentFilterIds,
  validateAndNormalizeIds,
  appointmentsApiErrorResponse
};

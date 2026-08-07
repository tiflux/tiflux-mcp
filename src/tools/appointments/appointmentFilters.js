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

const PARAM_HINT = '*Verifique os parâmetros (start_date/end_date obrigatórios, desk_ids deve ser numérico).*';

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
    }
  };
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
 * Resolve um CSV de nomes para um CSV de IDs (cap de 15 via capIds).
 * Aborta no primeiro nome ambiguo/inexistente, propagando a resposta do resolver.
 *
 * @param {string} csvNames - nomes separados por virgula
 * @param {(name: string) => Promise<{error: boolean, id?: number|string, response?: object}>} resolveOne
 * @returns {Promise<{error: boolean, ids?: string|null, response?: object}>}
 */
async function resolveCsvNamesToIds(csvNames, resolveOne) {
  const names = String(csvNames).split(',').map(s => s.trim()).filter(Boolean);
  const resolved = [];

  for (const name of names) {
    const r = await resolveOne(name);
    if (r.error) return { error: true, response: r.response };
    resolved.push(String(r.id));
  }

  return { error: false, ids: capIds(resolved.join(',')) };
}

/**
 * Normaliza user_ids/desk_ids, resolvendo user_names/desk_names quando os IDs
 * nao forem informados diretamente (IDs tem precedencia sobre nomes).
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} args - { user_ids, user_names, desk_ids, desk_names }
 * @returns {Promise<{error: boolean, userIds?: string|null, deskIds?: string|null, response?: object}>}
 */
async function resolveAppointmentFilterIds(api, { user_ids, user_names, desk_ids, desk_names }) {
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

  return { error: false, userIds, deskIds };
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
  appointmentFilterSchemaProperties,
  validateRequiredPeriod,
  resolveAppointmentFilterIds,
  appointmentsApiErrorResponse
};

/**
 * Validators compartilhados entre slices de tools MCP.
 *
 * Filosofia: validar inputs no começo do slice, throw Error com mensagem
 * especifica. Cada slice faz suas proprias checks — helpers aqui so para
 * patterns que aparecem em 3+ slices.
 */

/**
 * Erro de input invalido vindo do chamador (campo obrigatorio ausente, inteiro
 * malformado). Os bootstraps rebaixam o nivel do log (warn em vez de error) via
 * isValidationError, e `toolErrorResponse` (errors.js) o renderiza como
 * "Problema / Como resolver" em vez de "Erro interno".
 *
 * `hint` (opcional) e a instrucao acionavel para o agente se corrigir em uma
 * chamada: qual parametro informar e qual tool descobre o valor.
 */
class ValidationError extends Error {
  constructor(message, { hint } = {}) {
    super(message);
    this.name = 'ValidationError';
    if (hint) this.hint = hint;
  }
}

function isValidationError(error) {
  return error instanceof ValidationError;
}

/**
 * Dica padrao por campo obrigatorio, usada quando o slice nao passa `hint`:
 * diz o que informar e qual tool descobre o valor. So entram aqui campos cujo
 * significado e o mesmo em qualquer tool.
 */
const REQUIRED_FIELD_HINTS = {
  ticket_number: 'Informe ticket_number com o número do ticket (ex: "12345"). Para achar o número, use list_tickets.',
  client_id: 'Informe client_id com o ID do cliente. Para achar o ID, use search_client (por nome) ou list_clients.',
  requestor_id: 'Informe requestor_id com o ID do solicitante. Para achar o ID, use list_requestors (com o client_id) ou search_requestor.',
  // Nos slices de endereço e contato o parâmetro se chama `id`: eles passam estas dicas explicitamente.
  address_id: 'Informe o ID do endereço do cliente. Para achar o ID, use list_client_addresses com o client_id.',
  contact_id: 'Informe o ID do contato do cliente. Para achar o ID, use list_client_contacts com o client_id.',
  contract_id: 'Informe contract_id com o ID do contrato (inteiro positivo). Para achar o ID, use list_contracts (linha sem "· grupo").',
  contract_group_id: 'Informe contract_group_id com o ID do grupo de contrato (inteiro positivo). Para achar o ID, use list_contracts (linha "· grupo").',
  knowledge_id: 'Informe knowledge_id com o ID do conhecimento. Para achar o ID, use list_knowledges.',
  folder_id: 'Informe folder_id com o ID da pasta de conhecimento. Para achar o ID, use list_knowledge_folders.',
  reminder_id: 'Informe reminder_id com o ID do lembrete de consumo (inteiro positivo). Para achar o ID, use list_consumption_reminders com o dono do lembrete (contract_id ou contract_group_id).',
  entity_id: 'Informe entity_id com o ID do campo personalizado (entity). Para achar o ID, use list_entities.',
  entity_field_id: 'Informe entity_field_id com o ID do subcampo. Para achar o ID, use list_entity_fields com o entity_id.',
  equipment_id: 'Informe equipment_id com o ID do recurso (equipamento). Para achar o ID, use list_equipments.',
  technical_group_id: 'Informe technical_group_id com o ID do grupo de atendentes. Para achar o ID, use list_technical_groups.',
  role_group_id: 'Informe role_group_id com o ID do grupo de permissões. Para achar o ID, use list_role_groups.'
};

/**
 * Dicas para o parâmetro genérico `id` (usuário, chat, entity, catálogo...). `id`
 * significa uma coisa diferente em cada tool, então NÃO entra em
 * REQUIRED_FIELD_HINTS: o slice passa a dica explicitamente, como já faz com
 * `address_id`/`contact_id`.
 */
const ID_PARAM_HINTS = {
  user: 'Informe id com o ID do usuário (inteiro). Para achar o ID, use search_user (por nome).',
  chat: 'Informe id com o ID do chat (inteiro positivo). Para achar o ID, use list_my_chats, list_inbox_chats ou list_in_attendance_chats.',
  entity: 'Informe id com o ID do campo personalizado (entity). Para achar o ID, use list_entities.',
  entity_field: 'Informe id com o ID do subcampo. Para achar o ID, use list_entity_fields com o entity_id.',
  entity_field_option: 'Informe id com o ID da opção do subcampo. Para achar o ID, use list_entity_field_options com o entity_field_id.',
  services_catalog: 'Informe id com o ID do catálogo de serviços. Para achar o ID, use list_services_catalogs.',
  services_catalog_area: 'Informe id com o ID da área. Para achar o ID, use list_services_catalog_areas com o catálogo.',
  services_catalog_item: 'Informe id com o ID do item de catálogo. Para achar o ID, use list_services_catalog_items com a área.'
};

function requireField(args, field, message = null, { hint } = {}) {
  const value = args && args[field];
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(message || `${field} é obrigatório`, { hint: hint || REQUIRED_FIELD_HINTS[field] });
  }
  return value;
}

/**
 * Coage `value` para inteiro positivo de forma ESTRITA: aceita um number já
 * inteiro (>= 0) ou uma string só-dígitos; rejeita NaN, frações e strings
 * formatadas. Existe para write ops nunca enviarem valor corrompido à API por
 * coerção silenciosa de input externo — `parseInt('+55 11 99999-9999')` daria
 * `55` (truncado, não NaN) e `parseInt('abc')` daria NaN que vira `null` no
 * JSON. Lança Error com mensagem específica do campo.
 */
function parseIntStrict(value, field, { hint } = {}) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  // Sem hint explicito, usa a dica padrao do campo (A1): o agente recebe "Como resolver" tambem no malformado.
  throw new ValidationError(`${field} deve ser um número inteiro válido`, { hint: hint || REQUIRED_FIELD_HINTS[field] });
}

/** requireField + parseIntStrict num passo só (campo obrigatório e numérico). */
function requireIntField(args, field, message = null, { hint } = {}) {
  requireField(args, field, message, { hint });
  return parseIntStrict(args[field], field, { hint });
}

/**
 * Normaliza o numero de ticket vindo do chamador: aceita "123", 123 e "#123"
 * (com espacos nas bordas) e devolve a string so-digitos. Qualquer outra coisa
 * ("6136?offset=2", "12/reopen") → null: o slice responde erro local sem chamar a
 * API (o valor vira path param na URL). H29.
 * @param {string|number} value
 * @returns {string|null}
 */
function normalizeTicketNumber(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^#/, '');
  return /^\d+$/.test(cleaned) ? cleaned : null;
}

/**
 * requireField + normalizeTicketNumber: o `ticket_number` vira path param na URL,
 * então valor malformado ("1/../2", "1?x=1", objeto) lança ValidationError com a
 * dica padrão em vez de seguir para a API. Devolve a string só-dígitos.
 */
function requireTicketNumber(args, field = 'ticket_number') {
  requireField(args, field);
  const normalized = normalizeTicketNumber(args[field]);
  if (!normalized) {
    throw new ValidationError(`${field} deve ser só o número do ticket (ex: "12345" ou "#12345")`, { hint: REQUIRED_FIELD_HINTS.ticket_number });
  }
  return normalized;
}

/**
 * ID de sub-recurso que vira path param na URL (communication_id, answer_id,
 * file_id...): requireField + inteiro positivo estrito. Aceita number inteiro >= 1
 * ou string só-dígitos (bordas aparadas); qualquer outra coisa ("..", "abc",
 * "1/../2", "0") lança ValidationError com a dica do campo, sem chamar a API —
 * `encodeURIComponent` não neutraliza ".." (PUT /tickets/{n}/internal_communications/..
 * resolveria para PUT /tickets/{n}/). Devolve a string só-dígitos.
 */
function requirePathIdField(args, field, { hint } = {}) {
  requireField(args, field, null, { hint });
  const value = args[field];
  let normalized = null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) normalized = String(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value.trim()) > 0) normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${field} deve ser um número inteiro positivo (ex: "123")`, { hint: hint || REQUIRED_FIELD_HINTS[field] });
  }
  return normalized;
}

/** Data no formato YYYY-MM-DD, com ano/mês/dia capturados. */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Ano/mês/dia formam uma data que existe no calendário (rejeita 2026-02-30 e mês 13).
 * Extraído para cá quando o 3º slice passou a precisar (base_date de contratos,
 * date de reajustes e o período de apontamentos).
 */
function isRealDate(y, m, d) {
  const [year, month, day] = [y, m, d].map(Number);
  // setUTCFullYear em vez de Date.UTC: Date.UTC lê anos 0–99 como 1900–1999.
  const dt = new Date(0);
  dt.setUTCFullYear(year, month - 1, day);
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

module.exports = { REQUIRED_FIELD_HINTS, ID_PARAM_HINTS, ISO_DATE_PATTERN, isRealDate, ValidationError, isValidationError, requireField, parseIntStrict, requireIntField, normalizeTicketNumber, requireTicketNumber, requirePathIdField };

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
  reminder_id: 'Informe reminder_id com o ID do lembrete de consumo (inteiro positivo). Para achar o ID, use list_consumption_reminders com o dono do lembrete (contract_id ou contract_group_id).'
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
  throw new ValidationError(`${field} deve ser um número inteiro válido`, { hint });
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
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? String(value) : null;
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

module.exports = { REQUIRED_FIELD_HINTS, ValidationError, isValidationError, requireField, parseIntStrict, requireIntField, normalizeTicketNumber, requireTicketNumber };

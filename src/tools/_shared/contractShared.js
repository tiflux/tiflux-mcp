/**
 * Helpers compartilhados pelos slices de contrato (`src/tools/contracts/`).
 *
 * Extraidos no pos-review do PR #109 (SonarCloud: duplicacao em codigo novo):
 * get_contract, get_contract_group, get_contract_usage, list_contracts e
 * list_contract_types repetiam os mesmos blocos de erro da API v2 (licenca
 * 40304, acesso negado 40301, "Codigo/Mensagem" de 404/422, payload
 * inesperado) e os mesmos formatadores do cadastro (desconto do aditivo,
 * faturamento, lembrete de consumo, cabecalho do ultimo aditivo). O texto de
 * cada mensagem continua contextual (titulo e dica vem do slice) — aqui fica
 * so o esqueleto, byte a byte igual ao que cada slice montava antes.
 */

const { errorResponse } = require('./errors');
const { currencyBRL } = require('./format');
const { requireIntField } = require('./validators');

/** Dica padrao de permissao das mensagens de acesso negado (40301). */
const CONTRACTS_PERMISSION_HINT =
  '*Verifique se o usuário possui a permissão "Visualizar contratos" e se a organização tem Licença Tickets.*';

/** 403/40304 — organizacao sem Licenca Tickets (mesmo texto em todas as tools de contrato). */
function contractsLicenseErrorResponse() {
  return errorResponse(
    '**❌ Sem licença para visualizar contratos**\n\n' +
    'Sua organização não possui licença ativa para o módulo de tickets (erro 40304).\n\n' +
    '*Entre em contato com o suporte TiFlux para verificar o licenciamento.*'
  );
}

function apiErrorBody(title, codeText, response, hint) {
  return errorResponse(
    `**❌ ${title}**\n\n` +
    `**Código:** ${codeText}\n` +
    `**Mensagem:** ${response.error}\n\n` +
    hint
  );
}

/**
 * Erro da API com o corpo "Codigo / Mensagem" + dica contextual (404, 422...).
 *
 * @param {string} title - titulo sem marcacao (ex: "Contrato #12 não encontrado")
 * @param {{status: number|string, error: string}} response
 * @param {string} hint - cauda em Markdown (pode incluir blocos extras antes da dica)
 */
function contractApiErrorResponse(title, response, hint) {
  return apiErrorBody(title, `${response.status}`, response, hint);
}

/** 403/40301 — usuario sem permissao; codigo sai como "<status> (erro <errorCode|N/A>)". */
function contractsAccessDeniedResponse(title, response, errorCode, hint = CONTRACTS_PERMISSION_HINT) {
  return apiErrorBody(title, `${response.status} (erro ${errorCode || 'N/A'})`, response, hint);
}

/**
 * ID de contrato/grupo validado estritamente (inteiro >= 1) antes de virar
 * path na URL — honra o `type: number` do schema e nunca interpola argumento
 * MCP cru em /contracts/{id} ou /contract-groups/{id}. `parseIntStrict` aceita
 * 0; o schema promete "inteiro positivo" — 0 nunca e um ID valido.
 */
function requirePositiveIdField(args, field) {
  const id = requireIntField(args, field);
  if (id < 1) {
    throw new Error(`${field} deve ser um número inteiro positivo`);
  }
  return id;
}

/** Sucesso HTTP mas `data` nao e um objeto (detalhe/consumo esperam objeto, nunca array). */
function isObjectPayload(data) {
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data);
}

/**
 * Resposta para sucesso sem payload utilizavel.
 *
 * @param {string} what - o que se buscava (ex: "contrato #12", "grupo de contrato #3")
 * @param {string} missing - complemento de "sem os dados ..." (ex: "do contrato")
 * @param {string} existsHint - sujeito da dica final (ex: "o contrato #12")
 */
function unexpectedPayloadResponse(what, missing, existsHint) {
  return errorResponse(
    `**⚠️ Resposta inesperada ao buscar ${what}**\n\n` +
    `A API retornou sucesso mas sem os dados ${missing}.\n\n` +
    `*Verifique se ${existsHint} existe.*`
  );
}

/**
 * Desconto do aditivo: R$ quando discount_type "currency", % quando
 * "percentage" (enum real do model `contract_rider.rb`: `currency: 0,
 * percentage: 1` — A4/H1); "percent" continua aceito por seguranca (valor que
 * nunca existiu no enum, mas a fixture antiga usava). Cru nos demais casos.
 */
function discountCell(discount_type, discount_value) {
  if (discount_value === null || discount_value === undefined) return '—';
  if (discount_type === 'currency') return currencyBRL(discount_value);
  if (discount_type === 'percentage' || discount_type === 'percent') return `${discount_value}%`;
  return String(discount_value);
}

/** Faturamento de contrato/grupo: automatico (com N dias) > em lote > "—". */
function formatBilling(record) {
  if (record.automatic_billing) {
    const days = record.billing_days_before;
    const hasDays = days !== null && days !== undefined;
    const suffix = hasDays ? ` (${days} dias antes do vencimento)` : '';
    return `Automático${suffix}`;
  }
  if (record.billing_in_batch) return 'Em lote';
  return '—';
}

function formatConsumptionReminder(reminder) {
  if (!reminder || !reminder.notification) return 'Desativado';
  const percent = reminder.percent !== null && reminder.percent !== undefined ? `${reminder.percent}%` : '—';
  const emails = reminder.emails || '—';
  return `Ativo — alerta em ${percent} de consumo; e-mails: ${emails}`;
}

/** Cabecalho comum do bloco "Último aditivo" (titulo, numero/versao, vencimento, valor mensal). */
function lastRiderHeaderLines(lastRider) {
  return [
    '### Último aditivo',
    `- Número: ${lastRider.rider_number ?? '—'} · versão ${lastRider.release ?? '—'}`,
    `- Vencimento: dia ${lastRider.due_day ?? '—'}`,
    `- Valor mensal: ${currencyBRL(lastRider.value)}`
  ];
}

module.exports = {
  CONTRACTS_PERMISSION_HINT,
  contractsLicenseErrorResponse,
  contractApiErrorResponse,
  contractsAccessDeniedResponse,
  requirePositiveIdField,
  isObjectPayload,
  unexpectedPayloadResponse,
  discountCell,
  formatBilling,
  formatConsumptionReminder,
  lastRiderHeaderLines
};

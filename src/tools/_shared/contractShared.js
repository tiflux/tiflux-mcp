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
const { currencyBRL, appendWithinBudget } = require('./format');
const { formatFileSize, escapeCell } = require('./markdown');
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

/** Escopo do alerta de consumo (`consumption_reminders[].alert_scope`); desconhecido sai cru. */
const ALERT_SCOPE_LABELS = {
  contract_and_shifts: 'Contrato e deslocamentos',
  contract_only: 'Só contrato',
  shifts_only: 'Só deslocamentos'
};

function formatReminderItem(r) {
  const scope = ALERT_SCOPE_LABELS[r.alert_scope] || r.alert_scope || '—';
  const percentages = Array.isArray(r.percentages) && r.percentages.length > 0
    ? r.percentages.map(p => `${p}%`).join(', ')
    : '—';
  const emails = Array.isArray(r.emails) && r.emails.length > 0 ? r.emails.join(', ') : '—';
  return `- ${scope} — alerta em ${percentages} de consumo; e-mails: ${emails}`;
}

/**
 * Lembrete(s) de consumo. Prefere o array `consumption_reminders[]` (multiplos
 * alertas, snapshot 2026-10-22): um alerta por linha com escopo, percentuais e
 * e-mails. Array ausente ou vazio cai no campo singular `consumption_reminder`
 * (que so reflete um alerta) — compatibilidade com APIs/mocks antigos.
 *
 * @param {object|null} reminder - `consumption_reminder` (singular)
 * @param {Array} [reminders] - `consumption_reminders[]`
 */
function formatConsumptionReminder(reminder, reminders) {
  if (Array.isArray(reminders) && reminders.length > 0) {
    const label = reminders.length === 1 ? '1 alerta' : `${reminders.length} alertas`;
    return `${label}\n${reminders.map(formatReminderItem).join('\n')}`;
  }
  if (!reminder || !reminder.notification) return 'Desativado';
  const percent = reminder.percent !== null && reminder.percent !== undefined ? `${reminder.percent}%` : '—';
  const emails = reminder.emails || '—';
  return `Ativo — alerta em ${percent} de consumo; e-mails: ${emails}`;
}

// Teto local de cada lista longa do cadastro (avisos, deslocamentos, anexos) — evita
// que 100 anexos com URL assinada (~400 caracteres cada) ou centenas de destinatarios
// de aviso estourem sozinhos a resposta. As 3 listas somam no maximo 3x este teto.
const EXTRAS_LIST_BUDGET = 15000;

/** Quando disparam os avisos de um destinatario (`notifications[]`). */
function notificationTriggers(n) {
  const triggers = [];
  if (n.readjust) triggers.push('reajuste');
  if (n.cancellation) triggers.push('vencimento');
  return triggers.length > 0 ? triggers.join(' e ') : 'sem aviso ativo';
}

function formatNotificationItem(n) {
  const hasPeriod = n.period !== null && n.period !== undefined;
  const days = hasPeriod ? `${n.period} dias antes` : '—';
  return `- ${escapeCell(n.email || '—')} · ${days} · ${notificationTriggers(n)}\n`;
}

/**
 * Avisos de vencimento e reajuste (`notifications[]`): e-mail avisado `period`
 * dias antes do fim da vigencia do ultimo aditivo (`readjust`) e/ou da
 * `expiration_date` (`cancellation`). Nao confundir com o lembrete de consumo.
 * Ausente (nao array) → `''` (secao omitida); vazio → linha "nenhum".
 */
function formatContractNotifications(list) {
  if (!Array.isArray(list)) return '';
  if (list.length === 0) return '**Avisos de vencimento e reajuste:** nenhum\n';
  return boundedList('Avisos de vencimento e reajuste', list.map(formatNotificationItem), 'avisos');
}

function formatShiftItem(s) {
  const qtd = s.qtd_per_period;
  const included = qtd === 0 ? 'nenhum incluso' : `${qtd ?? '—'} inclusos por período`;
  return `- ${escapeCell(s.name || '—')} (#${s.id ?? '—'}) · ${currencyBRL(s.value)} por deslocamento · ${included}\n`;
}

/** Lista de itens com teto proprio e aviso "+N <unidade> nao exibidos". */
function boundedList(title, items, noun) {
  const fit = appendWithinBudget(items, { maxChars: EXTRAS_LIST_BUDGET });
  const notice = fit.truncated ? `\n_+${items.length - fit.shown} ${noun} não exibidos._\n` : '';
  return `**${title} (${items.length})**\n${items.slice(0, fit.shown).join('')}${notice}`;
}

/**
 * Deslocamentos ativos (`shifts[]`). `qtd_per_period` e a quantidade inclusa
 * no periodo (excedente cobrado por `value`); `value` vem "--" sem a permissao
 * de valores e passa cru. Ausente → `''`; vazio → "nenhum".
 */
function formatContractShifts(list) {
  if (!Array.isArray(list)) return '';
  if (list.length === 0) return '**Deslocamentos ativos:** nenhum\n';
  return boundedList('Deslocamentos ativos', list.map(formatShiftItem), 'deslocamentos');
}

function formatFileItem(f) {
  const contentType = f.content_type ? escapeCell(f.content_type) : null;
  const meta = [contentType, typeof f.size === 'number' ? formatFileSize(f.size) : null].filter(Boolean).join(', ');
  const suffix = meta ? ` (${meta})` : '';
  // URL nao passa por escapeCell (escapar `|` corromperia o link assinado); so
  // remove quebras de linha, que uma URL valida nunca contem (RFC 3986).
  const urlLine = f.url ? `  ${String(f.url).replace(/[\r\n]+/g, '')}\n` : '';
  return `- ${escapeCell(f.file_name || '—')}${suffix}\n${urlLine}`;
}

/**
 * Anexos do contrato (`files[]`). A `url` e assinada e expira — nota unica no
 * fim da secao. Ausente → `''`; vazio → "nenhum".
 */
function formatContractFiles(list) {
  if (!Array.isArray(list)) return '';
  if (list.length === 0) return '**Anexos:** nenhum\n';
  const body = boundedList('Anexos', list.map(formatFileItem), 'anexos');
  return `${body}_Links temporários — consulte o contrato de novo para obter um link válido._\n`;
}

/** Secoes extras do cadastro em `rich` (avisos, deslocamentos, anexos), separadas por linha em branco. */
function formatContractExtrasRich(record) {
  return [
    formatContractNotifications(record.notifications),
    formatContractShifts(record.shifts),
    formatContractFiles(record.files)
  ].filter(Boolean).join('\n');
}

/** Secoes extras (rich) como linhas de `lines.join('\n')`, precedidas de linha em branco; `[]` se nada veio. */
function contractExtrasLines(record) {
  const extras = formatContractExtrasRich(record);
  return extras ? ['', extras] : [];
}

/** Linha de contagens do `compact`; `''` quando os tres arrays faltam. */
function formatContractExtrasCompact(record) {
  const count = (list) => (Array.isArray(list) ? list.length : null);
  const parts = [
    ['Deslocamentos', count(record.shifts)],
    ['Anexos', count(record.files)],
    ['Avisos', count(record.notifications)]
  ].filter(([, n]) => n !== null).map(([label, n]) => `${label}: ${n}`);
  return parts.join(' · ');
}

/** Dica de 404 em /contracts/{id}*: ID inexistente OU contrato-membro de grupo. */
function contractNotFoundHint(id, groupAction = 'use `get_contract_group`') {
  return `*Isto acontece quando o ID não existe OU quando o contrato #${id} é MEMBRO de um grupo de ` +
    `contrato (modalidade Compartilhado) — contratos-membro são consultados pelo grupo, não individualmente. ` +
    `Se for este o caso, ${groupAction} com o ID do grupo (coluna "· grupo" em \`list_contracts\`). ` +
    `IDs de contrato e de grupo são independentes e podem colidir.*`;
}

/** Dica de 404 em /contract-groups/{id}*: o ID precisa ser de grupo. */
const GROUP_NOT_FOUND_HINT =
  '*O ID precisa vir de uma linha "· grupo" de `list_contracts` — grupos e contratos têm IDs ' +
  'independentes, e um ID de contrato comum não serve aqui.*';

/**
 * Pagina pedida veio vazia mas o filtro tem resultados em outras paginas
 * (C2/H15) — distingue de "nenhum resultado". `total` > 0 e conhecido.
 */
function pageBeyondEndMessage(offset, limit, total, unit) {
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  return `*Página ${offset} está além do fim: ${total} ${unit} no total, última página ${lastPage} (limit ${limit}).*`;
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
  formatContractNotifications,
  formatContractShifts,
  formatContractFiles,
  contractExtrasLines,
  formatContractExtrasCompact,
  lastRiderHeaderLines,
  contractNotFoundHint,
  GROUP_NOT_FOUND_HINT,
  pageBeyondEndMessage
};

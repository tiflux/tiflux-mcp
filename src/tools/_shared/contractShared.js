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

const { errorResponse, extractApiErrorCode, extractApiErrorDetail, formatApiErrorDetail } = require('./errors');
const { currencyBRL, appendWithinBudget } = require('./format');
const { formatFileSize, escapeCell } = require('./markdown');
const { requireIntField, ValidationError } = require('./validators');

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
    throw new ValidationError(`${field} deve ser um número inteiro positivo`);
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

// ---------------------------------------------------------------------------
// Lembretes de consumo (list/create/update_consumption_reminder).
// Rotas: /contracts/{id}/consumption-reminders e /contract-groups/{id}/consumption-reminders.
// Regras conferidas contra a Swagger 2026-11-10 e validacao viva na base de teste.
// ---------------------------------------------------------------------------

const REMINDER_ALERT_SCOPES = ['contract_only', 'shifts_only', 'contract_and_shifts'];
const REMINDER_PERCENT_MIN = 1;
const REMINDER_PERCENT_MAX = 999;
const REMINDER_MAX_PERCENTAGES = 10;

/** Props de schema do dono do lembrete (exatamente um dos dois). */
const REMINDER_OWNER_SCHEMA_PROPS = {
  contract_id: {
    type: 'number',
    description: 'ID do contrato dono do lembrete (Crédito, Horas, Por atendimento ou Horas cumulativas). Informe este OU contract_group_id. Contrato-membro de grupo não tem lembrete próprio: use o grupo.'
  },
  contract_group_id: {
    type: 'number',
    description: 'ID do grupo de contrato (Compartilhado) dono do lembrete — linha "· grupo" de list_contracts. Informe este OU contract_id.'
  }
};

/**
 * Dono do lembrete: exatamente um entre `contract_id` e `contract_group_id`.
 * @returns {{ownerType: 'contracts'|'contract-groups', ownerId: number, label: string}}
 */
function resolveReminderOwner(args) {
  const hasContract = args?.contract_id !== undefined && args?.contract_id !== null;
  const hasGroup = args?.contract_group_id !== undefined && args?.contract_group_id !== null;
  if (hasContract === hasGroup) {
    throw new ValidationError('Informe exatamente um dono do lembrete: contract_id (contrato) OU contract_group_id (grupo de contrato).');
  }
  if (hasContract) {
    const id = requirePositiveIdField(args, 'contract_id');
    return { ownerType: 'contracts', ownerId: id, label: `contrato #${id}` };
  }
  const id = requirePositiveIdField(args, 'contract_group_id');
  return { ownerType: 'contract-groups', ownerId: id, label: `grupo de contrato #${id}` };
}

/** Converte um percentual (inteiro ou string so-digitos) para numero; null quando invalido. */
function toReminderPercent(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Rotulo seguro de um item invalido para a mensagem de erro (sem `[object Object]`, sem Markdown cru). */
function describeInvalidItem(item) {
  if (item === null) return 'um valor null';
  if (Array.isArray(item)) return 'uma lista';
  if (typeof item === 'object') return 'um objeto';
  return `\`${String(item).slice(0, 40).replaceAll('`', "'")}\``;
}

/** Valida `percentages`. Devolve { value } ou { error }. */
function normalizeReminderPercentages(raw) {
  if (!Array.isArray(raw)) return { error: '`percentages` deve ser uma lista de inteiros (ex.: [50, 80]).' };
  if (raw.length > REMINDER_MAX_PERCENTAGES) {
    return { error: `No máximo ${REMINDER_MAX_PERCENTAGES} percentuais por lembrete (recebidos ${raw.length}).` };
  }
  const values = [];
  for (const item of raw) {
    const n = toReminderPercent(item);
    if (n === null) return { error: `\`percentages\` aceita só inteiros: ${describeInvalidItem(item)} não é inteiro.` };
    if (n < REMINDER_PERCENT_MIN || n > REMINDER_PERCENT_MAX) {
      return { error: `Percentual ${n} fora da faixa: use inteiros de ${REMINDER_PERCENT_MIN} a ${REMINDER_PERCENT_MAX} (acima de 100 avisa o excedente).` };
    }
    if (values.includes(n)) return { error: `Percentual ${n} repetido: cada percentual só pode aparecer uma vez.` };
    values.push(n);
  }
  return { value: values };
}

/** E-mail plausivel (sem regex com backtracking): 1 "@", sem espaco, dominio com "." interno. */
function isPlausibleEmail(email) {
  if (/\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2 || parts[0] === '') return false;
  const domain = parts[1];
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

const BLANK_EMAIL_ERROR = '`emails` tem entrada vazia ou só com espaços. Para desativar o lembrete de propósito, envie `emails: []`; ' +
  'para manter os destinatários, envie a lista completa de e-mails.';

/**
 * Valida `emails` (lista ou texto separado por virgula). Entrada em branco e erro
 * (nunca vira `[]` em silencio, o que apagaria os destinatarios); so `[]` literal
 * esvazia a lista. No texto, segmentos vazios entre virgulas sao ignorados, mas o
 * texto sem nenhum e-mail e erro. Devolve { value } ou { error }.
 */
function normalizeReminderEmails(raw) {
  const isText = typeof raw === 'string';
  const list = isText ? raw.split(',') : raw;
  if (!Array.isArray(list)) return { error: '`emails` deve ser uma lista de e-mails.' };
  const values = [];
  for (const item of list) {
    if (typeof item !== 'string') return { error: '`emails` deve conter só textos de e-mail.' };
    const email = item.trim();
    if (email === '') {
      if (isText) continue;
      return { error: BLANK_EMAIL_ERROR };
    }
    if (!isPlausibleEmail(email)) return { error: `E-mail inválido: "${email}".` };
    values.push(email);
  }
  if (isText && values.length === 0) return { error: BLANK_EMAIL_ERROR };
  return { value: values };
}

/**
 * Body do lembrete montado SO com a allow-list `percentages`/`emails`/`alert_scope`
 * (a API responde 400 40001 para chave desconhecida). Devolve { body } ou { error }.
 */
function buildReminderBody(args) {
  const body = {};
  if (args.percentages !== undefined) {
    const r = normalizeReminderPercentages(args.percentages);
    if (r.error) return r;
    body.percentages = r.value;
  }
  if (args.emails !== undefined) {
    const r = normalizeReminderEmails(args.emails);
    if (r.error) return r;
    body.emails = r.value;
  }
  if (args.alert_scope !== undefined) {
    if (!REMINDER_ALERT_SCOPES.includes(args.alert_scope)) {
      return { error: `\`alert_scope\` inválido: use ${REMINDER_ALERT_SCOPES.join(', ')}.` };
    }
    body.alert_scope = args.alert_scope;
  }
  return { body };
}

/** Erro local de lembrete (sem request). */
function reminderValidationResponse(title, message) {
  return errorResponse(`**❌ ${title}**\n\n${message}`);
}

/** Textos fixos (em ingles) de `detail.base` mapeados para orientacao em portugues. */
const REMINDER_BASE_ERRORS = [
  ['Limit of 10 reminders per', 'O dono já tem 10 lembretes (limite da API). Edite um existente com `update_consumption_reminder`.'],
  ['Shift reminders are only available', 'Escopo de deslocamento (`shifts_only`/`contract_and_shifts`) só vale em contratos de Horas, Por atendimento e Horas cumulativas. Em Crédito e em grupo de contrato, use `alert_scope: "contract_only"`.'],
  ['only available for consumption contracts', 'A modalidade deste contrato não tem consumo (ex.: Livre, Recorrente), então não aceita lembrete. Só Crédito, Horas, Por atendimento, Horas cumulativas e grupo Compartilhado.']
];

function reminderBaseMessages(detail) {
  const base = [detail?.base].flat().filter(m => typeof m === 'string');
  return base.map(msg => {
    const known = REMINDER_BASE_ERRORS.find(([fragment]) => msg.includes(fragment));
    return known ? `• ${known[1]}` : `• ${msg}`;
  });
}

/**
 * Erro da API nas tools de lembrete.
 * @param {object} response - resposta de erro
 * @param {{title: string, write: boolean}} ctx - titulo contextual; write=true para POST/PUT
 */
function reminderApiErrorResponse(response, { title, write }) {
  const errorCode = extractApiErrorCode(response);
  if (errorCode === 40304) return contractsLicenseErrorResponse();
  if (errorCode === 40301 || response.status === 403) {
    const permission = write ? 'Gerenciar contratos' : 'Visualizar contratos';
    return contractsAccessDeniedResponse(title, response, errorCode,
      `*Esta operação exige a permissão "${permission}" (usuário-cliente não tem acesso a lembretes). ` +
      'A API também responde 403 quando o contrato/grupo não pertence à sua organização — confira o ID em `list_contracts`.*');
  }
  if (errorCode === 40401 || response.status === 404) {
    return contractApiErrorResponse(`${title}: não encontrado`, response,
      '*Isto acontece quando: (1) o contrato/grupo não existe ou é de outra organização; (2) o contrato é MEMBRO de um ' +
      'grupo Compartilhado — o lembrete fica no grupo (ache o grupo na linha "· grupo" de `list_contracts` — `get_contract_group` lista os membros — e use `contract_group_id`); ou ' +
      '(3) o lembrete não pertence a esse dono (confira os IDs com `list_consumption_reminders`).*');
  }
  if (response.status === 422) {
    const detail = extractApiErrorDetail(response);
    const baseLines = reminderBaseMessages(detail);
    const otherFields = detail ? Object.keys(detail).filter(k => k !== 'base') : [];
    const fieldBlock = otherFields.length > 0 ? formatApiErrorDetail({ data: { detail: Object.fromEntries(otherFields.map(k => [k, detail[k]])) } }) : '';
    const body = [baseLines.join('\n'), fieldBlock].filter(Boolean).join('\n');
    return contractApiErrorResponse(title, response, body || '*Verifique os dados informados.*');
  }
  return contractApiErrorResponse(title, response, '*Verifique os dados informados e suas permissões.*');
}

/** Linha de um lembrete com ID (reusa o formatador do get_contract). */
function formatReminderWithId(r) {
  return formatReminderItem(r).replace(/^- /, `- #${r.id ?? '—'} · `);
}

/** Avisos do resumo de create/update: lembrete so dispara com percentual E e-mail. */
function reminderReadinessNotes(reminder, { percentagesSent }) {
  const notes = [];
  const hasPercent = Array.isArray(reminder.percentages) && reminder.percentages.length > 0;
  const hasEmail = Array.isArray(reminder.emails) && reminder.emails.length > 0;
  if (!hasPercent || !hasEmail) {
    let missing = 'percentual e e-mail';
    if (hasPercent) missing = 'e-mail';
    else if (hasEmail) missing = 'percentual';
    notes.push(`⚠️ Este lembrete está salvo mas **não dispara**: falta ${missing}. Ele só dispara com ao menos um percentual e um e-mail.`);
  }
  if (percentagesSent && hasPercent) {
    notes.push('Percentuais já ultrapassados no ciclo atual não disparam retroativamente; passam a valer a partir do próximo ciclo.');
  }
  return notes;
}

/** Resumo de um lembrete criado/atualizado (estado devolvido pela API — e-mails ja normalizados). */
function formatReminderSaved(heading, ownerLabel, reminder, { percentagesSent }) {
  const r = isObjectPayload(reminder) ? reminder : {};
  const lines = [
    `**✅ ${heading}**`,
    '',
    `**Dono:** ${ownerLabel}`,
    formatReminderWithId(r)
  ];
  const notes = reminderReadinessNotes(r, { percentagesSent });
  if (notes.length > 0) lines.push('', ...notes.map(n => `*${n}*`));
  return lines.join('\n');
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
  pageBeyondEndMessage,
  REMINDER_ALERT_SCOPES,
  REMINDER_OWNER_SCHEMA_PROPS,
  resolveReminderOwner,
  buildReminderBody,
  reminderValidationResponse,
  reminderApiErrorResponse,
  formatReminderWithId,
  formatReminderSaved
};

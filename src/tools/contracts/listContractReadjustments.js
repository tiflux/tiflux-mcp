/**
 * Slice: list_contract_readjustments — quadro de reajuste de contratos.
 *
 * Endpoint: GET /contracts/readjustments (via api.listContractReadjustments).
 *
 * Lista contratos e grupos de contrato cujo aditivo vigente encerra ate o fim
 * do mes de `date`, com os valores desse aditivo (base do calculo do
 * reajuste). `date` e obrigatorio e validado localmente (a API so aceita
 * `YYYY-MM-DD` — recusa `2027-04` e `20270430`).
 *
 * Permissao: role billing ("Faturar servicos avulsos e contratos") — a MESMA
 * de get_billings_history, nao a de contratos. Varre a organizacao inteira.
 *
 * Particularidades do payload: `contract_type` vem sem `id` e `modality` vem
 * como texto traduzido ("Hours", "Saas/Product") — exibido como veio, sem
 * passar por modalityLabel. `expiration_date` costuma vir null: a coluna so
 * aparece quando alguma linha da pagina tem valor.
 *
 * Orcamento: tabela + bloco por linha (campos da modalidade != 0, itens e
 * membros) cortados no mesmo item com continuacao offset/limit — mesmo padrao
 * de list_contracts com include_details. Itens e membros de cada linha tem
 * teto proprio (appendWithinBudget) com aviso "+N nao exibidos".
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, extractApiErrorCode, apiFailureResponse, internalErrorResponse, formatApiErrorDetail } = require('../_shared/errors');
const {
  footer, pagination, currencyBRL, appendWithinBudget, renderWithinBudget, continuationLine, RESPONSE_ITEM_BUDGET
} = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { parseIntStrict } = require('../_shared/validators');
const { escapeCell } = require('../_shared/markdown');
const { contractsLicenseErrorResponse, contractApiErrorResponse, pageBeyondEndMessage } = require('../_shared/contractShared');

const OFFSET_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const LIMIT_DEFAULT = 20;
// Teto por linha para a lista de itens/membros de um contrato/grupo.
const ROW_LIST_BUDGET = 1500;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CSV_INT_PATTERN = /^\d+$/;

const BILLING_PERMISSION_HINT =
  '*O quadro de reajuste exige a permissão "Faturar serviços avulsos e contratos" (a mesma do histórico de ' +
  'faturamentos — não basta "Visualizar contratos") e licença de Tickets. Verifique suas permissões com o administrador.*';

// Campos da modalidade exibidos no bloco por linha quando != 0.
const RIDER_FIELDS = [
  ['surplus_hour_value', 'hora excedente'],
  ['surplus_ticket_value', 'atendimento excedente'],
  ['external_value', 'hora externa'],
  ['internal_value', 'hora interna'],
  ['remote_value', 'hora remota'],
  ['additional_equipment_value', 'equipamento adicional']
];

const schema = {
  name: 'list_contract_readjustments',
  description: 'Quadro de reajuste de contratos (somente leitura): lista contratos e grupos de contrato cujo aditivo vigente encerra até o fim do mês de `date`, com os valores desse aditivo — a base do cálculo do reajuste. Use para perguntas como "quais contratos entram em reajuste até novembro e com que valor base?". Retorna tabela com ID ("<id> · grupo" para grupo de contrato — IDs de grupo e de contrato são independentes), Nome, Cliente, Tipo, Modalidade (texto como a API devolve), Fim do aditivo, Valor e Taxa (e Expiração, só quando alguma linha tiver); depois, um bloco por linha só com os campos da modalidade diferentes de zero (hora excedente, atendimento excedente, hora externa/interna/remota, equipamento adicional), os itens do aditivo (SaaS/Produto) e, nos grupos, os contratos-membro. `date` é obrigatório no formato YYYY-MM-DD (ex: "2026-11-30"). Filtros opcionais: client_ids (IDs separados por vírgula) e contract_type_id. limit/offset: 1-200 (padrão 20); página além do fim avisa qual é a última. Valores vêm "--" sem a permissão "Visualizar valores dos tickets". Requer a permissão "Faturar serviços avulsos e contratos" (a mesma de get_billings_history, não a de contratos) + Licença Tickets; varre a organização inteira.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Data-base do reajuste, formato YYYY-MM-DD (ex: "2026-11-30"). Entram os contratos/grupos cujo aditivo vigente encerra até o fim do mês dessa data. Obrigatório.'
      },
      client_ids: {
        type: 'string',
        description: 'Filtrar por clientes: IDs inteiros separados por vírgula (ex: "982,2"). Opcional.'
      },
      contract_type_id: {
        type: 'number',
        description: 'Filtrar por um tipo de contrato (ID de list_contract_types). Opcional.'
      },
      ...paginationSchemaProperties()
    },
    required: ['date']
  }
};

function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d);
}

function validateDate(date) {
  if (date === undefined || date === null || date === '') throw new Error('date é obrigatório (formato YYYY-MM-DD)');
  const match = DATE_PATTERN.exec(String(date));
  if (!match) throw new Error('date deve estar no formato YYYY-MM-DD (ex: "2026-11-30")');
  if (!isRealDate(match[1], match[2], match[3])) throw new Error('date deve ser uma data real (YYYY-MM-DD)');
  return String(date);
}

function validateClientIds(value) {
  const ids = String(value).split(',').map(s => s.trim());
  if (ids.some(id => !CSV_INT_PATTERN.test(id))) {
    throw new Error('client_ids deve ser uma lista de IDs inteiros separados por vírgula (ex: "982,2")');
  }
  return ids.join(',');
}

function buildFilters(args) {
  const filters = { date: validateDate(args.date) };
  if (args.client_ids !== undefined && args.client_ids !== null && args.client_ids !== '') {
    filters.client_ids = validateClientIds(args.client_ids);
  }
  if (args.contract_type_id !== undefined && args.contract_type_id !== null) {
    const typeId = parseIntStrict(args.contract_type_id, 'contract_type_id');
    if (typeId < 1) throw new Error('contract_type_id deve ser um número inteiro positivo');
    filters.contract_type_id = typeId;
  }
  filters.limit = LIMIT_DEFAULT;
  if (args.limit !== undefined) {
    const n = parseIntStrict(args.limit, 'limit');
    if (n < LIMIT_MIN) throw new Error('limit deve ser um número inteiro válido');
    filters.limit = Math.min(n, LIMIT_MAX);
  }
  filters.offset = OFFSET_MIN;
  if (args.offset !== undefined) filters.offset = Math.max(parseIntStrict(args.offset, 'offset'), OFFSET_MIN);
  return filters;
}

function idCell(r) {
  return r.kind === 'contract_group' ? `${r.id} · grupo` : `${r.id}`;
}

/** Valor numerico diferente de zero (mascarado "--" ou nulo nao entra no bloco). */
function isNonZero(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0;
}

function renderRow(r, showExpiration) {
  const cells = [
    idCell(r),
    escapeCell(r.name || '—'),
    escapeCell(r.client?.name || '—'),
    escapeCell(r.contract_type?.name || '—'),
    escapeCell(r.contract_type?.modality || '—'),
    escapeCell(r.rider?.cancel_date || '—'),
    currencyBRL(r.rider?.value),
    currencyBRL(r.rider?.tax)
  ];
  if (showExpiration) cells.push(escapeCell(r.expiration_date || '—'));
  return `| ${cells.join(' | ')} |\n`;
}

function limitedList(label, entries) {
  const fit = appendWithinBudget(entries, { maxChars: ROW_LIST_BUDGET });
  const shown = entries.slice(0, fit.shown).join('; ');
  const more = fit.truncated ? ` (+${entries.length - fit.shown} não exibidos)` : '';
  return `${label}: ${shown}${more}`;
}

function renderDetail(r) {
  const parts = RIDER_FIELDS
    .filter(([field]) => isNonZero(r.rider?.[field]))
    .map(([field, label]) => `${label} ${currencyBRL(r.rider[field])}`);
  const items = r.items || [];
  if (items.length > 0) {
    parts.push(limitedList('itens', items.map(i =>
      `${i.name || '—'} (qtd ${i.qtd ?? '—'} · unitário ${currencyBRL(i.value)} · total ${currencyBRL(i.total_value)})`
    )));
  }
  const members = r.contracts || [];
  if (members.length > 0) {
    parts.push(limitedList('membros', members.map(c => `#${c.id} ${c.name || '—'}`)));
  }
  if (parts.length === 0) return '';
  return `- **#${idCell(r)}** · ${parts.join(' · ')}\n`;
}

function formatReadjustments(rows, { offset, limit, total, date }, verbosity) {
  const v = verbosity || 'rich';
  const list = rows || [];

  if (list.length === 0) {
    const totalNum = Number.parseInt(total, 10);
    if (!Number.isNaN(totalNum) && totalNum > 0) return pageBeyondEndMessage(offset, limit, totalNum, 'registro(s)');
    return `Nenhum contrato ou grupo de contrato com aditivo encerrando até o fim do mês de ${date}.`;
  }

  const showExpiration = list.some(r => r.expiration_date);
  const head = `**Quadro de reajuste até o fim do mês de ${date} (${list.length})**\n\n` +
    `| ID | Nome | Cliente | Tipo | Modalidade | Fim do aditivo | Valor | Taxa |${showExpiration ? ' Expiração |' : ''}\n` +
    `|---|---|---|---|---|---|---|---|${showExpiration ? '---|' : ''}\n`;
  const rowsText = list.map(r => renderRow(r, showExpiration));
  const paginationInfo = pagination({ offset, limit, count: list.length, total, unit: 'registros' }, v);
  const footerStr = footer(v);
  const tail = footerStr ? `\n${footerStr}` : '';

  if (v === 'compact') {
    return renderWithinBudget({
      head, parts: rowsText, middle: '\n', pagination: paginationInfo, tail,
      offset, limit, unit: 'registros', verbosity: v, total
    });
  }

  // Tabela e bloco de detalhes cortados no MESMO item (ver list_contracts).
  const details = list.map(renderDetail);
  const detailsHeader = '\n**Detalhes do aditivo**\n';
  const combined = list.map((_, i) => rowsText[i] + details[i]);
  const fixed = head.length + detailsHeader.length + paginationInfo.length + tail.length + 1;
  const fit = appendWithinBudget(combined, {
    maxChars: RESPONSE_ITEM_BUDGET - fixed, offset, limit, unit: 'registros', verbosity: v, total
  });
  const shownDetails = details.slice(0, fit.shown).join('');
  const detailsBlock = shownDetails ? `${detailsHeader}${shownDetails}` : '';
  const end = fit.truncated
    ? continuationLine({ shown: fit.shown, count: list.length, offset, limit, unit: 'registros', verbosity: v, total })
    : `\n${paginationInfo}`;
  return `${head}${rowsText.slice(0, fit.shown).join('')}${detailsBlock}${end}${tail}`;
}

function readjustmentsErrorResponse(response) {
  const errorCode = extractApiErrorCode(response);
  if (errorCode === 40304) return contractsLicenseErrorResponse();
  if (errorCode === 40301 || response.status === 403) {
    return errorResponse(
      '**❌ Acesso negado ao quadro de reajuste**\n\n' +
      `**Código:** ${response.status} (erro ${errorCode || 'N/A'})\n` +
      `**Mensagem:** ${response.error}\n\n` +
      BILLING_PERMISSION_HINT
    );
  }
  if (errorCode === 42201 || response.status === 422) {
    return apiFailureResponse(
      '**❌ Parâmetros recusados pela API ao consultar o quadro de reajuste**',
      response,
      `${formatApiErrorDetail(response)}` +
      '*Confira `date` (YYYY-MM-DD), `client_ids` (inteiros separados por vírgula), `contract_type_id` e `limit` (máximo 200).*'
    );
  }
  return contractApiErrorResponse(
    'Erro ao consultar o quadro de reajuste',
    response,
    '*Verifique suas permissões e os filtros aplicados.*'
  );
}

async function execute(args, { api, verbosity }) {
  const filters = buildFilters(args || {});

  try {
    const response = await api.listContractReadjustments(filters);
    if (response.error) return readjustmentsErrorResponse(response);
    if (!Array.isArray(response.data)) {
      return errorResponse(
        '**⚠️ Resposta inesperada ao consultar o quadro de reajuste**\n\n' +
        'A API retornou sucesso mas sem a lista de contratos.'
      );
    }
    return textResponse(formatReadjustments(response.data, {
      offset: filters.offset, limit: filters.limit, total: response.total, date: filters.date
    }, verbosity));
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao consultar o quadro de reajuste**', error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatReadjustments };

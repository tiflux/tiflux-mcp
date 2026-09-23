/**
 * Slice: get_billings_history — historico de faturamentos.
 *
 * Endpoint: GET /reports/billings/history (via api.getBillingsHistory).
 * Filtros opcionais: periodo de faturamento (billing_start_date/billing_end_date),
 * vencimento (due_start_date/due_end_date), client_id, client_name (resolver fuzzy),
 * nfe_number, ticket_number, type (billed|reversed|paid) + paginacao offset/limit.
 *
 * Regras de negocio:
 * - Datas pareadas obrigatorias em conjunto: billing_start_date exige billing_end_date
 *   (e vice-versa); idem para due_*. Validacao local antes da chamada.
 * - `type` no schema, `_type` na API. Traducao no slice (guardrail BE-003).
 * - `client_name` resolvido via resolveClientName; client_id tem precedencia.
 * - Situacao derivada: reversal → Estornado; paid → Pago; ambos false → Faturado.
 * - Rodape inclui a soma de real_value da pagina EXCLUINDO estornos (reversal: true).
 *   Estorno e um UPDATE no proprio registro de faturamento (a API devolve real_value
 *   POSITIVO, sem lancamento de contrapartida): soma-lo inflaria o total, subtrai-lo
 *   daria erro de 2x. A convencao do produto (relatorio interno e tela nativa) e
 *   FILTRAR, nao subtrair. Quando ha estornos na pagina, uma nota informa quantos foram
 *   excluidos e o valor somado deles. Regras de dominio (nao declaradas na Swagger) em
 *   .docs/specs/.done/2026-07-29-billings-history-report/README.md.
 * - Celulas da tabela passam por escapeCell (escapa `|`, colapsa quebras de linha).
 *
 * Shape da resposta verificado contra chamada real em 2026-07-29 (GET /reports/billings/history):
 * billing_id (int), billing_date (str), client_id (int), client_name (str), due_date (str),
 * nfe_number (str|null), paid (bool), real_value (str decimal), reversal (bool) —
 * a Swagger nao declara o schema do corpo, por isso o registro fica aqui.
 *
 * Permissao necessaria: "Faturar servicos avulsos e contratos" + licenca Tickets.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination, currencyBRL, money, row, appendWithinBudget, cutCountLabel, listVerbosity, RESPONSE_ITEM_BUDGET } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { resolveClientName } = require('../_shared/clientResolver');
const { escapeCell } = require('../_shared/markdown');

const schema = {
  name: 'get_billings_history',
  description: 'Retorna o historico de faturamentos da organizacao. Filtros opcionais: periodo de emissao (billing_start_date + billing_end_date — par obrigatorio em conjunto), periodo de vencimento (due_start_date + due_end_date — par obrigatorio), cliente (client_id ou client_name com resolver fuzzy), NFe (nfe_number), ticket (ticket_number) e situacao (type: billed, reversed ou paid). Exige permissao "Faturar servicos avulsos e contratos" e licenca Tickets. Retorna 7 campos por faturamento (ID, Cliente, Data faturamento, Vencimento, NFe, Situacao e Valor) — tabela markdown no modo rich, linhas delimitadas por | no modo compact — alem da soma dos real_value da pagina EXCLUINDO estornos (reversal: true), com nota do que foi excluido quando houver (se a resposta passar de ~40k caracteres, e cortada no limite de uma linha com offset/limit para continuar, e a soma cobre so as linhas mostradas). O filtro de situacao (type): billed = nao estornados; reversed = so estornados; paid = confirmados pela integracao financeira (Asaas/ContaAzul), podendo incluir estornados — NAO significa "quitado" (pagamento manual/PIX/boleto fora do sistema retorna paid: false). Para uma soma sem estornos use type: "billed". O endpoint nao devolve total de valor do filtro, apenas a contagem de registros (header X-Total-Items).',
  inputSchema: {
    type: 'object',
    properties: {
      billing_start_date: {
        type: 'string',
        description: 'Data de inicio do periodo de faturamento (YYYY-MM-DD). Obrigatorio em conjunto com billing_end_date.'
      },
      billing_end_date: {
        type: 'string',
        description: 'Data de fim do periodo de faturamento (YYYY-MM-DD). Obrigatorio em conjunto com billing_start_date.'
      },
      due_start_date: {
        type: 'string',
        description: 'Data de inicio do vencimento (YYYY-MM-DD). Obrigatorio em conjunto com due_end_date.'
      },
      due_end_date: {
        type: 'string',
        description: 'Data de fim do vencimento (YYYY-MM-DD). Obrigatorio em conjunto com due_start_date.'
      },
      client_id: {
        type: 'number',
        description: 'ID do cliente para filtrar faturamentos. Tem precedencia sobre client_name. Opcional.'
      },
      client_name: {
        type: 'string',
        description: 'Nome (parcial ou exato) do cliente para busca automatica. Ignorado quando client_id tambem for informado. Opcional.'
      },
      nfe_number: {
        type: 'number',
        description: 'Numero da NFe para filtrar. Opcional.'
      },
      ticket_number: {
        type: 'number',
        description: 'Numero do ticket para filtrar faturamentos associados. Opcional.'
      },
      type: {
        type: 'string',
        enum: ['billed', 'reversed', 'paid'],
        description: 'Situacao do faturamento: billed (faturado), reversed (estornado) ou paid (pago). Sem filtro retorna todos. Opcional.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

/**
 * Deriva a situacao legivel a partir dos campos paid/reversal.
 * Precedencia: reversal > paid > Faturado.
 */
function deriveSituacao(billing) {
  if (billing.reversal) return 'Estornado';
  if (billing.paid) return 'Pago';
  return 'Faturado';
}

/**
 * Soma os real_value (string numerica) dos itens da pagina, EXCLUINDO estornos.
 *
 * Estorno (reversal: true) e um UPDATE no proprio registro — a API devolve real_value
 * POSITIVO e nao existe lancamento de contrapartida (Billing#cancel_billing so seta
 * reversal=true, nunca nega o valor). Soma-lo inflaria o total; subtrai-lo produziria
 * erro de 2x (e o item estornado ainda pode ser refaturado num novo billing_id). A
 * convencao do produto (relatorio interno e tela nativa) e FILTRAR, nao subtrair.
 *
 * Retorna { total, reversedCount, reversedValue }: `total` e a soma dos nao-estornados;
 * `reversedCount`/`reversedValue` alimentam a nota de transparencia no rodape.
 */
function sumPageValues(billings) {
  return billings.reduce((acc, b) => {
    const n = Number(b.real_value);
    const val = Number.isFinite(n) ? n : 0;
    if (b.reversal) {
      acc.reversedCount += 1;
      acc.reversedValue += val;
    } else {
      acc.total += val;
    }
    return acc;
  }, { total: 0, reversedCount: 0, reversedValue: 0 });
}

// Folga reservada no orcamento para a soma/cabecalho, recalculados sobre os itens
// mostrados depois do corte (o numero pode mudar alguns digitos de tamanho).
const SUM_BLOCK_SLACK = 40;

function compactHead(billings) {
  const { total: pageSum, reversedCount, reversedValue } = sumPageValues(billings);
  let head = `Faturamentos (${billings.length}) · BRL · soma pág sem estornos ${money(pageSum.toFixed(2), 'compact')}`;
  if (reversedCount > 0) {
    head += ` · ${reversedCount} estorno(s) fora (${money(reversedValue.toFixed(2), 'compact')})`;
  }
  return `${head}\n`;
}

function compactRow(b) {
  return `${row([
    b.billing_id,
    b.client_name,
    b.billing_date,
    b.due_date,
    b.nfe_number,
    deriveSituacao(b),
    money(b.real_value, 'compact')
  ])}\n`;
}

function richRow(b) {
  const id = b.billing_id != null ? escapeCell(b.billing_id) : '—';
  const clientName = b.client_name ? escapeCell(b.client_name) : '—';
  const billingDate = b.billing_date ? escapeCell(b.billing_date) : '—';
  const dueDate = b.due_date ? escapeCell(b.due_date) : '—';
  const nfe = b.nfe_number != null ? escapeCell(b.nfe_number) : '—';
  const situacao = deriveSituacao(b);
  const valor = escapeCell(currencyBRL(b.real_value));
  return `| ${id} | ${clientName} | ${billingDate} | ${dueDate} | ${nfe} | ${situacao} | ${valor} |\n`;
}

// Soma da pagina EXCLUINDO estornos (rotulada explicitamente — nao e total do filtro)
function richSumBlock(billings) {
  const { total: pageSum, reversedCount, reversedValue } = sumPageValues(billings);
  let text = `\n**Soma desta página (sem estornos):** ${currencyBRL(pageSum.toFixed(2))}\n`;
  if (reversedCount > 0) {
    text += `_${reversedCount} estorno(s) excluído(s) da soma (${currencyBRL(reversedValue.toFixed(2))})_\n`;
  }
  return text;
}

/**
 * Formata a pagina de faturamentos com teto de ~40k caracteres (F3). Quando a
 * pagina e cortada, a soma e a contagem passam a cobrir so as linhas mostradas —
 * assim as somas de chamadas de continuacao (offset/limit sugeridos) se somam sem
 * contar nenhum faturamento duas vezes.
 */
function formatBillingsHistory(billings, offset, limit, verbosity, total, autoCompactNotice = '') {
  const v = verbosity || 'rich';

  if (!billings || billings.length === 0) {
    if (v === 'compact') {
      return 'Faturamentos: 0 registros (verifique os filtros e suas permissões de faturamento).';
    }
    return 'Nenhum faturamento encontrado.\n\n*Verifique os filtros aplicados e suas permissoes de faturamento.*';
  }

  const paginationInfo = pagination(
    { offset, limit, count: billings.length, total, unit: 'faturamentos' },
    v
  );
  const budgetOpts = { offset, limit, unit: 'faturamentos', verbosity: v, total };

  if (v === 'compact') {
    const colHeader = 'id|cliente|emissao|venc|nfe|sit|valor\n';
    const fixed = compactHead(billings).length + colHeader.length + paginationInfo.length + autoCompactNotice.length + SUM_BLOCK_SLACK;
    const fit = appendWithinBudget(billings.map(compactRow), { ...budgetOpts, maxChars: RESPONSE_ITEM_BUDGET - fixed });
    const shown = billings.slice(0, fit.shown);
    return `${compactHead(shown)}${colHeader}${fit.text}${fit.truncated ? '' : paginationInfo}${autoCompactNotice}`;
  }

  const richColHeader = '| ID | Cliente | Data faturamento | Vencimento | NFe | Situação | Valor |\n' +
    '|---|---|---|---|---|---|---|\n';
  // Quando o teto corta, a contagem do cabecalho cobre so as linhas mostradas (como no compact)
  const tableHead = (count) => `**Faturamentos (${count})**\n\n${richColHeader}`;
  const footerStr = footer(v);
  const tail = `${footerStr ? '\n' : ''}${footerStr}`;
  const headLen = Math.max(tableHead(billings.length).length, tableHead(cutCountLabel(billings.length, total, billings.length)).length);
  const fixed = headLen + richSumBlock(billings).length + 1 + paginationInfo.length + tail.length + SUM_BLOCK_SLACK;
  const fit = appendWithinBudget(billings.map(richRow), { ...budgetOpts, maxChars: RESPONSE_ITEM_BUDGET - fixed });
  const shown = billings.slice(0, fit.shown);
  const head = fit.truncated ? tableHead(cutCountLabel(fit.shown, total, billings.length)) : tableHead(billings.length);
  return `${head}${fit.text}${richSumBlock(shown)}\n${fit.truncated ? '' : paginationInfo}${tail}`;
}

async function execute(args, { api, verbosity: ctxVerbosity, verbosityExplicit }) {
  const {
    billing_start_date, billing_end_date,
    due_start_date, due_end_date,
    client_id, client_name,
    nfe_number, ticket_number,
    type,
    limit, offset
  } = args;

  // Validacao de datas pareadas (antes da chamada — economiza request)
  if (billing_start_date && !billing_end_date) {
    return errorResponse(
      '**❌ Parâmetro inválido: billing_end_date ausente**\n\n' +
      '`billing_start_date` e `billing_end_date` devem ser informados juntos.\n\n' +
      '*Informe billing_end_date para definir o intervalo de faturamento.*'
    );
  }
  if (!billing_start_date && billing_end_date) {
    return errorResponse(
      '**❌ Parâmetro inválido: billing_start_date ausente**\n\n' +
      '`billing_start_date` e `billing_end_date` devem ser informados juntos.\n\n' +
      '*Informe billing_start_date para definir o intervalo de faturamento.*'
    );
  }
  if (due_start_date && !due_end_date) {
    return errorResponse(
      '**❌ Parâmetro inválido: due_end_date ausente**\n\n' +
      '`due_start_date` e `due_end_date` devem ser informados juntos.\n\n' +
      '*Informe due_end_date para definir o intervalo de vencimento.*'
    );
  }
  if (!due_start_date && due_end_date) {
    return errorResponse(
      '**❌ Parâmetro inválido: due_start_date ausente**\n\n' +
      '`due_start_date` e `due_end_date` devem ser informados juntos.\n\n' +
      '*Informe due_start_date para definir o intervalo de vencimento.*'
    );
  }

  // Resolver client_name → client_id (so quando veio nome sem ID)
  let resolvedClientId = client_id;
  if (client_name && !client_id) {
    const resolved = await resolveClientName(api, client_name);
    if (resolved.error) return resolved.response;
    resolvedClientId = resolved.clientId;
  }

  try {
    const filters = {};

    if (billing_start_date !== undefined) filters.billing_start_date = billing_start_date;
    if (billing_end_date !== undefined) filters.billing_end_date = billing_end_date;
    if (due_start_date !== undefined) filters.due_start_date = due_start_date;
    if (due_end_date !== undefined) filters.due_end_date = due_end_date;
    if (resolvedClientId !== undefined) filters.client_id = resolvedClientId;
    if (nfe_number !== undefined) filters.nfe_number = nfe_number;
    if (ticket_number !== undefined) filters.ticket_number = ticket_number;
    // Traducao type → _type (guardrail BE-003: mapeamento no slice, nao em tiflux-api.js)
    if (type !== undefined) filters._type = type;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.getBillingsHistory(filters);

    if (response.error) {
      const status = response.status;
      if (status === 403) {
        return errorResponse(
          `**❌ Sem permissão para acessar faturamentos**\n\n` +
          `**Código:** ${status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Esta rota exige a permissão "Faturar serviços avulsos e contratos" e licença de Tickets. Verifique suas permissões com o administrador.*`
        );
      }
      if (status === 422) {
        return errorResponse(
          `**❌ Parâmetros inválidos para o relatório de faturamentos**\n\n` +
          `**Código:** ${status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique os filtros de data e parâmetros informados.*`
        );
      }
      if (status === 401) {
        return errorResponse(
          `**❌ Chave de API inválida ou expirada**\n\n` +
          `**Código:** ${status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se a chave TIFLUX_API_KEY está correta e ativa.*`
        );
      }
      return errorResponse(
        `**❌ Erro ao buscar histórico de faturamentos**\n\n` +
        `**Código:** ${status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissões e os filtros aplicados.*`
      );
    }

    const billings = response.data || [];
    // F4: sem verbosidade explicita e com > 50 itens na pagina, sai em compact (com aviso).
    const { verbosity, notice: autoCompactNotice } = listVerbosity({ verbosity: ctxVerbosity, verbosityExplicit }, billings.length);
    // Clamp identico ao aplicado em api.getBillingsHistory, senao o formatter recebe
    // limit/offset crus e a deteccao de "proxima pagina" quebra acima de 200 (BL-008)
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);

    return textResponse(formatBillingsHistory(billings, effectiveOffset, effectiveLimit, verbosity, response.total, autoCompactNotice));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao buscar histórico de faturamentos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatBillingsHistory };

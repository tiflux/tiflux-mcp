/**
 * Slice: list_contracts — lista contratos da organizacao.
 *
 * Endpoint: GET /contracts (via api.listContracts).
 * Filtros opcionais (todos CSV): client_ids, contract_type_ids, status
 * (actives|readjust|expired) + paginacao offset/limit.
 *
 * Read-only: PUT /contracts/{id} segue fora de escopo (ver get_contract para
 * detalhe de contrato individual). include_details continua util por expor
 * client.id e contract_type.id junto da linha do contrato, sem round-trip
 * extra — mas o jeito recomendado de descobrir contract_type_ids e
 * list_contract_types.
 *
 * Contratos e grupos de contrato (modalidade Compartilhado) vem de tabelas
 * distintas, com IDs independentes: o mesmo numero pode aparecer duas vezes
 * na listagem, uma como contrato e outra como grupo, diferenciados pelo
 * campo `kind` ("contract" | "contract_group"; ausente == "contract" por
 * retrocompatibilidade). Linha de grupo mostra a coluna ID como `<id> ·
 * grupo` e a pagina ganha um rodape explicativo. Membros de um grupo
 * Compartilhado nunca aparecem como linha propria — o detalhe do grupo e os
 * seus contratos-membro vem de `get_contract_group`.
 *
 * Registro com `active:false` nunca aparece nesta listagem, seja qual for o
 * `status` informado (escopo `.actives` da API, nos dois lados da uniao).
 *
 * Saida default (9 colunas): ID, Nome, Cliente, Tipo, Modalidade, Situacao
 * (Ativo/Pendente de reajuste/Expirado/Cancelado; sufixo "(cancelamento
 * agendado)" quando o contrato ainda esta ativo mas ja tem cancelamento
 * marcado — ver statusCell/B1), Expiracao, Reajuste, Valor total. Com
 * include_details:true, um bloco extra por contrato exibe os IDs e os campos
 * monetarios detalhados; include_details e rendering-only e nunca repassado
 * a API. Tabela e bloco de detalhes sao cortados no mesmo contrato quando o
 * total ultrapassa RESPONSE_ITEM_BUDGET (orcamento de resposta), com linha
 * de continuacao em vez do rodape de paginacao.
 *
 * Observacao de permissao: os campos monetarios (rider_tax, rider_value,
 * total_value) so aparecem para usuarios com a permissao "Visualizar valores
 * dos tickets"; sem ela a API retorna "--" nesses campos.
 *
 * Dedupe (A1/H19): a API pode devolver uma linha de grupo de contrato
 * duplicada quando ha dois aditivos com mesmo numero/versao (bug conhecido,
 * reportado ao time da API) — dedupeContracts() remove a duplicata dentro da
 * pagina, mantendo a primeira ocorrencia, com nota explicativa na resposta.
 */

const { textResponse } = require('../_shared/response');
const { contractsLicenseErrorResponse, contractApiErrorResponse, contractsAccessDeniedResponse } = require('../_shared/contractShared');
const { errorResponse, extractApiErrorCode } = require('../_shared/errors');
const { footer, pagination, currencyBRL, appendWithinBudget, continuationLine, RESPONSE_ITEM_BUDGET } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { parseIntStrict } = require('../_shared/validators');
const { modalityLabel } = require('../_shared/contractModality');

// Bounds (mesmo padrao de listContractTypes.js): `offset` e NUMERO DA PAGINA
// (default 1, minimo 1); `limit` sao itens por pagina (default 20, min 1, max 200).
const OFFSET_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;

const STATUS_LABELS = {
  actives: 'Ativo',
  readjust: 'Pendente de reajuste',
  expired: 'Expirado'
};

const schema = {
  name: 'list_contracts',
  description: 'Listar contratos da organizacao (somente leitura). Retorna tabela com 9 colunas: ID, Nome, Cliente, Tipo, Modalidade, Situacao (Ativo/Pendente de reajuste/Expirado/Cancelado, com sufixo "(cancelamento agendado)" quando o contrato ainda esta ativo mas ja tem cancelamento marcado), Expiracao, Reajuste e Valor total. Filtros opcionais por cliente (client_ids CSV), tipo de contrato (contract_type_ids CSV) e situacao (status CSV: actives, readjust, expired — por padrao a API lista apenas actives). Registros inativos (active:false) nunca aparecem, seja qual for o status pedido. Linhas de grupo de contrato (modalidade Compartilhado) mostram a coluna ID como "<id> · grupo" — grupos e contratos tem IDs independentes, o mesmo numero pode aparecer duas vezes; os contratos-membro de um grupo nao aparecem como linha propria, use get_contract_group para ver o detalhe e os membros. Quando a API devolve um grupo duplicado (bug conhecido, numeros de aditivo colidentes), a tool remove a duplicata dentro da pagina e avisa na resposta. Para o detalhe de um contrato individual, use get_contract (um ID de contrato que seja membro de um grupo responde 404 la — use get_contract_group nesse caso). Para descobrir os IDs de contract_type_ids, use list_contract_types (jeito recomendado); com include_details:true esta tool tambem exibe bloco extra por contrato com IDs de cliente e tipo, e campos monetarios detalhados, sem round-trip extra. Os valores monetarios so sao exibidos para usuarios com a permissao "Visualizar valores dos tickets". limit/offset sao validados estritamente (inteiros; limit fora de 1..200 e corrigido, nao-inteiro vira erro); pagina alem do fim (sem resultados mas com paginas anteriores) avisa qual e a ultima pagina.',
  inputSchema: {
    type: 'object',
    properties: {
      include_details: {
        type: 'boolean',
        description: 'Quando true, exibe um bloco de detalhe apos a tabela com: client.id (para usar em client_ids), contract_type.id (para usar em contract_type_ids — alternativa a list_contract_types, sem round-trip extra), duration, readjust_duration e valores rider_value/rider_tax. NAO e enviado a API — e rendering-only. Default false.'
      },
      client_ids: {
        type: 'string',
        description: 'Filtrar por clientes: IDs separados por virgula (ex: "982,2,1024"). Opcional.'
      },
      contract_type_ids: {
        type: 'string',
        description: 'Filtrar por tipos de contrato: IDs separados por virgula (ex: "3,27"). Opcional.'
      },
      status: {
        type: 'string',
        description: 'Filtrar por situacao: valores actives, readjust, expired separados por virgula (ex: "actives,expired"). Por padrao a API lista apenas contratos ativos (actives). Opcional.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

/**
 * ID da coluna da tabela: grupos de contrato ganham o sufixo "· grupo" — os
 * IDs de grupo e de contrato sao independentes (mesmo numero pode repetir).
 */
function idCell(c) {
  return c.kind === 'contract_group' ? `${c.id} · grupo` : `${c.id}`;
}

/**
 * Situacao da linha (B1): `expired`+`cancelled` vira "Cancelado" (nao mais
 * "Inativo (cancelado)" — bate com get_contract). `actives`/`readjust` com
 * `cancelled:true` e cancelamento AGENDADO (o contrato ainda esta ativo) —
 * sufixo muda de "(cancelado)" para "(cancelamento agendado)". Status
 * desconhecido com `cancelled:true` mantem o sufixo generico "(cancelado)".
 */
function statusCell(c) {
  const label = STATUS_LABELS[c.status] || c.status || '—';
  if (!c.cancelled) return label;
  if (c.status === 'expired') return 'Cancelado';
  if (c.status === 'actives' || c.status === 'readjust') return `${label} (cancelamento agendado)`;
  return `${label} (cancelado)`;
}

function renderContractRow(c) {
  const modality = modalityLabel(c.modality);
  const statusLabel = statusCell(c);
  const clientName = c.client?.name || '—';
  const typeName = c.contract_type?.name || '—';
  const expiration = c.expiration_date || '—';
  const readjustment = c.readjustment_date || '—';
  const totalValue = currencyBRL(c.total_value);
  return `| ${idCell(c)} | ${c.name || '—'} | ${clientName} | ${typeName} | ${modality} | ${statusLabel} | ${expiration} | ${readjustment} | ${totalValue} |\n`;
}

function renderContractDetail(c) {
  const clientId = c.client?.id ?? '—';
  const typeId = c.contract_type?.id ?? '—';
  const duration = c.duration != null ? `${c.duration} meses` : '—';
  const readjustDuration = c.readjust_duration != null ? `${c.readjust_duration} meses` : '—';
  const riderValue = currencyBRL(c.rider_value);
  const riderTax = currencyBRL(c.rider_tax);
  return `- **#${idCell(c)}** · cliente ID ${clientId} · tipo ID ${typeId} · duracao: ${duration} · reajuste a cada ${readjustDuration} · adicional: ${riderValue} (taxa ${riderTax})\n`;
}

/**
 * Rodape exibido quando a pagina tem >= 1 grupo de contrato: explica que os
 * IDs de grupo e de contrato sao independentes e onde ver o detalhe/membros.
 */
function groupFooterNotice(v) {
  if (v === 'compact') {
    return '\n(página com grupo(s) de contrato — IDs de grupo e de contrato são independentes, o mesmo número pode repetir; detalhe e membros via get_contract_group)\n';
  }
  return '\n> ℹ️ *Esta página contém grupo(s) de contrato (linhas "· grupo"). IDs de grupo e de contrato são independentes — o mesmo número pode aparecer duas vezes na lista. Veja o detalhe e os membros de um grupo com `get_contract_group`.*\n';
}

/**
 * Dedupe por `kind+id` (A1/H19): a perna de grupos da UNION da API faz JOIN
 * com o aditivo de maior rider/release, e quando um grupo tem DOIS aditivos
 * com o mesmo numero e versao a linha sai duplicada (bug da API, reportado ao
 * time — ver README). Mantem a PRIMEIRA ocorrencia (ordem da API, sem criterio
 * inventado) e conta quantas linhas foram removidas. So dentro da pagina —
 * uma duplicata entre paginas nao e detectavel sem buscar tudo.
 */
function dedupeContracts(contracts) {
  const seen = new Set();
  const result = [];
  let removed = 0;
  for (const c of contracts) {
    const key = `${c.kind || 'contract'}:${c.id}`;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    result.push(c);
  }
  return { result, removed };
}

/**
 * Mensagem quando a pagina pedida veio vazia mas o filtro tem resultados em
 * outras paginas (C2/H15) — distingue de "nenhum contrato encontrado" (sem
 * resultado algum). `total` precisa ser > 0 e conhecido (X-Total-Items).
 */
function pageBeyondEndMessage(offset, limit, total, unit) {
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  return `*Página ${offset} está além do fim: ${total} ${unit} no total, última página ${lastPage} (limit ${limit}).*`;
}

function formatContractsList(contracts, offset, limit, verbosity, include_details, total) {
  const v = verbosity || 'rich';
  const { result: deduped, removed: dupeCount } = dedupeContracts(contracts || []);

  if (deduped.length === 0) {
    const totalNum = Number.parseInt(total, 10);
    if (!Number.isNaN(totalNum) && totalNum > 0) {
      return pageBeyondEndMessage(offset, limit, totalNum, 'contrato(s)');
    }
    return (
      'Nenhum contrato encontrado.\n\n' +
      '*Por padrao, apenas contratos ativos sao listados. Use `status:"actives,readjust,expired"` para incluir todos, ' +
      'ou verifique os filtros aplicados e suas permissoes.*'
    );
  }

  const hasGroup = deduped.some(c => c.kind === 'contract_group');
  const groupNotice = hasGroup ? groupFooterNotice(v) : '';
  const dupeNotice = dupeCount > 0
    ? `\n*${dupeCount} linha(s) duplicada(s) pela API foram omitidas; o total informado pela API pode estar inflado.*\n`
    : '';

  const head = `**Contratos (${deduped.length})**\n\n` +
    '| ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Reajuste | Valor total |\n' +
    '|---|---|---|---|---|---|---|---|---|\n';

  const rows = deduped.map(renderContractRow);
  // `count` da paginacao e a contagem CRUA da pagina (antes do dedupe): a deteccao
  // de "proxima pagina" depende de pagina cheia => count === limit, e uma
  // duplicata removida numa pagina cheia esconderia a pagina seguinte (M1 do
  // review do PR #109).
  const paginationInfo = pagination({ offset, limit, count: (contracts || []).length, total, unit: 'contratos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';

  if (!include_details) {
    // Sem detalhes, a tabela sozinha nunca ultrapassa RESPONSE_ITEM_BUDGET mesmo
    // em limit:200 (ver orcamento na spec) — sem logica de corte aqui.
    return `${head}${rows.join('')}\n${paginationInfo}${groupNotice}${dupeNotice}${sep}${footerStr}`;
  }

  // Com include_details, tabela + bloco de detalhes podem ultrapassar o teto
  // (ate ~66k em limit:200). Reaproveita appendWithinBudget/continuationLine
  // (mesmos helpers de renderWithinBudget) para cortar os DOIS blocos no
  // mesmo contrato: cada "parte" soma o tamanho da linha da tabela + a linha
  // de detalhe daquele contrato, o corte decide quantos contratos cabem, e a
  // tabela/detalhes exibidos sao fatiados consistentemente nesse mesmo N.
  // (A tabela e os detalhes ficam em secoes proprias — nao da pra usar
  // renderWithinBudget() puro aqui porque ele intercala um unico `parts` no
  // corpo, e isso quebraria a tabela Markdown com linhas de detalhe no meio.)
  const details = deduped.map(renderContractDetail);
  const detailsHeader = '\n**Detalhes**\n';
  const combinedParts = deduped.map((_, i) => rows[i] + details[i]);
  const fixed = head.length + detailsHeader.length + groupNotice.length + dupeNotice.length + sep.length + footerStr.length + paginationInfo.length;

  const fit = appendWithinBudget(combinedParts, {
    maxChars: RESPONSE_ITEM_BUDGET - fixed,
    offset, limit, unit: 'contratos', verbosity: v, total
  });

  const shownRows = rows.slice(0, fit.shown).join('');
  const shownDetails = details.slice(0, fit.shown).join('');

  if (!fit.truncated) {
    return `${head}${shownRows}${detailsHeader}${shownDetails}\n${paginationInfo}${groupNotice}${dupeNotice}${sep}${footerStr}`;
  }

  const cutLine = continuationLine({ shown: fit.shown, count: deduped.length, offset, limit, unit: 'contratos', verbosity: v, total });
  return `${head}${shownRows}${detailsHeader}${shownDetails}${cutLine}${groupNotice}${dupeNotice}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { client_ids, contract_type_ids, status, limit, offset, include_details } = args;

  // Validacao ANTES do try (C1): limit/offset invalidos (nao-inteiros) viram erro
  // explicito; `limit` abaixo do minimo (0) tambem — diferente de offset, que so
  // clampa. Mesmo padrao de listContractTypes.js, mas com o limit:0 estrito.
  const filters = {};
  if (client_ids !== undefined) filters.client_ids = client_ids;
  if (contract_type_ids !== undefined) filters.contract_type_ids = contract_type_ids;
  if (status !== undefined) filters.status = status;
  if (limit !== undefined) {
    const n = parseIntStrict(limit, 'limit');
    if (n < LIMIT_MIN) throw new Error('limit deve ser um número inteiro válido');
    filters.limit = Math.min(n, LIMIT_MAX);
  }
  if (offset !== undefined) {
    filters.offset = Math.max(parseIntStrict(offset, 'offset'), OFFSET_MIN);
  }
  // include_details e rendering-only — nunca repassado a API

  try {

    const response = await api.listContracts(filters);

    if (response.error) {
      // C3/H16: rodape por codigo de erro — 422/42201 (filtro), 403/40304 (licenca),
      // 403/40301 (permissao); demais codigos mantem o texto generico de sempre.
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 42201) {
        return contractApiErrorResponse(
          'Erro ao listar contratos',
          response,
          '*Corrija o(s) filtro(s) indicados em `detail` (ex.: `client_ids` deve ser lista de inteiros separados por vírgula; `status` aceita actives, readjust, expired).*'
        );
      }

      if (errorCode === 40304) return contractsLicenseErrorResponse();

      if (errorCode === 40301) {
        return contractsAccessDeniedResponse('Acesso negado ao listar contratos', response, errorCode);
      }

      return errorResponse(
        `**Erro ao listar contratos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e os filtros aplicados.*`
      );
    }

    const contracts = response.data || [];
    // limit/offset ja validados e clampados acima (C1) — usa os mesmos valores
    // na formatacao, senao a deteccao de "proxima pagina" quebra acima de 200
    // (API busca 200, formatter compara com o limit cru → hasMore falso-negativo).
    const effectiveLimit = filters.limit || 20;
    const effectiveOffset = filters.offset || OFFSET_MIN;
    return textResponse(formatContractsList(contracts, effectiveOffset, effectiveLimit, verbosity, include_details, response.total));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar contratos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractsList };

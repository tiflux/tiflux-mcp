/**
 * Slice: list_contracts — lista contratos da organizacao.
 *
 * Endpoint: GET /contracts (via api.listContracts).
 * Filtros opcionais (todos CSV): client_ids, contract_type_ids, status
 * (actives|readjust|expired) + paginacao offset/limit.
 *
 * Read-only: a API v2 expoe apenas GET /contracts e PUT /contracts/{id};
 * nao existe GET /contracts/{id}, por isso nao ha tool de detalhe de contrato
 * individual. Tambem nao existe endpoint de listagem de tipos de contrato —
 * por isso include_details expoe client.id e contract_type.id, que alimentam
 * os filtros client_ids e contract_type_ids.
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
 * (com sufixo "(cancelado)" quando cancelled=true), Expiracao, Reajuste,
 * Valor total. Com include_details:true, um bloco extra por contrato exibe
 * os IDs e os campos monetarios detalhados; include_details e rendering-only
 * e nunca repassado a API. Tabela e bloco de detalhes sao cortados no mesmo
 * contrato quando o total ultrapassa RESPONSE_ITEM_BUDGET (orcamento de
 * resposta), com linha de continuacao em vez do rodape de paginacao.
 *
 * Observacao de permissao: os campos monetarios (rider_tax, rider_value,
 * total_value) so aparecem para usuarios com a permissao "Visualizar valores
 * dos tickets"; sem ela a API retorna "--" nesses campos.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination, currencyBRL, appendWithinBudget, continuationLine, RESPONSE_ITEM_BUDGET } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

// Traducoes PT-BR sem default silencioso: valor desconhecido cai no valor cru da API.
const MODALITY_LABELS = {
  Free: 'Gratuito',
  Credit: 'Crédito',
  Shared: 'Compartilhado',
  Hours: 'Horas',
  'Saas/Product': 'SaaS/Produto',
  'Per ticket': 'Por ticket',
  'Cumulative Hours': 'Horas cumulativas'
};

const STATUS_LABELS = {
  actives: 'Ativo',
  readjust: 'Pendente de reajuste',
  expired: 'Inativo'
};

const schema = {
  name: 'list_contracts',
  description: 'Listar contratos da organizacao (somente leitura). Retorna tabela com 9 colunas: ID, Nome, Cliente, Tipo, Modalidade, Situacao (com "(cancelado)" quando aplicavel), Expiracao, Reajuste e Valor total. Filtros opcionais por cliente (client_ids CSV), tipo de contrato (contract_type_ids CSV) e situacao (status CSV: actives, readjust, expired — por padrao a API lista apenas actives). Registros inativos (active:false) nunca aparecem, seja qual for o status pedido. Linhas de grupo de contrato (modalidade Compartilhado) mostram a coluna ID como "<id> · grupo" — grupos e contratos tem IDs independentes, o mesmo numero pode aparecer duas vezes; os contratos-membro de um grupo nao aparecem como linha propria, use get_contract_group para ver o detalhe e os membros. Com include_details:true exibe bloco extra por contrato com IDs de cliente e tipo (uteis nos filtros, pois nao ha endpoint de listagem de tipos de contrato) e campos monetarios detalhados. Os valores monetarios so sao exibidos para usuarios com a permissao "Visualizar valores dos tickets".',
  inputSchema: {
    type: 'object',
    properties: {
      include_details: {
        type: 'boolean',
        description: 'Quando true, exibe um bloco de detalhe apos a tabela com: client.id (para usar em client_ids), contract_type.id (para usar em contract_type_ids, pois nao ha endpoint de listagem de tipos), duration, readjust_duration e valores rider_value/rider_tax. NAO e enviado a API — e rendering-only. Default false.'
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

function renderContractRow(c) {
  const modality = MODALITY_LABELS[c.modality] || c.modality || '—';
  const statusLabel = `${STATUS_LABELS[c.status] || c.status || '—'}${c.cancelled ? ' (cancelado)' : ''}`;
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

function formatContractsList(contracts, offset, limit, verbosity, include_details, total) {
  const v = verbosity || 'rich';

  if (!contracts || contracts.length === 0) {
    return (
      'Nenhum contrato encontrado.\n\n' +
      '*Por padrao, apenas contratos ativos sao listados. Use `status:"actives,readjust,expired"` para incluir todos, ' +
      'ou verifique os filtros aplicados e suas permissoes.*'
    );
  }

  const hasGroup = contracts.some(c => c.kind === 'contract_group');
  const groupNotice = hasGroup ? groupFooterNotice(v) : '';

  const head = `**Contratos (${contracts.length})**\n\n` +
    '| ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Reajuste | Valor total |\n' +
    '|---|---|---|---|---|---|---|---|---|\n';

  const rows = contracts.map(renderContractRow);
  const paginationInfo = pagination({ offset, limit, count: contracts.length, total, unit: 'contratos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';

  if (!include_details) {
    // Sem detalhes, a tabela sozinha nunca ultrapassa RESPONSE_ITEM_BUDGET mesmo
    // em limit:200 (ver orcamento na spec) — sem logica de corte aqui.
    return `${head}${rows.join('')}\n${paginationInfo}${groupNotice}${sep}${footerStr}`;
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
  const details = contracts.map(renderContractDetail);
  const detailsHeader = '\n**Detalhes**\n';
  const combinedParts = contracts.map((_, i) => rows[i] + details[i]);
  const fixed = head.length + detailsHeader.length + groupNotice.length + sep.length + footerStr.length + paginationInfo.length;

  const fit = appendWithinBudget(combinedParts, {
    maxChars: RESPONSE_ITEM_BUDGET - fixed,
    offset, limit, unit: 'contratos', verbosity: v, total
  });

  const shownRows = rows.slice(0, fit.shown).join('');
  const shownDetails = details.slice(0, fit.shown).join('');

  if (!fit.truncated) {
    return `${head}${shownRows}${detailsHeader}${shownDetails}\n${paginationInfo}${groupNotice}${sep}${footerStr}`;
  }

  const cutLine = continuationLine({ shown: fit.shown, count: contracts.length, offset, limit, unit: 'contratos', verbosity: v, total });
  return `${head}${shownRows}${detailsHeader}${shownDetails}${cutLine}${groupNotice}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { client_ids, contract_type_ids, status, limit, offset, include_details } = args;

  try {
    const filters = {};

    if (client_ids !== undefined) filters.client_ids = client_ids;
    if (contract_type_ids !== undefined) filters.contract_type_ids = contract_type_ids;
    if (status !== undefined) filters.status = status;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;
    // include_details e rendering-only — nunca repassado a API

    const response = await api.listContracts(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar contratos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e os filtros aplicados.*`
      );
    }

    const contracts = response.data || [];
    // Clamp identico ao aplicado em api.listContracts, senao o formatter recebe
    // limit/offset crus e a deteccao de "proxima pagina" quebra acima de 200
    // (API busca 200, formatter compara com o limit cru → hasMore falso-negativo).
    const effectiveLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    const effectiveOffset = Math.max(1, parseInt(offset) || 1);
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

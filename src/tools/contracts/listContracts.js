/**
 * Slice: list_contracts — lista contratos da organizacao.
 *
 * Endpoint: GET /contracts (via api.listContracts).
 * Filtros opcionais (todos CSV): client_ids, contract_type_ids, status
 * (actives|readjust|expired) + paginacao offset/limit.
 *
 * Read-only: a API v2 expoe apenas GET /contracts e PUT /contracts/{id};
 * nao existe GET /contracts/{id}, por isso nao ha tool de detalhe.
 *
 * Observacao de permissao: os campos monetarios (rider_tax, rider_value,
 * total_value) so aparecem para usuarios com a permissao "Visualizar valores
 * dos tickets"; sem ela a API retorna "--" nesses campos.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

/**
 * Formata um valor monetario string (ex: "170.05") como "R$ 170,05".
 * Ausente/null/vazio → "N/A". String nao-numerica (ex: "--") → passthrough.
 */
function formatBRL(valueStr) {
  if (valueStr === null || valueStr === undefined || valueStr === '') return 'N/A';
  const num = Number(valueStr);
  if (!Number.isFinite(num)) return valueStr;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

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
  description: 'Listar contratos da organizacao (somente leitura). Retorna tabela com ID, nome, cliente, tipo, modalidade, situacao, expiracao e valor total de cada contrato. Filtros opcionais por cliente (client_ids CSV), tipo de contrato (contract_type_ids CSV) e situacao (status CSV: actives, readjust, expired — por padrao a API lista apenas actives). Os valores monetarios so sao exibidos para usuarios com a permissao "Visualizar valores dos tickets".',
  inputSchema: {
    type: 'object',
    properties: {
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

function formatContractsList(contracts, offset, limit, verbosity) {
  const v = verbosity || 'rich';

  if (!contracts || contracts.length === 0) {
    return (
      'Nenhum contrato encontrado.\n\n' +
      '*Por padrao, apenas contratos ativos sao listados. Use `status:"actives,readjust,expired"` para incluir todos, ' +
      'ou verifique os filtros aplicados e suas permissoes.*'
    );
  }

  let text = `**Contratos (${contracts.length})**\n\n`;
  text += '| ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Valor total |\n';
  text += '|---|---|---|---|---|---|---|---|\n';

  contracts.forEach(c => {
    const modality = MODALITY_LABELS[c.modality] || c.modality || '—';
    const status = STATUS_LABELS[c.status] || c.status || '—';
    const clientName = c.client?.name || '—';
    const typeName = c.contract_type?.name || '—';
    const expiration = c.expiration_date || '—';
    const totalValue = formatBRL(c.total_value);
    text += `| ${c.id} | ${c.name || '—'} | ${clientName} | ${typeName} | ${modality} | ${status} | ${expiration} | ${totalValue} |\n`;
  });

  const paginationInfo = pagination(
    { offset, limit, count: contracts.length, unit: 'contratos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { client_ids, contract_type_ids, status, limit, offset } = args;

  try {
    const filters = {};

    if (client_ids !== undefined) filters.client_ids = client_ids;
    if (contract_type_ids !== undefined) filters.contract_type_ids = contract_type_ids;
    if (status !== undefined) filters.status = status;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

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
    return textResponse(formatContractsList(contracts, effectiveOffset, effectiveLimit, verbosity));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar contratos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractsList };

/**
 * Slice: list_contracts — lista contratos da organizacao.
 *
 * Endpoint: GET /contracts (via api.listContracts).
 * Filtros opcionais (todos CSV): client_ids, contract_type_ids, status
 * (actives|readjust|expired) + paginacao offset/limit.
 *
 * Read-only: a API v2 expoe apenas GET /contracts e PUT /contracts/{id};
 * nao existe GET /contracts/{id}, por isso nao ha tool de detalhe.
 * Tambem nao existe endpoint de listagem de tipos de contrato — por isso
 * include_details expoe client.id e contract_type.id, que alimentam os
 * filtros client_ids e contract_type_ids.
 *
 * Saida default (9 colunas): ID, Nome, Cliente, Tipo, Modalidade, Situacao
 * (com sufixo "(cancelado)" quando cancelled=true), Expiracao, Reajuste,
 * Valor total. Com include_details:true, um bloco extra por contrato exibe
 * os IDs e os campos monetarios detalhados; include_details e rendering-only
 * e nunca repassado a API.
 *
 * Observacao de permissao: os campos monetarios (rider_tax, rider_value,
 * total_value) so aparecem para usuarios com a permissao "Visualizar valores
 * dos tickets"; sem ela a API retorna "--" nesses campos.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { footer, pagination, currencyBRL } = require('../_shared/format');
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
  description: 'Listar contratos da organizacao (somente leitura). Retorna tabela com 9 colunas: ID, Nome, Cliente, Tipo, Modalidade, Situacao (com "(cancelado)" quando aplicavel), Expiracao, Reajuste e Valor total. Filtros opcionais por cliente (client_ids CSV), tipo de contrato (contract_type_ids CSV) e situacao (status CSV: actives, readjust, expired — por padrao a API lista apenas actives). Com include_details:true exibe bloco extra por contrato com IDs de cliente e tipo (uteis nos filtros, pois nao ha endpoint de listagem de tipos de contrato) e campos monetarios detalhados. Os valores monetarios so sao exibidos para usuarios com a permissao "Visualizar valores dos tickets".',
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

function formatContractsList(contracts, offset, limit, verbosity, include_details, total) {
  const v = verbosity || 'rich';

  if (!contracts || contracts.length === 0) {
    return (
      'Nenhum contrato encontrado.\n\n' +
      '*Por padrao, apenas contratos ativos sao listados. Use `status:"actives,readjust,expired"` para incluir todos, ' +
      'ou verifique os filtros aplicados e suas permissoes.*'
    );
  }

  let text = `**Contratos (${contracts.length})**\n\n`;
  text += '| ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Reajuste | Valor total |\n';
  text += '|---|---|---|---|---|---|---|---|---|\n';

  contracts.forEach(c => {
    const modality = MODALITY_LABELS[c.modality] || c.modality || '—';
    const statusLabel = `${STATUS_LABELS[c.status] || c.status || '—'}${c.cancelled ? ' (cancelado)' : ''}`;
    const clientName = c.client?.name || '—';
    const typeName = c.contract_type?.name || '—';
    const expiration = c.expiration_date || '—';
    const readjustment = c.readjustment_date || '—';
    const totalValue = currencyBRL(c.total_value);
    text += `| ${c.id} | ${c.name || '—'} | ${clientName} | ${typeName} | ${modality} | ${statusLabel} | ${expiration} | ${readjustment} | ${totalValue} |\n`;
  });

  if (include_details) {
    text += '\n**Detalhes**\n';
    contracts.forEach(c => {
      const clientId = c.client?.id ?? '—';
      const typeId = c.contract_type?.id ?? '—';
      const duration = c.duration != null ? `${c.duration} meses` : '—';
      const readjustDuration = c.readjust_duration != null ? `${c.readjust_duration} meses` : '—';
      const riderValue = currencyBRL(c.rider_value);
      const riderTax = currencyBRL(c.rider_tax);
      text += `- **#${c.id}** · cliente ID ${clientId} · tipo ID ${typeId} · duracao: ${duration} · reajuste a cada ${readjustDuration} · adicional: ${riderValue} (taxa ${riderTax})\n`;
    });
  }

  const paginationInfo = pagination(
    { offset, limit, count: contracts.length, total, unit: 'contratos' },
    v
  );
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';
  return `${text}\n${paginationInfo}${sep}${footerStr}`;
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

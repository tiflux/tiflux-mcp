/**
 * Slice: list_contract_types — lista tipos de contrato da organizacao.
 *
 * Endpoint: GET /contract-types (via api.listContractTypes).
 *
 * Sem parametro de busca — a API nao aceita `search` neste endpoint
 * (controller so herda Validate::OffsetLimit). Mesmo padrao simples de
 * list_desk_priorities/list_departments: tabela pequena, so paginacao.
 *
 * Os IDs retornados sao os aceitos no filtro `contract_type_ids` de
 * `GET /contracts` (list_contracts) — esta tool substitui o workaround de
 * rodar list_contracts com include_details:true so para descobrir esses IDs.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { footer, pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { parseIntStrict } = require('../_shared/validators');
const { modalityLabel } = require('../_shared/contractModality');

// Bounds do endpoint (Swagger GET /contract-types): `offset` e NUMERO DA PAGINA
// (default 1, minimo 1); `limit` sao itens por pagina (default 20, min 1, max 200).
const OFFSET_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;

const schema = {
  name: 'list_contract_types',
  description: 'Listar os tipos de contrato cadastrados na organização: ID, nome e modalidade (texto humanizado, ex: "Horas", "Compartilhado", "Crédito"). Sem parâmetro de busca — apenas paginação (offset/limit). Os IDs retornados são os aceitos no filtro `contract_type_ids` de `list_contracts`: use esta tool para descobrir esses IDs em vez de rodar `list_contracts` com `include_details:true`. Requer permissão "Visualizar contratos".',
  inputSchema: {
    type: 'object',
    properties: {
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function renderContractTypeRow(type) {
  const modality = type.modality || '—';
  return `| ${type.id} | ${type.name || '—'} | ${modality} |\n`;
}

function formatContractTypesList(types, offset, limit, verbosity, total) {
  const v = verbosity || 'rich';

  if (!types || types.length === 0) {
    return (
      'Nenhum tipo de contrato encontrado.\n\n' +
      '*Verifique se a organização possui tipos de contrato cadastrados.*'
    );
  }

  const head = `**Tipos de contrato (${types.length})**\n\n` +
    '| ID | Nome | Modalidade |\n' +
    '|---|---|---|\n';

  const rows = types.map(renderContractTypeRow);
  const paginationInfo = pagination({ offset, limit, count: types.length, total, unit: 'tipos' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';

  return `${head}${rows.join('')}\n${paginationInfo}${sep}${footerStr}`;
}

async function execute(args, { api, verbosity }) {
  const { limit, offset } = args;

  // Validacao ANTES do try: input externo invalido ('abc', 1.5, -1) vira erro
  // explicito de validacao, em vez de ser coagido em silencio. Mesmo padrao de
  // list_knowledge_folders — valores validos sao so clampados aos bounds do
  // Swagger (listagem read-only nao deve falhar por estar fora da faixa).
  const filters = {};
  if (limit !== undefined) {
    filters.limit = Math.min(Math.max(parseIntStrict(limit, 'limit'), LIMIT_MIN), LIMIT_MAX);
  }
  if (offset !== undefined) {
    filters.offset = Math.max(parseIntStrict(offset, 'offset'), OFFSET_MIN);
  }

  try {
    const response = await api.listContractTypes(filters);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar tipos de contrato**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissões ("Visualizar contratos").*`
      );
    }

    const rawTypes = response.data || [];
    // Modalidade traduzida para PT-BR (mesmo rotulo de list_contracts); vazio vira '—'
    // (blueprint Rails tem `rescue ""` quando a traducao falta).
    const types = rawTypes.map(t => ({ ...t, modality: modalityLabel(t.modality) }));

    return textResponse(formatContractTypesList(types, filters.offset || OFFSET_MIN, filters.limit || 20, verbosity, response.total));
  } catch (error) {
    return internalErrorResponse(
      '**❌ Erro interno ao listar tipos de contrato**',
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractTypesList };

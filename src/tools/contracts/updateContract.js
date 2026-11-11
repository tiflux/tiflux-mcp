/**
 * Slice: update_contract — edicao parcial de um contrato individual, em escopo restrito.
 *
 * Endpoint: PUT /contracts/{id} (via api.updateContract). Body flat.
 *
 * Reverte em escopo restrito a decisao read-only do BL-036: so os campos de
 * cadastro do contrato (UPDATABLE_FIELDS) sao aceitos. O objeto `rider`
 * (valor, desconto, horas, hora excedente, credito, valor fixo, dia de
 * vencimento) fica FORA — mexe em faturamento/consumo de cliente real e libera
 * avisos de consumo. Os campos de faturamento (`automatic_billing`,
 * `billing_days_before`, `billing_in_batch`) tambem ficam FORA por decisao
 * humana no PR #131 (2026-11-10): mexem em cobranca e recalculam ciclos.
 * Args fora da allow-list nunca vao no body.
 *
 * Regras da API (Swagger 2026-11-10 + validacao viva na base de teste):
 *   - Permissao "Gerenciar contratos" (403 sem ela; usuario-cliente nunca tem).
 *   - So contratos de Horas e Credito sao editaveis; contrato-membro de grupo
 *     Compartilhado responde 422 `modality: "...(shared) is not supported..."`
 *     (o GET do mesmo membro responde 404 — inconsistencia reportada a API).
 *   - So aceita ID de CONTRATO. Grupo de contrato nao tem PUT na API v2 e e
 *     outra tabela, com numeracao INDEPENDENTE: um ID de grupo que coincida com
 *     o ID de um contrato individual editavel da mesma organizacao edita ESSE
 *     contrato (nao ha 422). Sem pre-voo contra a colisao (decisao do PR #131);
 *     a description avisa e a saida mostra o nome do contrato alterado.
 *   - Todos os 422 sao 42202 — o mapeamento e por `detail`, nao por error_code.
 *   - Cada campo alterado grava uma linha no historico (`get_contract_history`,
 *     descricao com prefixo `[API]`).
 */

const { textResponse } = require('../_shared/response');
const {
  errorResponse, internalErrorResponse, apiFailureResponse,
  extractApiErrorCode, extractApiErrorDetail, formatApiErrorDetail
} = require('../_shared/errors');
const { dateTime } = require('../_shared/format');
const {
  contractsLicenseErrorResponse, contractApiErrorResponse, requirePositiveIdField
} = require('../_shared/contractShared');

const UPDATABLE_FIELDS = [
  'allow_appointment',
  'permit_appointments_readjustment',
  'automatic_renewal',
  'name',
  'technical_observations'
];

const BOOLEAN_FIELDS = new Set(['allow_appointment', 'permit_appointments_readjustment', 'automatic_renewal']);

const FIELD_LABELS = {
  allow_appointment: 'Permite apontar',
  permit_appointments_readjustment: 'Permite apontamento pendente de reajuste',
  automatic_renewal: 'Renovação automática',
  name: 'Nome',
  technical_observations: 'Observações técnicas'
};

const NAME_MAX = 255;

const MANAGE_PERMISSION_HINT =
  '*Editar contrato exige a permissão "Gerenciar contratos" (usuário-cliente não tem acesso). ' +
  'A API também responde 403 quando o contrato não pertence à sua organização — confira o ID em `list_contracts`.*';

const schema = {
  name: 'update_contract',
  description: 'Editar campos de cadastro de um contrato individual (PUT parcial — só os campos informados são enviados). Aceita SOMENTE ID de contrato (o ID de list_contracts kind=contract, linha sem sufixo "· grupo", ou o de get_contract). Grupo de contrato NÃO é editável por esta tool: a API v2 não tem PUT de grupo, e grupo e contrato têm numerações independentes — passar um ID de grupo altera o contrato avulso que tiver o mesmo número. Contrato-membro de grupo Compartilhado também é recusado pela API (422 de modalidade); grupo e membros seguem pelo portal. Campos aceitos: allow_appointment ("Permitir apontar"; com false, os aditivos do contrato somem de get_ticket_service_types e create_appointment é recusado), permit_appointments_readjustment, automatic_renewal, name e technical_observations. Fora do escopo: o aditivo (valor, desconto, horas, hora excedente, crédito, valor fixo, dia de vencimento) e o faturamento (faturamento automático, dias antes do vencimento, faturamento em lote), que mexem em cobrança e ciclos — continuam pelo portal. Só contratos de Horas e Crédito são editáveis pela API. Cada campo alterado grava uma linha no histórico do contrato (get_contract_history, prefixo "[API]"). Requer a permissão "Gerenciar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: {
        type: 'number',
        description: 'ID do contrato — SOMENTE contrato (list_contracts kind=contract, linha sem sufixo "· grupo", ou get_contract). Nunca um ID de grupo: as numerações são independentes e o PUT editaria o contrato avulso de mesmo número. Inteiro positivo, obrigatório.'
      },
      allow_appointment: {
        type: 'boolean',
        description: '"Permitir apontar". false bloqueia novos apontamentos nos aditivos deste contrato; true libera.'
      },
      permit_appointments_readjustment: {
        type: 'boolean',
        description: 'Permitir apontamento quando o contrato está pendente de reajuste (o último aditivo vencido continua aceitando apontamentos até o reajuste).'
      },
      automatic_renewal: {
        type: 'boolean',
        description: 'Renovação automática.'
      },
      name: {
        type: 'string',
        description: 'Novo nome do contrato (até 255 caracteres).'
      },
      technical_observations: {
        type: 'string',
        description: 'Observações técnicas (substitui o texto atual).'
      }
    },
    required: ['contract_id']
  }
};

function buildBody(args) {
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }
  if (typeof body.name === 'string') body.name = body.name.trim();
  return body;
}

function invalid(contractId, message) {
  return errorResponse(`**❌ Não foi possível atualizar o contrato #${contractId}**\n\n${message}`);
}

/** Guardas locais (sem request). Devolve resposta de erro ou null. */
function validateBody(contractId, body) {
  if (Object.keys(body).length === 0) {
    return invalid(contractId, `Nenhum campo para atualizar. Informe ao menos um entre: ${UPDATABLE_FIELDS.join(', ')}.\n\n` +
      '*O aditivo (valor, horas, desconto, vencimento) e o faturamento não são editáveis por esta tool.*');
  }
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      return invalid(contractId, `\`${field}\` deve ser true ou false.`);
    }
  }
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') return invalid(contractId, '`name` não pode ser vazio.');
    if (body.name.length > NAME_MAX) return invalid(contractId, `\`name\` tem ${body.name.length} caracteres; o máximo é ${NAME_MAX}.`);
  }
  if (body.technical_observations !== undefined && typeof body.technical_observations !== 'string') {
    return invalid(contractId, '`technical_observations` deve ser texto.');
  }
  return null;
}

/** Mensagens da API (detail) achatadas em uma lista de strings. */
function detailMessages(detail, key) {
  return [detail?.[key]].flat().filter(m => typeof m === 'string');
}

function detailIncludes(detail, key, fragment) {
  return detailMessages(detail, key).some(m => m.includes(fragment));
}

/** 422 por `detail` (todos vem 42202). Null quando nao reconhece — cai no generico. */
function mapped422(contractId, detail) {
  if (detailIncludes(detail, 'modality', '(shared)')) {
    return 'O ID informado é de um contrato-membro de grupo de contrato (Compartilhado). ' +
      'Membros e grupos não são editáveis pela API — edite pelo portal do TiFlux.';
  }
  if (detailIncludes(detail, 'modality', 'not supported')) {
    return 'Só contratos de **Horas** e **Crédito** são editáveis pela API. A modalidade deste contrato não é suportada — edite pelo portal do TiFlux.';
  }
  if (detailIncludes(detail, 'errors', 'cancelled contract')) {
    return `O contrato #${contractId} está cancelado e não pode ser editado.`;
  }
  if (detailIncludes(detail, 'active', 'inactive contract')) {
    return `O contrato #${contractId} está inativo e não pode ser editado.`;
  }
  if (detailIncludes(detail, 'errors', 'no active rider')) {
    return `O contrato #${contractId} não tem aditivo ativo, então não pode ser editado pela API.`;
  }
  return null;
}

function apiErrorResult(contractId, response) {
  const errorCode = extractApiErrorCode(response);
  const title = `Erro ao atualizar contrato #${contractId}`;

  if (errorCode === 40304) return contractsLicenseErrorResponse();

  if (errorCode === 40301 || response.status === 403) {
    return contractApiErrorResponse(`Sem permissão para editar o contrato #${contractId}`, response, MANAGE_PERMISSION_HINT);
  }

  if (errorCode === 40401 || response.status === 404) {
    return contractApiErrorResponse(
      `Contrato #${contractId} não encontrado`,
      response,
      '*Confira o ID em `list_contracts` (linhas sem "· grupo"). Grupo de contrato não é editável por esta tool.*'
    );
  }

  if (response.status === 422) {
    const detail = extractApiErrorDetail(response);
    const known = mapped422(contractId, detail);
    if (known) return contractApiErrorResponse(title, response, known);
    const fields = formatApiErrorDetail(response);
    return contractApiErrorResponse(
      `${title}: dados inválidos`,
      response,
      `${fields}\n*Corrija o(s) campo(s) indicado(s) e tente novamente.*`
    );
  }

  return apiFailureResponse(`**❌ ${title}**`, response, '*Verifique os dados informados e suas permissões.*');
}

function displayValue(field, value) {
  if (value === null || value === undefined) return '—';
  if (BOOLEAN_FIELDS.has(field)) return value ? 'Sim' : 'Não';
  return String(value);
}

function formatUpdated(contractId, body, data) {
  const c = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const lines = [
    `**✅ Contrato #${c.id ?? contractId} atualizado**`,
    '',
    `**Contrato:** ${c.name || body.name || '—'} (#${c.id ?? contractId})`,
    '**Campos alterados:**'
  ];
  for (const field of Object.keys(body)) {
    // Mostra o valor que a API devolveu (estado final); cai no enviado se a resposta nao trouxer o campo.
    const value = c[field] !== undefined ? c[field] : body[field];
    lines.push(`- ${FIELD_LABELS[field]}: ${displayValue(field, value)}`);
  }
  if (c.updated_at) lines.push('', `**Atualizado em:** ${dateTime(c.updated_at)}`);
  lines.push('', '*Cada campo alterado grava uma linha no histórico do contrato (`get_contract_history`, descrição com prefixo "[API]").*');
  return lines.join('\n');
}

async function execute(args, { api }) {
  const contract_id = requirePositiveIdField(args, 'contract_id');
  const body = buildBody(args);

  const invalidResponse = validateBody(contract_id, body);
  if (invalidResponse) return invalidResponse;

  try {
    const response = await api.updateContract(contract_id, body);
    if (response.error) return apiErrorResult(contract_id, response);
    return textResponse(formatUpdated(contract_id, body, response.data));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar contrato #${contract_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute, UPDATABLE_FIELDS };

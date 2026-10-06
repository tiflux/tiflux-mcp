/**
 * Slice: get_contract_group — detalhe de um grupo de contrato (modalidade Compartilhado).
 *
 * Endpoint: GET /contract-groups/{id} (via api.getContractGroup).
 *
 * Contratos e grupos de contrato vem de tabelas distintas, com IDs independentes
 * (ver list_contracts, campo `kind`). O `contract_group_id` precisa vir de uma
 * linha "· grupo" de list_contracts — um ID de contrato comum nao serve aqui
 * (a API devolve 404).
 *
 * Mascaramento de valores (A5 — a divergencia antiga foi REFUTADA e corrigida
 * pela API, ver api-analysis.md da spec 2026-10-01 e a atualizacao 2026-10-05):
 * `value`/`discount_value`/`tax` do ultimo aditivo vem "--" sem a permissao
 * "Visualizar valores dos tickets", igual a list_contracts/get_contract. A
 * tool renderiza o que a API devolve, sem mascara propria.
 *
 * `last_rider` pode ser um aditivo CANCELADO (a API usa
 * `order(:rider,:release).last` sem filtrar cancelamento, e a view usada aqui
 * nao traz flag de cancelamento) — por isso o rotulo e sempre "Ultimo aditivo",
 * nunca "aditivo vigente".
 *
 * Situacao (A3/H5): a API so expoe `active` neste endpoint (sem `expired`),
 * entao `groupSituacao()` deriva Expirado/Cancelado/Inativo/Ativo a partir de
 * `expiration_date` e `last_rider.cancelled` — ver precedencia no comentario
 * da funcao.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { footer, currencyBRL, truncate, appendWithinBudget, dateOnly } = require('../_shared/format');
const {
  contractsLicenseErrorResponse, contractApiErrorResponse, contractsAccessDeniedResponse,
  requirePositiveIdField, isObjectPayload, unexpectedPayloadResponse,
  discountCell, formatBilling, formatConsumptionReminder, lastRiderHeaderLines
} = require('../_shared/contractShared');

// Teto local da secao de membros (nao e o RESPONSE_ITEM_BUDGET da resposta inteira —
// so evita que um grupo com centenas de membros estoure sozinho; cabecalho + aditivo +
// observacoes cabem confortavelmente no que sobra ate a rede global de 60k).
const MEMBERS_BUDGET = 20000;

const schema = {
  name: 'get_contract_group',
  description: 'Buscar o detalhe de um grupo de contrato (modalidade Compartilhado) pelo ID: nome, cliente, tipo, situação (Ativo/Inativo/Expirado/Cancelado — derivada da expiração e do cadastro; o endpoint devolve 200 mesmo para grupo inativo ou expirado, que list_contracts esconde), expiração, duração, renovação automática, faturamento (automático com N dias antes do vencimento, ou em lote), lembrete de consumo (percentual e e-mails), último aditivo (número, versão, dia de vencimento, valor mensal, taxa, desconto em R$ ou %, descrição) e os contratos-membro do grupo. O ID precisa vir de uma linha "· grupo" de list_contracts — grupos e contratos têm IDs independentes, o mesmo número pode existir nos dois, e um ID de contrato comum não serve aqui (404). Campos monetários do aditivo (valor, desconto, taxa) vêm "--" sem a permissão "Visualizar valores dos tickets" — mesma regra de list_contracts e get_contract. Requer permissão "Visualizar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_group_id: {
        type: 'number',
        description: 'ID do grupo de contrato (obtido de uma linha "· grupo" em list_contracts). Inteiro positivo, obrigatório.'
      }
    },
    required: ['contract_group_id']
  }
};

/**
 * Situacao do grupo (A3/H5), com precedencia: cancelado (`last_rider.cancelled`
 * — a view `:shared` do aditivo nao traz esse campo hoje, entao este caso e
 * defensivo, so dispara se a API passar a mandar) > expirado (`expiration_date`
 * no passado, em America/Sao_Paulo) > inativo (`active:false`) > ativo.
 */
function groupSituacao(group) {
  if (group.last_rider?.cancelled) return 'Cancelado';
  if (group.expiration_date) {
    const today = dateOnly(new Date().toISOString());
    const expiration = dateOnly(group.expiration_date);
    if (expiration < today) return 'Expirado';
  }
  if (group.active === false) return 'Inativo';
  return 'Ativo';
}

function formatLastRiderRich(lastRider) {
  if (!lastRider) return '*Nenhum aditivo encontrado.*\n';
  const descricao = lastRider.description ? truncate(lastRider.description, 800) : '—';
  const lines = [
    ...lastRiderHeaderLines(lastRider),
    `- Taxa: ${currencyBRL(lastRider.tax)}`,
    `- Desconto: ${discountCell(lastRider.discount_type, lastRider.discount_value)}`,
    `- Descrição: ${descricao}`
  ];
  return lines.join('\n') + '\n';
}

function formatMembersRich(contracts) {
  const list = contracts || [];
  if (list.length === 0) return '**Contratos do grupo (0)**\n_Nenhum contrato-membro encontrado._\n';

  const items = list.map(c => `- #${c.id} ${c.name}\n`);
  const fit = appendWithinBudget(items, { maxChars: MEMBERS_BUDGET });
  const shownText = items.slice(0, fit.shown).join('');
  const notice = fit.truncated ? `\n_+${list.length - fit.shown} membros não exibidos._\n` : '';
  return `**Contratos do grupo (${list.length})**\n${shownText}${notice}`;
}

function formatMembersCompact(contracts) {
  const list = contracts || [];
  if (list.length === 0) return '—';
  return list.map(c => `#${c.id} ${c.name}`).join('; ');
}

function formatContractGroup(group, verbosity) {
  const v = verbosity || 'rich';
  const situacao = groupSituacao(group);

  if (v === 'compact') {
    const clientLabel = group.client ? `${group.client.name} (#${group.client.id})` : '—';
    const valorMensal = currencyBRL(group.last_rider?.value);
    let text = `**${group.name || 'N/A'}** (#${group.id})\n`;
    text += `Cliente: ${clientLabel} · Situação: ${situacao} · Valor mensal: ${valorMensal}\n`;
    text += `Membros: ${formatMembersCompact(group.contracts)}`;
    return text;
  }

  const clientLine = group.client ? `${group.client.name} (#${group.client.id})` : '—';
  const typeLine = group.contract_type ? `${group.contract_type.name} (#${group.contract_type.id})` : '—';
  const duracaoLine = group.duration != null ? `${group.duration} meses` : '—';
  const observacoes = group.technical_observations ? truncate(group.technical_observations, 800) : null;

  const lines = [
    `## ${group.name || 'N/A'} (#${group.id})`,
    '',
    `**Cliente:** ${clientLine}`,
    `**Tipo:** ${typeLine}`,
    `**Situação:** ${situacao}`,
    `**Expiração:** ${group.expiration_date || '—'}`,
    `**Duração:** ${duracaoLine}`,
    `**Renovação automática:** ${group.automatic_renewal ? 'Sim' : 'Não'}`,
    `**Faturamento:** ${formatBilling(group)}`,
    `**Lembrete de consumo:** ${formatConsumptionReminder(group.consumption_reminder)}`,
    '',
    formatLastRiderRich(group.last_rider),
    formatMembersRich(group.contracts)
  ];

  if (observacoes) lines.push(`**Observações técnicas:** ${observacoes}`);

  lines.push('', footer(v));

  return lines.join('\n');
}

async function execute(args, { api, verbosity }) {
  const contract_group_id = requirePositiveIdField(args, 'contract_group_id');

  try {
    const response = await api.getContractGroup(contract_group_id);

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40401 || response.status === 404) {
        return contractApiErrorResponse(
          `Grupo de contrato #${contract_group_id} não encontrado`,
          response,
          `*O ID precisa vir de uma linha "· grupo" de \`list_contracts\` — grupos e contratos têm IDs ` +
          `independentes, e um ID de contrato comum não serve aqui.*`
        );
      }

      if (errorCode === 40304) return contractsLicenseErrorResponse();

      if (errorCode === 40301 || response.status === 403) {
        return contractsAccessDeniedResponse(`Acesso negado ao grupo de contrato #${contract_group_id}`, response, errorCode);
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar grupo de contrato #${contract_group_id}**`,
        response,
        '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
      );
    }

    if (!isObjectPayload(response.data)) {
      return unexpectedPayloadResponse(`grupo de contrato #${contract_group_id}`, 'do grupo', `o grupo #${contract_group_id}`);
    }

    return textResponse(formatContractGroup(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar grupo de contrato #${contract_group_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractGroup };

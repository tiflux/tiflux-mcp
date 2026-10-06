/**
 * Slice: get_contract — detalhe de um contrato individual (nao-Compartilhado).
 *
 * Endpoint: GET /contracts/{id} (via api.getContract).
 *
 * 404 especial: um contrato que e MEMBRO de um grupo de contrato (modalidade
 * Compartilhado) responde 404 nesta rota mesmo com o ID existindo — o
 * controller Rails checa `@contract.is_shared?` explicitamente antes de
 * renderizar ("Contrato membro de grupo e consultado pelo grupo, como na
 * listagem"). A API nao expoe essa distincao no corpo do erro (mesmo shape de
 * "nao encontrado" para ID inexistente ou ID de membro), entao a mensagem de
 * 404 cobre as duas possibilidades e sugere `get_contract_group` quando
 * aplicavel — mesma armadilha ja documentada em get_contract_group (IDs de
 * contrato e de grupo sao independentes e podem colidir; `kind` de
 * list_contracts indica qual rota usar).
 *
 * Mascaramento de valores: mesma regra de get_contract_group/list_contracts —
 * campos monetarios do aditivo vem "--" sem a permissao "Visualizar valores
 * dos tickets"; a tool renderiza o que a API devolve, sem mascara propria.
 *
 * Formatadores do cadastro (desconto, faturamento, lembrete de consumo,
 * cabecalho do ultimo aditivo) e respostas de erro comuns as tools de
 * contrato vivem em `_shared/contractShared.js` (extraidos no pos-review do
 * PR #109, duplicacao apontada pelo SonarCloud).
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { footer, currencyBRL, truncate, dateTime } = require('../_shared/format');
const { modalityLabel, periodLabel, billingLabel } = require('../_shared/contractModality');
const {
  contractsLicenseErrorResponse, contractApiErrorResponse, contractsAccessDeniedResponse,
  requirePositiveIdField, isObjectPayload, unexpectedPayloadResponse,
  discountCell, formatBilling, formatConsumptionReminder, lastRiderHeaderLines
} = require('../_shared/contractShared');

const schema = {
  name: 'get_contract',
  description: 'Buscar o detalhe de um contrato individual (nao-Compartilhado) pelo ID: nome, cliente, tipo de contrato (nome + modalidade), situação (ativo/inativo/expirado/cancelado/cancelamento agendado, faturado, com apontamentos), expiração, duração, renovação automática, permite apontamento pendente de reajuste, faturamento (automático com N dias, ou em lote), lembrete de consumo, observações técnicas, datas de criação/atualização e o último aditivo (número, versão, vencimento, valor, desconto, descrição, período de fechamento, periodicidade, cobrança, e campos específicos por modalidade quando presentes no payload — franquia de horas e valor da hora excedente em Horas/Horas cumulativas, franquia de atendimentos em Por atendimento, valores externo/interno/remoto em Crédito, limite de equipamentos em Livre — e itens, quando aplicável). Para saber quanto do contrato já foi consumido e o saldo por ciclo de faturamento, use get_contract_usage. Atenção: um contrato que é MEMBRO de um grupo de contrato (modalidade Compartilhado) responde 404 aqui mesmo que o ID exista — use get_contract_group nesse caso (o campo `kind` de list_contracts indica qual rota usar: "contract" → get_contract, "contract_group" → get_contract_group). Campos monetários do aditivo vêm "--" sem a permissão "Visualizar valores dos tickets". Requer permissão "Visualizar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: {
        type: 'number',
        description: 'ID do contrato (obtido de uma linha de list_contracts sem sufixo "· grupo"). Inteiro positivo, obrigatório.'
      }
    },
    required: ['contract_id']
  }
};

/** Situação do contrato: precedência cancelado > cancelamento agendado > expirado > inativo > ativo. */
function situacaoLabel(contract) {
  if (contract.cancelled) return 'Cancelado';
  if (contract.cancellation_scheduled) return 'Cancelamento agendado';
  if (contract.expired) return 'Expirado';
  if (contract.inactive) return 'Inativo';
  if (contract.active) return 'Ativo';
  return '—';
}

function formatRiderItems(items) {
  const list = items || [];
  if (list.length === 0) return '';
  const lines = list.map(i => {
    const qtd = i.qtd ?? '—';
    const unit = currencyBRL(i.value);
    const total = currencyBRL(i.total_value);
    return `  - ${i.name || '—'} (#${i.id}) · qtd ${qtd} · unitário ${unit} · total ${total}`;
  });
  return `- Itens:\n${lines.join('\n')}\n`;
}

/** `qtd_hours_decimal` com 1 casa e vírgula (ex: 30 → "30,0 h") — franquia da API costuma vir redonda. */
function decimalHour(n) {
  return `${Number(n).toFixed(1).replace('.', ',')} h`;
}

// Campos do aditivo por modalidade (A2/H3): a API tem uma view por modalidade
// no aditivo (`contract_rider_blueprint.rb`), mas so expoe os campos que de
// fato existem naquele aditivo — a decisao de renderizar e SEMPRE por
// presenca do campo no payload (`!= null`), nunca checando
// `contract.contract_type.modality` (o slice nao tem esse dado aqui e nao
// deveria depender dele: ver guardrail BE-003, isso e so apresentacao). Um
// helper por grupo de campos mantem a complexidade ciclomatica baixa.

function commonRiderLines(lastRider) {
  const lines = [];
  if (lastRider.start_date != null) lines.push(`- Início: ${lastRider.start_date}`);
  // `cancel_date` e o FIM DA VIGENCIA do aditivo (portal: "Data de expiracao";
  // start_date + duration - 1 dia), preenchido em todo aditivo. So vira data de
  // cancelamento quando `cancelled: true` (aditivo de cancelamento).
  if (lastRider.cancelled) {
    lines.push(`- Cancelado em ${lastRider.cancel_date ?? '—'}`);
  } else if (lastRider.cancel_date != null) {
    lines.push(`- Fim da vigência: ${lastRider.cancel_date}`);
  }
  if (lastRider.period_name != null) lines.push(`- Periodicidade: ${periodLabel(lastRider.period_name)}`);
  if (lastRider.billing_name != null) lines.push(`- Cobrança: ${billingLabel(lastRider.billing_name)}`);
  if (lastRider.closing_period_name) lines.push(`- Período de fechamento: ${periodLabel(lastRider.closing_period_name)}`);
  return lines;
}

/** Horas / Horas cumulativas. */
function hoursRiderLines(lastRider) {
  const lines = [];
  if (lastRider.qtd_hours != null) {
    const decimal = lastRider.qtd_hours_decimal != null ? ` (${decimalHour(lastRider.qtd_hours_decimal)})` : '';
    lines.push(`- Franquia de horas: ${lastRider.qtd_hours}${decimal}`);
  }
  if (lastRider.surplus_hour_value != null) lines.push(`- Valor da hora excedente: ${currencyBRL(lastRider.surplus_hour_value)}`);
  if (lastRider.accumulation_cycle != null) lines.push(`- Ciclo de acumulação: ${lastRider.accumulation_cycle} fechamento(s)`);
  return lines;
}

/** Por atendimento. */
function ticketRiderLines(lastRider) {
  const lines = [];
  if (lastRider.qtd_tickets != null) lines.push(`- Franquia de atendimentos: ${lastRider.qtd_tickets}`);
  if (lastRider.surplus_ticket_value != null) lines.push(`- Valor do atendimento excedente: ${currencyBRL(lastRider.surplus_ticket_value)}`);
  return lines;
}

/** Crédito. */
function creditRiderLines(lastRider) {
  const lines = [];
  if (lastRider.external_value != null) lines.push(`- Valor externo: ${currencyBRL(lastRider.external_value)}`);
  if (lastRider.internal_value != null) lines.push(`- Valor interno: ${currencyBRL(lastRider.internal_value)}`);
  if (lastRider.remote_value != null) lines.push(`- Valor remoto: ${currencyBRL(lastRider.remote_value)}`);
  return lines;
}

/** Livre. */
function freeRiderLines(lastRider) {
  const lines = [];
  if (lastRider.max_equipments != null) lines.push(`- Máx. de equipamentos: ${lastRider.max_equipments}`);
  if (lastRider.additional_equipment_value != null) lines.push(`- Valor por equipamento adicional: ${currencyBRL(lastRider.additional_equipment_value)}`);
  return lines;
}

function formatLastRiderRich(lastRider) {
  if (!lastRider) return '*Nenhum aditivo encontrado.*\n';
  const descricao = lastRider.description ? truncate(lastRider.description, 800) : '—';
  // `tax` nao aparece no exemplo da Swagger de GET /contracts/{id} (aparece no
  // de contract-groups); mantido defensivo — so renderiza se a API mandar.
  const taxLine = lastRider.tax !== undefined ? [`- Taxa: ${currencyBRL(lastRider.tax)}`] : [];
  const createdByLine = lastRider.created_by?.name ? [`- Criado por: ${lastRider.created_by.name}`] : [];

  const lines = [
    ...lastRiderHeaderLines(lastRider),
    ...taxLine,
    `- Desconto: ${discountCell(lastRider.discount_type, lastRider.discount_value)}`,
    ...commonRiderLines(lastRider),
    ...hoursRiderLines(lastRider),
    ...ticketRiderLines(lastRider),
    ...creditRiderLines(lastRider),
    ...freeRiderLines(lastRider),
    `- Descrição: ${descricao}`,
    ...createdByLine
  ];

  const itemsBlock = formatRiderItems(lastRider.items);
  return lines.join('\n') + '\n' + itemsBlock;
}

function formatContract(contract, verbosity) {
  const v = verbosity || 'rich';
  const situacao = situacaoLabel(contract);

  if (v === 'compact') {
    const clientLabel = contract.client ? `${contract.client.name} (#${contract.client.id})` : '—';
    const valorMensal = currencyBRL(contract.last_rider?.value);
    let text = `**${contract.name || 'N/A'}** (#${contract.id})\n`;
    text += `Cliente: ${clientLabel} · Situação: ${situacao} · Valor mensal: ${valorMensal}`;
    return text;
  }

  const clientLine = contract.client ? `${contract.client.name} (#${contract.client.id})` : '—';
  const typeLine = contract.contract_type
    ? `${contract.contract_type.name} (#${contract.contract_type.id}) · ${modalityLabel(contract.contract_type.modality)}`
    : '—';
  const duracaoLine = contract.duration != null ? `${contract.duration} meses` : '—';
  const observacoes = contract.technical_observations ? truncate(contract.technical_observations, 800) : null;

  const flags = [];
  if (contract.billed) flags.push('faturado');
  if (contract.has_appointments) flags.push('com apontamentos');
  if (contract.readjust) flags.push('pendente de reajuste');
  const flagsSuffix = flags.length > 0 ? ` (${flags.join(', ')})` : '';

  const lines = [
    `## ${contract.name || 'N/A'} (#${contract.id})`,
    '',
    `**Cliente:** ${clientLine}`,
    `**Tipo:** ${typeLine}`,
    `**Situação:** ${situacao}${flagsSuffix}`,
    `**Expiração:** ${contract.expiration_date || '—'}`,
    `**Duração:** ${duracaoLine}`,
    `**Renovação automática:** ${contract.automatic_renewal ? 'Sim' : 'Não'}`,
    `**Permite apontamento pendente de reajuste:** ${contract.permit_appointments_readjustment ? 'Sim' : 'Não'}`,
    `**Faturamento:** ${formatBilling(contract)}`,
    `**Lembrete de consumo:** ${formatConsumptionReminder(contract.consumption_reminder)}`,
    `**Criado em:** ${dateTime(contract.created_at, v)}`,
    `**Atualizado em:** ${dateTime(contract.updated_at, v)}`,
    '',
    formatLastRiderRich(contract.last_rider)
  ];

  if (observacoes) lines.push(`**Observações técnicas:** ${observacoes}`);

  lines.push('', footer(v));

  return lines.join('\n');
}

async function execute(args, { api, verbosity }) {
  const contract_id = requirePositiveIdField(args, 'contract_id');

  try {
    const response = await api.getContract(contract_id);

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40401 || response.status === 404) {
        return contractApiErrorResponse(
          `Contrato #${contract_id} não encontrado`,
          response,
          `*Isto acontece quando o ID não existe OU quando o contrato #${contract_id} é MEMBRO de um grupo de ` +
          `contrato (modalidade Compartilhado) — contratos-membro são consultados pelo grupo, não individualmente. ` +
          `Se for este o caso, use \`get_contract_group\` com o ID do grupo (coluna "· grupo" em \`list_contracts\`). ` +
          `IDs de contrato e de grupo são independentes e podem colidir.*`
        );
      }

      if (errorCode === 40304) return contractsLicenseErrorResponse();

      if (errorCode === 40301 || response.status === 403) {
        return contractsAccessDeniedResponse(`Acesso negado ao contrato #${contract_id}`, response, errorCode);
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar contrato #${contract_id}**`,
        response,
        '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
      );
    }

    if (!isObjectPayload(response.data)) {
      return unexpectedPayloadResponse(`contrato #${contract_id}`, 'do contrato', `o contrato #${contract_id}`);
    }

    return textResponse(formatContract(response.data, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar contrato #${contract_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContract };

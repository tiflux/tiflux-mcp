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
 * Duplicacao de helpers de formatacao do aditivo com getContractGroup.js
 * (discountCell/formatBilling/formatConsumptionReminder e o esqueleto de
 * formatLastRiderRich): decisao registrada na spec — duplicar em vez de
 * extrair para _shared/, guardrail de extracao e >=3 usos (aqui sao 2).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { footer, currencyBRL, truncate, dateTime } = require('../_shared/format');
const { modalityLabel } = require('../_shared/contractModality');

const schema = {
  name: 'get_contract',
  description: 'Buscar o detalhe de um contrato individual (nao-Compartilhado) pelo ID: nome, cliente, tipo de contrato (nome + modalidade), situação (ativo/inativo/expirado/cancelado/cancelamento agendado, faturado, com apontamentos), expiração, duração, renovação automática, permite apontamento pendente de reajuste, faturamento (automático com N dias, ou em lote), lembrete de consumo, observações técnicas, datas de criação/atualização e o último aditivo (número, versão, vencimento, valor, desconto, descrição, período de fechamento e itens, quando aplicável). Atenção: um contrato que é MEMBRO de um grupo de contrato (modalidade Compartilhado) responde 404 aqui mesmo que o ID exista — use get_contract_group nesse caso (o campo `kind` de list_contracts indica qual rota usar: "contract" → get_contract, "contract_group" → get_contract_group). Campos monetários do aditivo vêm "--" sem a permissão "Visualizar valores dos tickets". Requer permissão "Visualizar contratos" + Licença Tickets.',
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

/** Desconto do aditivo: R$ quando discount_type "currency", % quando "percent", cru nos demais casos. */
function discountCell(discount_type, discount_value) {
  if (discount_value === null || discount_value === undefined) return '—';
  if (discount_type === 'currency') return currencyBRL(discount_value);
  if (discount_type === 'percent') return `${discount_value}%`;
  return String(discount_value);
}

function formatBilling(contract) {
  if (contract.automatic_billing) {
    const days = contract.billing_days_before;
    const hasDays = days !== null && days !== undefined;
    const suffix = hasDays ? ` (${days} dias antes do vencimento)` : '';
    return `Automático${suffix}`;
  }
  if (contract.billing_in_batch) return 'Em lote';
  return '—';
}

function formatConsumptionReminder(reminder) {
  if (!reminder || !reminder.notification) return 'Desativado';
  const percent = reminder.percent !== null && reminder.percent !== undefined ? `${reminder.percent}%` : '—';
  const emails = reminder.emails || '—';
  return `Ativo — alerta em ${percent} de consumo; e-mails: ${emails}`;
}

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

function formatLastRiderRich(lastRider) {
  if (!lastRider) return '*Nenhum aditivo encontrado.*\n';
  const descricao = lastRider.description ? truncate(lastRider.description, 800) : '—';
  const lines = [
    '### Último aditivo',
    `- Número: ${lastRider.rider_number ?? '—'} · versão ${lastRider.release ?? '—'}`,
    `- Vencimento: dia ${lastRider.due_day ?? '—'}`,
    `- Valor mensal: ${currencyBRL(lastRider.value)}`
  ];
  // `tax` nao aparece no exemplo da Swagger de GET /contracts/{id} (aparece no
  // de contract-groups); mantido defensivo — so renderiza se a API mandar.
  if (lastRider.tax !== undefined) lines.push(`- Taxa: ${currencyBRL(lastRider.tax)}`);
  lines.push(`- Desconto: ${discountCell(lastRider.discount_type, lastRider.discount_value)}`);
  if (lastRider.closing_period_name) lines.push(`- Período de fechamento: ${lastRider.closing_period_name}`);
  lines.push(`- Descrição: ${descricao}`);
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
  // ID validado estritamente (inteiro) antes de virar path na URL — honra o
  // `type: number` do schema e nunca interpola argumento MCP cru em /contracts/{id}.
  const contract_id = requireIntField(args, 'contract_id');
  if (contract_id < 1) {
    throw new Error('contract_id deve ser um número inteiro positivo');
  }

  try {
    const response = await api.getContract(contract_id);

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40401 || response.status === 404) {
        return errorResponse(
          `**❌ Contrato #${contract_id} não encontrado**\n\n` +
          `**Código:** ${response.status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Isto acontece quando o ID não existe OU quando o contrato #${contract_id} é MEMBRO de um grupo de ` +
          `contrato (modalidade Compartilhado) — contratos-membro são consultados pelo grupo, não individualmente. ` +
          `Se for este o caso, use \`get_contract_group\` com o ID do grupo (coluna "· grupo" em \`list_contracts\`). ` +
          `IDs de contrato e de grupo são independentes e podem colidir.*`
        );
      }

      if (errorCode === 40304) {
        return errorResponse(
          '**❌ Sem licença para visualizar contratos**\n\n' +
          'Sua organização não possui licença ativa para o módulo de tickets (erro 40304).\n\n' +
          '*Entre em contato com o suporte TiFlux para verificar o licenciamento.*'
        );
      }

      if (errorCode === 40301 || response.status === 403) {
        return errorResponse(
          `**❌ Acesso negado ao contrato #${contract_id}**\n\n` +
          `**Código:** ${response.status} (erro ${errorCode || 'N/A'})\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se o usuário possui a permissão "Visualizar contratos" e se a organização tem Licença Tickets.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar contrato #${contract_id}**`,
        response,
        '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar contrato #${contract_id}**\n\n` +
        `A API retornou sucesso mas sem os dados do contrato.\n\n` +
        `*Verifique se o contrato #${contract_id} existe.*`
      );
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

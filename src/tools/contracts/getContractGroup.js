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
 * Divergencia conhecida da API (reportada ao time, #99188/#100479 — ver
 * api-analysis.md da spec): os valores monetarios do grupo NAO sao mascarados
 * para quem nao tem a permissao "Visualizar valores dos tickets", ao contrario
 * de list_contracts (que devolve "--"). O MCP renderiza o que a API devolve e
 * nao inventa mascara — nao ha como o MCP saber a permissao do usuario a partir
 * desta resposta.
 *
 * `last_rider` pode ser um aditivo CANCELADO (a API usa
 * `order(:rider,:release).last` sem filtrar cancelamento, e a view usada aqui
 * nao traz flag de cancelamento) — por isso o rotulo e sempre "Ultimo aditivo",
 * nunca "aditivo vigente".
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, extractApiErrorCode } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { footer, currencyBRL, truncate, appendWithinBudget } = require('../_shared/format');

// Teto local da secao de membros (nao e o RESPONSE_ITEM_BUDGET da resposta inteira —
// so evita que um grupo com centenas de membros estoure sozinho; cabecalho + aditivo +
// observacoes cabem confortavelmente no que sobra ate a rede global de 60k).
const MEMBERS_BUDGET = 20000;

const schema = {
  name: 'get_contract_group',
  description: 'Buscar o detalhe de um grupo de contrato (modalidade Compartilhado) pelo ID: nome, cliente, tipo, situação (Ativo/Inativo — o endpoint devolve 200 mesmo para grupo inativo, que list_contracts esconde), expiração, duração, renovação automática, faturamento (automático com N dias antes do vencimento, ou em lote), lembrete de consumo (percentual e e-mails), último aditivo (número, versão, dia de vencimento, valor mensal, taxa, desconto em R$ ou %, descrição) e os contratos-membro do grupo. O ID precisa vir de uma linha "· grupo" de list_contracts — grupos e contratos têm IDs independentes, o mesmo número pode existir nos dois, e um ID de contrato comum não serve aqui (404). Atenção: diferente de list_contracts, este endpoint NÃO mascara valores monetários para usuários sem a permissão "Visualizar valores dos tickets" (divergência conhecida da API, já reportada ao time). Requer permissão "Visualizar contratos" + Licença Tickets.',
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

/** Desconto do aditivo: R$ quando discount_type "currency", % quando "percent", cru nos demais casos. */
function discountCell(discount_type, discount_value) {
  if (discount_value === null || discount_value === undefined) return '—';
  if (discount_type === 'currency') return currencyBRL(discount_value);
  if (discount_type === 'percent') return `${discount_value}%`;
  return String(discount_value);
}

function formatBilling(group) {
  if (group.automatic_billing) {
    const days = group.billing_days_before;
    const hasDays = days !== null && days !== undefined;
    const suffix = hasDays ? ` (${days} dias antes do vencimento)` : '';
    return `Automático${suffix}`;
  }
  if (group.billing_in_batch) return 'Em lote';
  return '—';
}

function formatConsumptionReminder(reminder) {
  if (!reminder || !reminder.notification) return 'Desativado';
  const percent = reminder.percent !== null && reminder.percent !== undefined ? `${reminder.percent}%` : '—';
  const emails = reminder.emails || '—';
  return `Ativo — alerta em ${percent} de consumo; e-mails: ${emails}`;
}

function formatLastRiderRich(lastRider) {
  if (!lastRider) return '*Nenhum aditivo encontrado.*\n';
  const descricao = lastRider.description ? truncate(lastRider.description, 800) : '—';
  const lines = [
    '### Último aditivo',
    `- Número: ${lastRider.rider_number ?? '—'} · versão ${lastRider.release ?? '—'}`,
    `- Vencimento: dia ${lastRider.due_day ?? '—'}`,
    `- Valor mensal: ${currencyBRL(lastRider.value)}`,
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
  const situacao = group.active ? 'Ativo' : 'Inativo';

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
  // ID validado estritamente (inteiro) antes de virar path na URL — honra o
  // `type: number` do schema e nunca interpola argumento MCP cru em /contract-groups/{id}.
  const contract_group_id = requireIntField(args, 'contract_group_id');
  // parseIntStrict aceita 0; o schema promete "inteiro positivo" — 0 nunca e um ID valido.
  if (contract_group_id < 1) {
    throw new Error('contract_group_id deve ser um número inteiro positivo');
  }

  try {
    const response = await api.getContractGroup(contract_group_id);

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40401 || response.status === 404) {
        return errorResponse(
          `**❌ Grupo de contrato #${contract_group_id} não encontrado**\n\n` +
          `**Código:** ${response.status}\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*O ID precisa vir de uma linha "· grupo" de \`list_contracts\` — grupos e contratos têm IDs ` +
          `independentes, e um ID de contrato comum não serve aqui.*`
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
          `**❌ Acesso negado ao grupo de contrato #${contract_group_id}**\n\n` +
          `**Código:** ${response.status} (erro ${errorCode || 'N/A'})\n` +
          `**Mensagem:** ${response.error}\n\n` +
          `*Verifique se o usuário possui a permissão "Visualizar contratos" e se a organização tem Licença Tickets.*`
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar grupo de contrato #${contract_group_id}**`,
        response,
        '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
      );
    }

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
      return errorResponse(
        `**⚠️ Resposta inesperada ao buscar grupo de contrato #${contract_group_id}**\n\n` +
        `A API retornou sucesso mas sem os dados do grupo.\n\n` +
        `*Verifique se o grupo #${contract_group_id} existe.*`
      );
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

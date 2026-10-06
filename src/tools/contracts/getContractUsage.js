/**
 * Slice: get_contract_usage — consumo e saldo por ciclo de apuracao de um
 * contrato individual (nao de grupo).
 *
 * Endpoint: GET /contracts/{id}/usage (via api.getContractUsage). Novo em
 * 2026-10-06 (api_rails `9aa4ac0`, ticket #100480 "Contratos Fase 2").
 *
 * Semantica confirmada no codigo-fonte da API (`contracts_controller.rb`,
 * `services/contracts/usage_service.rb`, `contract_usage_blueprint.rb`,
 * `models/contract.rb`, `models/contract_rider.rb`) e no portal
 * (`rails_backend`, labels do pt-BR.yml) — a Swagger erra ou omite 5 pontos,
 * ver README/spec:
 *   1. "Plantões" deveria ser "Deslocamentos" (`used_shifts`).
 *   2. `previous_billing_date` e o INICIO do ciclo, nao o fechamento anterior.
 *   3. A lista de casos com `cycles: []` esta incompleta (ver cyclesEmptyMessage).
 *   4. O mascaramento de contracted/used/balance/percent_used so vale para Credito.
 *   5. Falta a permissao do usuario-cliente ("Visualizar contrato").
 *
 * Ate 3 ciclos, do mais recente para o mais antigo, iniciados ate a
 * `base_date` (default: hoje da API). Sem paginacao — a API nao pagina este
 * endpoint e o maior payload real (Credito, 3 ciclos) fica bem abaixo do
 * orcamento de resposta, entao nao ha renderList/corte aqui.
 *
 * Nao existe consumo de GRUPO de contrato na API v2 (so o portal tem, no
 * relatorio "Grafico consumo contrato") nem por intervalo livre de datas —
 * um ID de contrato membro de grupo responde 404 aqui, com uma nota explicita.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse, extractApiErrorCode, formatApiErrorDetail } = require('../_shared/errors');
const { footer, currencyBRL } = require('../_shared/format');
const { modalityLabel, closingPeriodLabel } = require('../_shared/contractModality');
const {
  contractsLicenseErrorResponse, contractApiErrorResponse, contractsAccessDeniedResponse,
  requirePositiveIdField, isObjectPayload, unexpectedPayloadResponse
} = require('../_shared/contractShared');

const schema = {
  name: 'get_contract_usage',
  description: 'Buscar o consumo e o saldo por ciclo de apuração de um contrato individual (não de grupo) pelo ID: até 3 ciclos de faturamento (do mais recente para o mais antigo, iniciados até a `base_date`), com contratado, usado, saldo, % usado e excedente na unidade da modalidade (horas em Horas/Horas cumulativas, R$ em Crédito, quantidade de atendimentos em Por atendimento). Contratos Livre, SaaS/Produto e Compartilhado (grupo) não têm ciclo de apuração — a tool explica isso ao invés de devolver uma lista vazia sem contexto. Não serve para consumo de GRUPO de contrato (não existe esse endpoint na API v2 — use get_contract_group para o detalhe do grupo) nem para intervalo livre de datas (só a `base_date`, um ponto no tempo). Para o cadastro do contrato (franquia contratada, valor da hora excedente etc.), use get_contract. Valores em Crédito vêm mascarados ("--") sem a permissão "Visualizar valores dos tickets". Requer permissão "Visualizar contratos" (atendente) ou "Visualizar contrato" (usuário-cliente) + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: {
        type: 'number',
        description: 'ID do contrato individual (não de grupo — de uma linha de list_contracts sem sufixo "· grupo"). Inteiro positivo, obrigatório.'
      },
      base_date: {
        type: 'string',
        description: 'Data-base do consumo, formato YYYY-MM-DD. Opcional — default é hoje (ou amanhã, quando hoje é dia 1). Os ciclos retornados são os iniciados até essa data; não é um intervalo livre (sem data de início separada).'
      }
    },
    required: ['contract_id']
  }
};

const BASE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Ano/mes/dia formam uma data real (rejeita ex.: 2026-02-30). */
function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Valida `base_date` ANTES do request (E1): formato YYYY-MM-DD + data real.
 * Data futura NÃO é bloqueada — a API aceita (ver E4, usado para simular
 * "quando o contrato vai estourar"). Retorna a string validada ou undefined.
 */
function validateBaseDate(value) {
  if (value === undefined) return undefined;
  const match = BASE_DATE_PATTERN.exec(value);
  if (!match) throw new Error('base_date deve estar no formato YYYY-MM-DD');
  const [, y, mo, d] = match.map(Number);
  if (!isRealDate(y, mo, d)) throw new Error('base_date deve ser uma data real (YYYY-MM-DD)');
  return value;
}

/** Minutos → "H:MM" (ex: 90 → "1:30"). Usado só em Crédito (by_attendance). */
function minutesToHhMm(min) {
  if (min === null || min === undefined) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * `percent_used`: "--" mascarado passa cru; `null` (contracted:0) vira "—".
 * Vírgula decimal (ex: 0.11 → "0,11%"), mesma convenção pt-BR do resto da tool.
 */
function formatPercent(value) {
  if (value === '--') return '--';
  if (value === null || value === undefined) return '—';
  return `${String(value).replace('.', ',')}%`;
}

/**
 * Quantidade (contracted/used/balance) na unidade da modalidade (E5): Crédito
 * em R$, Horas/Horas cumulativas em "N,NN h", Por atendimento em "N
 * atendimentos", modalidade desconhecida no número cru. "--" mascarado e
 * `null`/`undefined` passam como "--"/"—" em qualquer modalidade.
 */
function formatQuantity(value, modality) {
  if (value === '--') return '--';
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (modality === 'credit') return currencyBRL(value);
  if (modality === 'hours' || modality === 'cumulative_hours') return `${num.toFixed(2).replace('.', ',')} h`;
  if (modality === 'per_ticket') return `${Math.trunc(num)} atendimentos`;
  return String(value);
}

/** Linhas de "Atendimento externo/remoto/interno" (só Crédito, a partir de minutos). */
function attendanceLines(cycle, modality) {
  if (modality !== 'credit' || !cycle.by_attendance) return [];
  const { external, remote, internal } = cycle.by_attendance;
  const lines = [];
  if (external !== undefined) lines.push(`- Atendimento externo: ${minutesToHhMm(external)}`);
  if (remote !== undefined) lines.push(`- Atendimento remoto: ${minutesToHhMm(remote)}`);
  if (internal !== undefined) lines.push(`- Atendimento interno: ${minutesToHhMm(internal)}`);
  return lines;
}

/**
 * Nota de excedente parcial (E2): no ciclo ABERTO, `surplus` recalcula mas so
 * conta tickets REVISADOS, enquanto `used` conta todos — por isso um ciclo
 * aberto pode ter saldo negativo com excedente "0.00" (o valor final so sai
 * no fechamento). So dispara quando os dois sinais batem (nao e so "aberto").
 */
function surplusPartialNote(cycle) {
  if (cycle.closed) return [];
  if (Number(cycle.balance) >= 0) return [];
  if (cycle.surplus !== '0.00') return [];
  return ['', '_O excedente só considera tickets revisados; o valor final sai no fechamento._'];
}

function formatCycleRich(cycle, modality) {
  const statusLabel = cycle.closed ? 'fechado' : 'aberto';
  // `closing_period` ausente: omite o "· período" do cabecalho em vez de "· —".
  const hasPeriod = cycle.closing_period !== null && cycle.closing_period !== undefined;
  const periodSuffix = hasPeriod ? ` · ${closingPeriodLabel(cycle.closing_period)}` : '';
  const cancelSuffix = cycle.cancelled ? ' (cancelado)' : '';
  const cumulativeNote = modality === 'cumulative_hours'
    ? ['_Contratado inclui o crédito acumulado de ciclos anteriores._']
    : [];
  const usedShiftsLine = cycle.used_shifts !== null && cycle.used_shifts !== undefined
    ? [`- Deslocamentos usados: ${cycle.used_shifts}`]
    : [];

  const lines = [
    `### Ciclo ${cycle.previous_billing_date} → ${cycle.billing_date} (${statusLabel}${periodSuffix})${cancelSuffix}`,
    `- Contratado: ${formatQuantity(cycle.contracted, modality)}`,
    ...cumulativeNote,
    `- Usado: ${formatQuantity(cycle.used, modality)}`,
    `- Saldo: ${formatQuantity(cycle.balance, modality)}`,
    `- % usado: ${formatPercent(cycle.percent_used)}`,
    `- Excedente: ${currencyBRL(cycle.surplus)}`,
    ...usedShiftsLine,
    ...attendanceLines(cycle, modality),
    ...surplusPartialNote(cycle)
  ];
  return lines.join('\n');
}

function formatCycleCompact(cycle, modality) {
  const statusLabel = cycle.closed ? 'fechado' : 'aberto';
  const used = formatQuantity(cycle.used, modality);
  const contracted = formatQuantity(cycle.contracted, modality);
  const percent = formatPercent(cycle.percent_used);
  const balance = formatQuantity(cycle.balance, modality);
  const surplus = currencyBRL(cycle.surplus);
  return `${cycle.previous_billing_date}→${cycle.billing_date} (${statusLabel}): usado ${used} de ${contracted} (${percent}) · saldo ${balance} · excedente ${surplus}`;
}

/**
 * Mensagem de `cycles: []` (E4) — a resposta não diz POR QUE veio vazio, então
 * a tool lista as causas conhecidas em vez de "nenhum ciclo encontrado" seco.
 * Modalidades sem ciclo de apuração por desenho (Livre/SaaS/Compartilhado) têm
 * mensagem própria, mais direta.
 */
function emptyCyclesMessage(modality, baseDateLabel) {
  if (['free', 'recurrent', 'shared'].includes(modality)) {
    return `*Contratos ${modalityLabel(modality)} não têm ciclo de apuração de consumo.*`;
  }
  return (
    `*Nenhum ciclo de apuração até ${baseDateLabel}. Acontece quando o contrato está expirado, pendente de ` +
    'reajuste ou cancelado, quando não tem aditivo, ou quando a data-base passa da vigência. Confira a situação ' +
    'com `get_contract` ou tente uma `base_date` anterior.*'
  );
}

function formatContractUsage(data, requestedBaseDate, verbosity) {
  const v = verbosity || 'rich';
  const modality = data.modality;
  const modalityText = modalityLabel(modality);
  const baseDateLabel = requestedBaseDate || 'hoje';
  const cycles = data.cycles || [];
  const nameHeader = `${data.name || 'N/A'} (#${data.contract_id})`;

  if (cycles.length === 0) {
    const msg = emptyCyclesMessage(modality, baseDateLabel);
    if (v === 'compact') return `${nameHeader} · ${modalityText}\n${msg}`;
    return [`## Consumo — ${nameHeader}`, '', `**Modalidade:** ${modalityText}`, `**Data-base:** ${baseDateLabel}`, '', msg].join('\n');
  }

  if (v === 'compact') {
    const lines = [`${nameHeader} · ${modalityText}`, ...cycles.map(c => formatCycleCompact(c, modality))];
    return lines.join('\n');
  }

  const lastNotificationLine = data.last_consume_notification
    ? [`**Último lembrete de consumo enviado em:** ${data.last_consume_notification}`]
    : [];

  const headerLines = [
    `## Consumo — ${nameHeader}`,
    '',
    `**Modalidade:** ${modalityText}`,
    `**Data-base:** ${baseDateLabel}`,
    ...lastNotificationLine
  ];

  const sections = cycles.map(c => formatCycleRich(c, modality));
  return [...headerLines, '', ...sections, '', footer(v)].join('\n');
}

async function execute(args, { api, verbosity }) {
  const contract_id = requirePositiveIdField(args, 'contract_id');
  const base_date = validateBaseDate(args.base_date);

  try {
    const response = await api.getContractUsage(contract_id, base_date ? { base_date } : {});

    if (response.error) {
      const errorCode = extractApiErrorCode(response);

      if (errorCode === 40401 || response.status === 404) {
        return contractApiErrorResponse(
          `Contrato #${contract_id} não encontrado`,
          response,
          `*Isto acontece quando o ID não existe OU quando o contrato #${contract_id} é MEMBRO de um grupo de ` +
          'contrato (modalidade Compartilhado) — contratos-membro são consultados pelo grupo, não individualmente. ' +
          'Se for este o caso, use `get_contract_group` com o ID do grupo. **Não existe consumo de grupo de ' +
          'contrato na API v2** — só o portal (relatório "Gráfico consumo contrato") mostra isso.*'
        );
      }

      if (errorCode === 42201) {
        return contractApiErrorResponse(
          `Erro ao buscar consumo do contrato #${contract_id}`,
          response,
          `${formatApiErrorDetail(response)}*Verifique o formato de \`base_date\` (YYYY-MM-DD).*`
        );
      }

      if (errorCode === 40304) return contractsLicenseErrorResponse();

      if (errorCode === 40301) {
        return contractsAccessDeniedResponse(
          `Acesso negado ao consumo do contrato #${contract_id}`,
          response,
          errorCode,
          '*Verifique se o usuário possui a permissão "Visualizar contratos" (atendente) ou "Visualizar contrato" ' +
          '(usuário-cliente), e se a organização tem Licença Tickets.*'
        );
      }

      return apiFailureResponse(
        `**❌ Erro ao buscar consumo do contrato #${contract_id}**`,
        response,
        '*Verifique se o ID está correto e se você tem permissão para acessá-lo.*'
      );
    }

    if (!isObjectPayload(response.data)) {
      return unexpectedPayloadResponse(`consumo do contrato #${contract_id}`, 'de consumo', `o contrato #${contract_id}`);
    }

    return textResponse(formatContractUsage(response.data, base_date, verbosity));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar consumo do contrato #${contract_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatContractUsage };

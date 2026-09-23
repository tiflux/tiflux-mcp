/**
 * Motor compartilhado dos relatórios de avaliação de atendimento (feedback).
 *
 * get_chats_feedback_report e get_tickets_feedback_report têm fluxo idêntico
 * (validação de período, resolução do período de comparação, 2 chamadas
 * sequenciais à API, cálculo de Δ/Δ% sobre o summary, tabela de métricas e
 * lista opcional de itens). Antes, os 2 slices duplicavam ~90% do execute
 * (Sonar: 53.1% de duplicação em new code). Este motor concentra o fluxo comum
 * e recebe, via `cfg`, apenas o que diverge por entidade:
 *  - método da API (getChatsFeedbackReport vs getTicketsFeedbackReport)
 *  - chaves do payload (lista + métrica de "avaliados")
 *  - métricas do summary e o render da tabela de itens (colunas/mapeamento)
 *
 * CLAUDE.md autoriza extrair para `_shared/` quando há duplicação real (≥3
 * slices contando get_tickets_comparison, que compartilha reportMath).
 */

const { textResponse } = require('./response');
const { errorResponse } = require('./errors');
const { footer, listVerbosity, cutCountLabel, RESPONSE_ITEM_BUDGET } = require('./format');
const { previousPeriod, validatePeriod } = require('./periodMath');
const { capIds, calcDelta, formatDeltaStr } = require('./reportMath');

// Paginacao efetiva da lista (mesmo clamp enviado a API: offset >= 1, limit 1..200).
function effectivePage(offset, limit) {
  return {
    effectiveLimit: Math.min(Math.max(1, Number.parseInt(limit, 10) || 20), 200),
    effectiveOffset: Math.max(1, Number.parseInt(offset, 10) || 1)
  };
}

/**
 * Lista de itens no modo compact. include_list e pedido explicito do usuario: o
 * payload ja foi cobrado na API (listParamKey vai na request), entao suprimi-lo
 * era perda de dado. Teto por item (F3): a lista desconta o texto que a precede.
 */
function compactListLines(report, cfg, prefixLength) {
  const { args: { offset, limit }, mainData, evaluated } = report;
  const list = mainData[cfg.listDataKey] || [];
  const { effectiveLimit, effectiveOffset } = effectivePage(offset, limit);

  if (list.length === 0) {
    return [`Avaliados (0/${evaluated}): nenhum item no período com os filtros aplicados.`];
  }
  if (typeof cfg.renderListCompact !== 'function') {
    // Caller nao forneceu renderListCompact — degrada para o render rich
    // (cfg.renderList) em vez de lancar TypeError. Achado de revisao do #90.
    const title = `Avaliados (${list.length}/${evaluated}) — formato completo (sem renderer compact):`;
    const maxChars = RESPONSE_ITEM_BUDGET - prefixLength - title.length - 1;
    return [title, cfg.renderList(list, { effectiveLimit, effectiveOffset, evaluatedTotal: evaluated, maxChars }).trimEnd()];
  }
  // O titulo (com a contagem) vai no cabecalho do render: quando o teto corta,
  // passa a contar os itens mostrados (`truncatedTitle`).
  const title = `Avaliados (${list.length}/${evaluated})\n`;
  const truncatedTitle = (shown) => `Avaliados (${cutCountLabel(shown, evaluated, list.length)})\n`;
  const moreLine = list.length === effectiveLimit ? `→ offset: ${effectiveOffset + 1} p/ mais` : '';
  const maxChars = RESPONSE_ITEM_BUDGET - prefixLength;
  return [cfg.renderListCompact(list, { effectiveLimit, effectiveOffset, moreLine, maxChars, title, truncatedTitle }).trimEnd()];
}

function renderCompactReport(report, cfg) {
  const { args: { start_date, end_date, include_list }, compareStart, compareEnd, mainSummary, evaluated, prevEvaluated } = report;
  const { delta, deltaPercent } = calcDelta(evaluated, prevEvaluated);
  const ratingAvg = mainSummary.rating_average ?? '—';
  const deltaStr = formatDeltaStr(delta, deltaPercent);

  let metricsLine = `Comparação: ${compareStart} a ${compareEnd} | respondidos ${mainSummary.answers_percentage ?? '—'}%`;
  if (cfg.finishedKey && mainSummary[cfg.finishedKey] != null) {
    metricsLine += ` | finalizados ${mainSummary[cfg.finishedKey]}`;
  }
  if (mainSummary.clients_evaluated != null) {
    metricsLine += ` | clientes ${mainSummary.clients_evaluated}`;
  }

  const lines = [
    `Avaliações de ${cfg.entityLabel.toLowerCase()} (${start_date} a ${end_date}): média ${ratingAvg} | avaliados ${evaluated} vs ${prevEvaluated} → Δ ${deltaStr}`,
    metricsLine
  ];

  if (include_list) {
    const prefixLength = lines.join('\n').length + 1 + report.autoCompactNotice.length;
    lines.push(...compactListLines(report, cfg, prefixLength));
  }

  return lines.join('\n') + report.autoCompactNotice;
}

function renderRichReport(report, cfg) {
  const { args: { start_date, end_date, include_list, offset, limit }, compareStart, compareEnd, mainData, mainSummary, compareSummary, evaluated } = report;
  const label = cfg.entityLabel;

  let out = `**📊 Relatório de avaliações de atendimento — ${label}**\n\n`;
  out += `**Período principal:** ${start_date} a ${end_date}\n`;
  out += `**Período de comparação:** ${compareStart} a ${compareEnd}\n\n`;

  out += `| Métrica | Período atual | Período anterior | Δ |\n`;
  out += `|---------|--------------|-----------------|---|\n`;

  for (const metric of cfg.metrics) {
    out += metricRow(metric, mainSummary[metric.key], compareSummary[metric.key]);
  }

  const footerStr = footer('rich');

  // Lista de itens (se solicitada)
  if (include_list) {
    const list = mainData[cfg.listDataKey] || [];
    const listTitle = (count) => `\n**📋 ${label} avaliados no período (${count}):**\n\n`;
    const title = listTitle(`${list.length} itens`);

    if (list.length === 0) {
      out += `${title}*Nenhum ${cfg.entitySingular} avaliado encontrado no período com os filtros aplicados.*\n`;
    } else {
      const { effectiveLimit, effectiveOffset } = effectivePage(offset, limit);
      // Teto por item (F3): a lista desconta o texto que a precede e o rodape.
      // O titulo vai no cabecalho do render: quando o teto corta, conta os itens mostrados.
      const maxChars = RESPONSE_ITEM_BUDGET - out.length - footerStr.length - 1;
      const truncatedTitle = (shown) => listTitle(cutCountLabel(shown, evaluated, list.length, 'itens'));
      out += cfg.renderList(list, { effectiveLimit, effectiveOffset, evaluatedTotal: evaluated, maxChars, title, truncatedTitle });
    }
  }

  return footerStr ? `${out}\n${footerStr}` : out;
}

function metricRow(metric, curr, prev) {
  const currDisplay = curr ?? '—';
  const prevDisplay = prev ?? '—';

  if (curr != null && prev != null) {
    const { delta, deltaPercent } = calcDelta(curr, prev);
    const deltaStr = formatDeltaStr(delta, deltaPercent);
    return `| ${metric.label} | **${currDisplay}** | ${prevDisplay} | ${deltaStr} |\n`;
  }
  return `| ${metric.label} | ${currDisplay} | ${prevDisplay} | — |\n`;
}

/**
 * Executa um relatório de avaliação com comparação de período.
 *
 * @param {object} args - argumentos MCP (start_date, end_date, compare_*, include_list, offset, limit, *_ids)
 * @param {object} ctx - { api, verbosity, logger }
 * @param {object} cfg - configuração por entidade:
 *   @param {string} cfg.entityLabel - rótulo capitalizado plural ('Chats' | 'Tickets')
 *   @param {string} cfg.entitySingular - singular minúsculo ('chat' | 'ticket')
 *   @param {(api:object, filters:object)=>Promise} cfg.apiMethod - chamada à API
 *   @param {string} cfg.listParamKey - flag de lista enviada à API ('chats_list' | 'tickets_list')
 *   @param {string} cfg.listDataKey - chave da lista no payload ('chats_list' | 'tickets_list')
 *   @param {string} cfg.evaluatedKey - métrica de avaliados ('chats_evaluated' | 'tickets_evaluated')
 *   @param {string} [cfg.finishedKey] - métrica de "finalizados" do summary (ex: 'chats_finished' | 'tickets_finished'),
 *     exibida na 2ª linha do modo `compact` quando presente. Opcional — sem ela, a linha de métricas
 *     do `compact` simplesmente omite o dado de finalizados.
 *   @param {Array<{key:string,label:string}>} cfg.metrics - métricas do summary para a tabela (modo `rich`)
 *   @param {(list:Array, o:{effectiveLimit:number,effectiveOffset:number,evaluatedTotal:number,maxChars:number,title?:string,truncatedTitle?:function})=>string} cfg.renderList - render da tabela de itens (modo `rich`).
 *     `title` (com a contagem) abre o cabecalho do render; `truncatedTitle(shown)` o substitui quando o teto corta (ver `withTitle`).
 *   @param {(list:Array, o:object)=>string} [cfg.renderListCompact] - render da lista em 1 linha por item (modo `compact`; mesmo contrato de `title`/`truncatedTitle`).
 *     Opcional: se `include_list` for pedido em `compact` e o caller não fornecer esta função, a lista
 *     degrada para o render `rich` (`cfg.renderList`) em vez de lançar `TypeError` — ver bloco abaixo.
 * @returns {object} resposta MCP (textResponse | errorResponse)
 */
async function runFeedbackReport(args, ctx, cfg) {
  const { api, verbosity, verbosityExplicit, logger } = ctx || {};
  const label = cfg.entityLabel;
  const labelLower = label.toLowerCase();

  try {
    const {
      start_date,
      end_date,
      compare_start_date,
      compare_end_date,
      include_list = false,
      offset = 1,
      limit = 20,
      responsible_ids,
      department_ids,
      technical_group_ids
    } = args;

    // --- Validar período principal ---
    const mainValidation = validatePeriod(start_date, end_date);
    if (!mainValidation.valid) {
      return errorResponse(
        `**❌ Período principal inválido**\n\n${mainValidation.message}\n\n` +
        `*Forneça datas no formato YYYY-MM-DD com end_date posterior a start_date.*`
      );
    }

    // --- Resolver período de comparação ---
    let compareStart, compareEnd;

    const hasCompareStart = compare_start_date != null && compare_start_date !== '';
    const hasCompareEnd = compare_end_date != null && compare_end_date !== '';

    if (hasCompareStart !== hasCompareEnd) {
      return errorResponse(
        `**❌ Par de datas de comparação incompleto**\n\n` +
        `compare_start_date e compare_end_date devem ser informados juntos.\n\n` +
        `*Forneça ambos ou nenhum (o período de comparação padrão é calculado automaticamente).*`
      );
    }

    if (hasCompareStart && hasCompareEnd) {
      const compareValidation = validatePeriod(compare_start_date, compare_end_date);
      if (!compareValidation.valid) {
        return errorResponse(
          `**❌ Período de comparação inválido**\n\n${compareValidation.message}\n\n` +
          `*Forneça datas no formato YYYY-MM-DD com compare_end_date posterior a compare_start_date.*`
        );
      }
      compareStart = compare_start_date;
      compareEnd = compare_end_date;
    } else {
      // Padrão: período adjacente anterior de mesma duração
      const prev = previousPeriod(start_date, end_date);
      compareStart = prev.start.substring(0, 10);
      compareEnd = prev.end.substring(0, 10);
    }

    // Caps de IDs
    const finalResponsibleIds = capIds(responsible_ids);
    const finalDepartmentIds = capIds(department_ids);
    const finalTechnicalGroupIds = capIds(technical_group_ids);

    // Filtros base (comuns às 2 chamadas)
    const baseFilters = {
      ...(finalResponsibleIds ? { responsible_ids: finalResponsibleIds } : {}),
      ...(finalDepartmentIds ? { department_ids: finalDepartmentIds } : {}),
      ...(finalTechnicalGroupIds ? { technical_group_ids: finalTechnicalGroupIds } : {})
    };

    // --- Chamada 1: período principal ---
    const mainFilters = {
      ...baseFilters,
      start_date,
      end_date,
      ...(include_list ? {
        [cfg.listParamKey]: true,
        offset: Math.max(1, Number.parseInt(offset, 10) || 1),
        limit: Math.min(Math.max(1, Number.parseInt(limit, 10) || 20), 200)
      } : {})
    };

    const mainResponse = await cfg.apiMethod(api, mainFilters);

    if (mainResponse.error) {
      const is403 = mainResponse.status === 403;
      return errorResponse(
        `**❌ Erro ao buscar relatório de avaliações de ${labelLower} (período principal)**\n\n` +
        `**Código:** ${mainResponse.status}\n` +
        `**Mensagem:** ${mainResponse.error}\n\n` +
        `${is403 ? '*Este relatório requer permissão de administrador/relatórios. Verifique as permissões da sua API key.*' : '*Verifique os filtros e o intervalo de datas.*'}`
      );
    }

    const mainData = mainResponse.data || {};
    const mainSummary = mainData.summary || mainData || {};

    // --- Chamada 2: período de comparação ---
    const compareFilters = {
      ...baseFilters,
      start_date: compareStart,
      end_date: compareEnd
    };

    const compareResponse = await cfg.apiMethod(api, compareFilters);

    if (compareResponse.error) {
      const is403 = compareResponse.status === 403;
      return errorResponse(
        `**❌ Erro ao buscar relatório de avaliações de ${labelLower} (período de comparação)**\n\n` +
        `**Código:** ${compareResponse.status}\n` +
        `**Mensagem:** ${compareResponse.error}\n\n` +
        `${is403 ? '*Este relatório requer permissão de administrador/relatórios.*' : '*Verifique os filtros e o intervalo de datas do período de comparação.*'}`
      );
    }

    const compareData = compareResponse.data || {};
    const compareSummary = compareData.summary || compareData || {};

    // --- Métricas / deltas ---
    const evaluated = mainSummary[cfg.evaluatedKey] ?? 0;
    const prevEvaluated = compareSummary[cfg.evaluatedKey] ?? 0;

    // F4: sem verbosidade explicita, a lista (include_list) com > 50 itens sai em compact (com aviso).
    const listLength = include_list ? (mainData[cfg.listDataKey] || []).length : undefined;
    const { verbosity: v, notice: autoCompactNotice } = listVerbosity({ verbosity, verbosityExplicit }, listLength);

    const report = {
      args: { start_date, end_date, include_list, offset, limit },
      compareStart, compareEnd, mainData, mainSummary, compareSummary, evaluated, prevEvaluated, autoCompactNotice
    };
    return textResponse(v === 'compact' ? renderCompactReport(report, cfg) : renderRichReport(report, cfg));

  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error(`get_${labelLower}_feedback_report falhou`, { message: err && err.message });
    }
    return errorResponse(
      `**❌ Erro ao buscar relatório de avaliações de ${labelLower}**\n\n` +
      `Ocorreu uma falha inesperada ao consultar a API (timeout, rede ou resposta malformada).\n\n` +
      `*Tente novamente; se persistir, entre em contato com o suporte TiFlux.*`
    );
  }
}

/**
 * `truncatedHead` dos renders de lista dos feedback reports: titulo de corte
 * (`truncatedTitle(shown)`) + cabecalho da tabela. Sem `truncatedTitle`, nao ha
 * cabecalho de corte (o render usa o `head` normal).
 */
function withTitle(truncatedTitle, tableHead) {
  return typeof truncatedTitle === 'function' ? (shown) => truncatedTitle(shown) + tableHead : undefined;
}

module.exports = { runFeedbackReport, withTitle };

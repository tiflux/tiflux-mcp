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
const { footer } = require('./format');
const { previousPeriod, validatePeriod } = require('./periodMath');
const { capIds, calcDelta, formatDeltaStr } = require('./reportMath');

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
 *   @param {Array<{key:string,label:string}>} cfg.metrics - métricas do summary para a tabela
 *   @param {(list:Array, o:{effectiveLimit:number,effectiveOffset:number,evaluatedTotal:number})=>string} cfg.renderList - render da tabela de itens
 * @returns {object} resposta MCP (textResponse | errorResponse)
 */
async function runFeedbackReport(args, ctx, cfg) {
  const { api, verbosity, logger } = ctx || {};
  const v = verbosity || 'rich';
  const label = cfg.entityLabel;
  const labelLower = label.toLowerCase();
  const singular = cfg.entitySingular;

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
        offset: Math.max(1, parseInt(offset) || 1),
        limit: Math.min(Math.max(1, parseInt(limit) || 20), 200)
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

    if (v === 'compact') {
      const { delta, deltaPercent } = calcDelta(evaluated, prevEvaluated);
      const ratingAvg = mainSummary.rating_average ?? '—';
      const deltaStr = formatDeltaStr(delta, deltaPercent);
      const lines = [
        `Avaliações de ${labelLower} (${start_date} a ${end_date}): média ${ratingAvg} | avaliados ${evaluated} vs ${prevEvaluated} → Δ ${deltaStr}`,
        `Comparação: ${compareStart} a ${compareEnd} | respondidos ${mainSummary.answers_percentage ?? '—'}%`
      ];
      return textResponse(lines.join('\n'));
    }

    // Rich
    let out = `**📊 Relatório de avaliações de atendimento — ${label}**\n\n`;
    out += `**Período principal:** ${start_date} a ${end_date}\n`;
    out += `**Período de comparação:** ${compareStart} a ${compareEnd}\n\n`;

    out += `| Métrica | Período atual | Período anterior | Δ |\n`;
    out += `|---------|--------------|-----------------|---|\n`;

    for (const metric of cfg.metrics) {
      const curr = mainSummary[metric.key];
      const prev = compareSummary[metric.key];

      const currDisplay = curr ?? '—';
      const prevDisplay = prev ?? '—';

      if (curr != null && prev != null) {
        const { delta, deltaPercent } = calcDelta(curr, prev);
        const deltaStr = formatDeltaStr(delta, deltaPercent);
        out += `| ${metric.label} | **${currDisplay}** | ${prevDisplay} | ${deltaStr} |\n`;
      } else {
        out += `| ${metric.label} | ${currDisplay} | ${prevDisplay} | — |\n`;
      }
    }

    // Lista de itens (se solicitada)
    if (include_list) {
      const list = mainData[cfg.listDataKey] || [];
      out += `\n**📋 ${label} avaliados no período (${list.length} itens):**\n\n`;

      if (list.length === 0) {
        out += `*Nenhum ${singular} avaliado encontrado no período com os filtros aplicados.*\n`;
      } else {
        const effectiveLimit = Math.min(Math.max(1, parseInt(limit) || 20), 200);
        const effectiveOffset = Math.max(1, parseInt(offset) || 1);
        out += cfg.renderList(list, { effectiveLimit, effectiveOffset, evaluatedTotal: evaluated });
      }
    }

    const footerStr = footer(v);
    return textResponse(footerStr ? `${out}\n${footerStr}` : out);

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

module.exports = { runFeedbackReport };

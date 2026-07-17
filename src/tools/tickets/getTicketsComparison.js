/**
 * Slice: get_tickets_comparison — compara a contagem de tickets entre dois períodos.
 *
 * Resolve uma análise comparativa completa em 1 chamada MCP:
 * internamente 2 chamadas sequenciais a GET /tickets com group_by,
 * alinhamento de buckets e cálculo de Δ/Δ%. Zero paginação.
 *
 * Nome deliberado: o orquestrador do Assistente IA filtra tools por prefixo
 * de leitura (list_, get_, search_) — get_ passa; compare_ seria filtrado fora.
 *
 * Período de comparação default: imediatamente anterior de mesma duração
 * (compare_end = start − 1s; compare_start = compare_end − duração).
 * Sem snapping de calendário.
 *
 * filter_by default "all": comparações de períodos passados contam tudo
 * por padrão (abertos, fechados e cancelados).
 *
 * Endpoint: GET /tickets (via api.listTickets, 2 chamadas por invocação).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');
const { footer } = require('../_shared/format');
const { previousPeriod, validatePeriod } = require('../_shared/periodMath');
const { capIds, calcDelta, formatDeltaStr } = require('../_shared/reportMath');

// Teto explicito de buckets por chamada. Em modo group_by a API atual ignora
// `limit` e devolve todos os buckets (validado ao vivo: 66 buckets com limit=20);
// enviamos o teto do contrato (Math.min(limit,200) em tiflux-api) como defesa
// barata contra uma regressao futura que passe a respeitar `limit` e truncar.
const BUCKET_LIMIT = 200;

const schema = {
  name: 'get_tickets_comparison',
  description: `Compara a CONTAGEM de tickets entre dois períodos em uma única chamada. Use quando o usuário pedir "compare X vs Y", "evolução", "tendência comparativa" ou qualquer análise que envolva dois intervalos de tempo — sem paginar, sem listar itens individuais.

**Quando usar vs list_tickets:**
- **Para CONTAR/COMPARAR/TENDÊNCIA** → use get_tickets_comparison (ou list_tickets com group_by). Resposta de centenas de tokens, 2 requests à API, cabe em 1 iteração.
- **Para VER itens individualmente** → use list_tickets sem group_by.

**Período de comparação padrão:** se compare_start/compare_end não forem informados, o período de comparação é o imediatamente anterior de mesma duração (compare_end = start_datetime − 1s; duração idêntica). Informe apenas start_datetime e end_datetime e o período de comparação é calculado automaticamente.

**filter_by padrão "all":** comparações de períodos passados contam tudo (abertos, fechados, cancelados) por padrão.

**group_by "desk":** útil para "qual mesa cresceu" — alinha por nome de mesa, não por ordem.

Exemplos de uso:
- "Compare os últimos 6 meses com os 6 anteriores" → start/end dos últimos 6 meses, compare automático
- "Como evoluiu por mês a mesa X no 1o semestre vs 2o semestre?" → group_by=month + desk_name
- "Qual mesa teve mais crescimento de tickets fechados este trimestre vs trimestre passado?" → group_by=desk + date_type=solved_in_time`,
  inputSchema: {
    type: 'object',
    properties: {
      start_datetime: {
        type: 'string',
        description: 'Início do período principal (ISO 8601, ex: "2026-01-01T00:00:00Z"). Obrigatório.'
      },
      end_datetime: {
        type: 'string',
        description: 'Fim do período principal (ISO 8601, ex: "2026-06-30T23:59:59Z"). Obrigatório.'
      },
      compare_start_datetime: {
        type: 'string',
        description: 'Início do período de comparação (ISO 8601). Opcional — se omitido, calculado automaticamente como o período imediatamente anterior de mesma duração. Informe junto com compare_end_datetime (par completo).'
      },
      compare_end_datetime: {
        type: 'string',
        description: 'Fim do período de comparação (ISO 8601). Opcional — par com compare_start_datetime. Se omitido, calculado automaticamente.'
      },
      group_by: {
        type: 'string',
        enum: ['day', 'week', 'month', 'desk'],
        description: 'Granularidade do agrupamento. "day"/"week"/"month" agrupam por período temporal. "desk" agrupa por mesa (útil para "qual mesa cresceu"). Padrão: "month".'
      },
      date_type: {
        type: 'string',
        enum: ['created_at', 'solved_in_time'],
        description: 'Eixo temporal usado nos dois períodos. "created_at" (padrão) = data de criação. "solved_in_time" = data de fechamento/resolução. Deve ser o mesmo nos dois períodos — essa tool garante consistência automaticamente.'
      },
      filter_by: {
        type: 'string',
        enum: ['open', 'closed', 'canceled', 'all'],
        description: 'Filtro por status. Padrão "all" (abertos + fechados + cancelados) — ideal para comparações de períodos passados. Use "closed" para análise de resolução, "open" para snapshot de demanda.'
      },
      desk_ids: {
        type: 'string',
        description: 'IDs das mesas separados por vírgula (máximo 15). Alternativa ao desk_name.'
      },
      desk_name: {
        type: 'string',
        description: 'Nome da mesa/equipe para resolução automática. Aceita nomes parciais.'
      },
      client_ids: {
        type: 'string',
        description: 'IDs dos clientes separados por vírgula (máximo 15). Use para comparação por empresa.'
      },
      client_name: {
        type: 'string',
        description: 'Nome do cliente (empresa) para resolução automática. Use apenas quando o usuário disser explicitamente "cliente" ou "empresa".'
      },
      responsible_ids: {
        type: 'string',
        description: 'IDs dos responsáveis separados por vírgula (máximo 15). Passthrough direto.'
      },
      requestor_email: {
        type: 'string',
        description: 'Email do solicitante. Passthrough direto.'
      },
      priority_ids: {
        type: 'string',
        description: 'IDs de prioridade separados por vírgula (máximo 15). Passthrough direto.'
      },
      services_catalogs_item_ids: {
        type: 'string',
        description: 'IDs de itens de catálogo separados por vírgula (máximo 15). Passthrough direto.'
      }
    },
    required: ['start_datetime', 'end_datetime']
  }
};

/**
 * Alinha buckets temporais (day/week/month) por índice ordinal.
 * Lado menor preenchido com 0/—.
 * Retorna array de { period, current, previous }.
 */
function alignTemporalBuckets(currentBuckets, previousBuckets) {
  const curr = [...currentBuckets].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const prev = [...previousBuckets].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const len = Math.max(curr.length, prev.length);
  const rows = [];
  for (let i = 0; i < len; i++) {
    rows.push({
      period: curr[i]?.period ?? prev[i]?.period ?? `—`,
      current: curr[i]?.count ?? 0,
      previous: prev[i]?.count ?? 0
    });
  }
  return rows;
}

/**
 * Alinha buckets de desk por nome de mesa (união dos dois conjuntos).
 * Mesa ausente num lado = 0. Ordenados por contagem do período atual desc.
 * Retorna array de { period (nome da mesa), current, previous }.
 */
function alignDeskBuckets(currentBuckets, previousBuckets) {
  const currMap = new Map(currentBuckets.map(b => [b.period, b.count]));
  const prevMap = new Map(previousBuckets.map(b => [b.period, b.count]));
  const names = new Set([...currMap.keys(), ...prevMap.keys()]);
  const rows = [];
  for (const name of names) {
    rows.push({
      period: name,
      current: currMap.get(name) ?? 0,
      previous: prevMap.get(name) ?? 0
    });
  }
  rows.sort((a, b) => b.current - a.current);
  return rows;
}

async function execute(args, { api, verbosity, logger }) {
  const v = verbosity || 'rich';

  try {
  const {
    start_datetime,
    end_datetime,
    compare_start_datetime,
    compare_end_datetime,
    group_by = 'month',
    date_type = 'created_at',
    filter_by = 'all',
    desk_ids,
    desk_name,
    client_ids,
    client_name,
    responsible_ids,
    requestor_email,
    priority_ids,
    services_catalogs_item_ids
  } = args;

  // --- Validar período principal ---
  const mainValidation = validatePeriod(start_datetime, end_datetime);
  if (!mainValidation.valid) {
    return errorResponse(
      `**❌ Período principal inválido**\n\n${mainValidation.message}\n\n` +
      `*Forneça datas ISO 8601 válidas com end_datetime posterior a start_datetime.*`
    );
  }

  // --- Resolver período de comparação ---
  let compareStart, compareEnd;

  // Ambos informados = par completo; apenas um = erro
  const hasCompareStart = compare_start_datetime != null && compare_start_datetime !== '';
  const hasCompareEnd = compare_end_datetime != null && compare_end_datetime !== '';

  if (hasCompareStart !== hasCompareEnd) {
    return errorResponse(
      `**❌ Par de datas de comparação incompleto**\n\n` +
      `compare_start_datetime e compare_end_datetime devem ser informados juntos.\n\n` +
      `*Forneça ambos ou nenhum (o período de comparação padrão é calculado automaticamente).*`
    );
  }

  if (hasCompareStart && hasCompareEnd) {
    const compareValidation = validatePeriod(compare_start_datetime, compare_end_datetime);
    if (!compareValidation.valid) {
      return errorResponse(
        `**❌ Período de comparação inválido**\n\n${compareValidation.message}\n\n` +
        `*Forneça datas ISO 8601 válidas com compare_end_datetime posterior a compare_start_datetime.*`
      );
    }
    compareStart = compare_start_datetime;
    compareEnd = compare_end_datetime;
  } else {
    // Padrão: período adjacente anterior de mesma duração
    const prev = previousPeriod(start_datetime, end_datetime);
    compareStart = prev.start;
    compareEnd = prev.end;
  }

  // --- Resolver nomes em IDs ---
  let finalDeskIds = capIds(desk_ids);
  if (desk_name && !desk_ids) {
    const resolved = await resolveDeskName(api, desk_name);
    if (resolved.error) return resolved.response;
    finalDeskIds = String(resolved.deskId);
  }

  let finalClientIds = capIds(client_ids);
  if (client_name && !client_ids) {
    const resolved = await resolveClientName(api, client_name);
    if (resolved.error) return resolved.response;
    finalClientIds = String(resolved.clientId);
  }

  // Passthrough caps
  const finalResponsibleIds = capIds(responsible_ids);
  const finalPriorityIds = capIds(priority_ids);
  const finalCatalogIds = capIds(services_catalogs_item_ids);

  // Base de filtros comuns às duas chamadas
  const baseFilters = {
    limit: BUCKET_LIMIT,
    group_by,
    date_type,
    filter_by,
    ...(finalDeskIds ? { desk_ids: finalDeskIds } : {}),
    ...(finalClientIds ? { client_ids: finalClientIds } : {}),
    ...(finalResponsibleIds ? { responsible_ids: finalResponsibleIds } : {}),
    ...(requestor_email ? { requestor_email } : {}),
    ...(finalPriorityIds ? { priority_ids: finalPriorityIds } : {}),
    ...(finalCatalogIds ? { services_catalogs_item_ids: finalCatalogIds } : {})
  };

  // --- Chamada 1: período atual (early-exit se falhar) ---
  const currentResponse = await api.listTickets({
    ...baseFilters,
    start_datetime,
    end_datetime
  });

  if (currentResponse.error) {
    return errorResponse(
      `**❌ Erro ao buscar dados do período atual**\n\n` +
      `**Código:** ${currentResponse.status}\n` +
      `**Mensagem:** ${currentResponse.error}\n\n` +
      `*Verifique os filtros e o intervalo de datas do período atual.*`
    );
  }

  const currentPayload = currentResponse.data || {};
  if (!Array.isArray(currentPayload.buckets)) {
    return errorResponse(
      `**❌ A API não retornou dados agregados para o período atual**\n\n` +
      `O endpoint GET /tickets precisa suportar o parâmetro \`group_by\`. ` +
      `Tente usar \`list_tickets\` com \`group_by\` diretamente para verificar o suporte.\n\n` +
      `*Se o problema persistir, entre em contato com o suporte TiFlux.*`
    );
  }

  // --- Chamada 2: período de comparação ---
  const compareResponse = await api.listTickets({
    ...baseFilters,
    start_datetime: compareStart,
    end_datetime: compareEnd
  });

  if (compareResponse.error) {
    return errorResponse(
      `**❌ Erro ao buscar dados do período de comparação**\n\n` +
      `**Código:** ${compareResponse.status}\n` +
      `**Mensagem:** ${compareResponse.error}\n\n` +
      `*Verifique os filtros e o intervalo de datas do período de comparação.*`
    );
  }

  const comparePayload = compareResponse.data || {};
  if (!Array.isArray(comparePayload.buckets)) {
    return errorResponse(
      `**❌ A API não retornou dados agregados para o período de comparação**\n\n` +
      `O endpoint GET /tickets precisa suportar o parâmetro \`group_by\`. ` +
      `Tente usar \`list_tickets\` com \`group_by\` diretamente para verificar o suporte.\n\n` +
      `*Se o problema persistir, entre em contato com o suporte TiFlux.*`
    );
  }

  const currentBuckets = currentPayload.buckets;
  const compareBuckets = comparePayload.buckets;

  // Totais — mesma fonte-da-verdade do list_tickets: prefere o header X-Total-Items
  // (exposto em response.total por tiflux-api), depois o total do corpo, e só então
  // soma os buckets (que podem vir truncados em uma regressao da API).
  const currentTotal = currentResponse.total ?? currentPayload.total ?? currentBuckets.reduce((s, b) => s + (b.count || 0), 0);
  const compareTotal = compareResponse.total ?? comparePayload.total ?? compareBuckets.reduce((s, b) => s + (b.count || 0), 0);

  // Ambos vazios
  if (currentBuckets.length === 0 && compareBuckets.length === 0) {
    return textResponse(
      `**📊 Comparação de tickets**\n\n` +
      `Nenhum ticket encontrado em ambos os períodos com os filtros aplicados.`
    );
  }

  // --- Alinhar buckets ---
  const isDesk = group_by === 'desk';
  const rows = isDesk
    ? alignDeskBuckets(currentBuckets, compareBuckets)
    : alignTemporalBuckets(currentBuckets, compareBuckets);

  // Totais e delta globais
  const { delta: totalDelta, deltaPercent: totalDeltaPct } = calcDelta(currentTotal, compareTotal);

  // Labels de unidade
  const unitLabel = { day: 'dia', week: 'semana', month: 'mês', desk: 'mesa' }[group_by] || group_by;
  const dtSuffix = isDesk ? '' : ` — por data de ${date_type === 'solved_in_time' ? 'fechamento/resolução' : 'criação'}`;

  // --- Formatters ---
  if (v === 'compact') {
    const deltaStr = formatDeltaStr(totalDelta, totalDeltaPct);
    const bucketsStr = rows.map(r => `${r.period}:${r.current}/${r.previous}`).join(' · ');
    const line1 = `Comparação por ${unitLabel}${dtSuffix}: atual ${currentTotal} vs anterior ${compareTotal} → Δ ${deltaStr}`;
    const line2 = bucketsStr ? `Buckets (atual/anterior): ${bucketsStr}` : '';
    return textResponse(line2 ? `${line1}\n${line2}` : line1);
  }

  // Rich
  const deltaStr = formatDeltaStr(totalDelta, totalDeltaPct);
  let out = `**📊 Comparação de tickets por ${unitLabel}**${dtSuffix}\n\n`;
  out += `| | Período atual | Período anterior | Δ |\n|---|---|---|---|\n`;
  out += `| **Total** | **${currentTotal}** | **${compareTotal}** | **${deltaStr}** |\n\n`;

  // Tabela pareada
  const colLabel = isDesk ? 'Mesa' : 'Período';
  out += `| ${colLabel} | Atual | Anterior | Δ | Δ% |\n|---|---|---|---|---|\n`;
  for (const row of rows) {
    const { delta, deltaPercent } = calcDelta(row.current, row.previous);
    const sign = delta >= 0 ? '+' : '';
    const pctStr = deltaPercent === 'novo' ? 'novo' : `${sign}${deltaPercent}%`;
    const deltaCell = `${sign}${delta}`;
    out += `| ${row.period} | ${row.current} | ${row.previous} | ${deltaCell} | ${pctStr} |\n`;
  }

  const footerStr = footer(v);
  return textResponse(footerStr ? `${out}\n${footerStr}` : out);
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('get_tickets_comparison falhou', { message: err && err.message });
    }
    return errorResponse(
      `**❌ Erro ao comparar tickets**\n\n` +
      `Ocorreu uma falha inesperada ao consultar a API (timeout, rede ou resposta malformada).\n\n` +
      `*Tente novamente; se persistir, entre em contato com o suporte TiFlux.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

/**
 * Slice: list_tickets — lista tickets com filtros.
 *
 * Endpoint: GET /tickets (via api.listTickets).
 * Requer ao menos um filtro obrigatorio (desk_ids, desk_name, client_ids, client_name,
 * stage_ids, stage_name, responsible_ids, responsible_name, requestor_ids, requestor_email,
 * start_datetime, end_datetime, is_closed, services_catalogs_item_ids, catalog_query,
 * priority_ids ou priority_name) para evitar retorno massivo.
 * Filtros temporais (start_datetime/end_datetime + date_type) sao repassados direto
 * para a API, que filtra server-side por created_at ou solved_in_time.
 * Resolve desk_name -> desk_id via smartSearchDesks; stage_name -> stage_id via searchStages.
 * Resolve client_name -> client_id via resolveClientName.
 * Repassa requestor_ids e requestor_email diretamente para a API.
 * Resolve priority_name -> priority_id via fuzzy match em GET /desks/{id}/priorities (requer mesa).
 * Resolve catalog_query -> services_catalogs_item_ids via catalogFilterResolver (requer mesa).
 *
 * Guard-rails (date_type='solved_in_time'):
 *   - Sem filter_by nem is_closed → assume filter_by='closed', anuncia no retorno.
 *   - filter_by='open' ou is_closed=false → errorResponse imediato (contradicao comprovada).
 *
 * Heuristica mesa-first: quando o usuario referencia um nome sem qualificar a entidade,
 * use desk_name. So use client_name quando o usuario disser explicitamente "cliente" ou
 * "empresa". Para pessoas que abriram tickets, use requestor_email ou requestor_ids.
 *
 * Exibicao (Phase 1, custo zero de API):
 * - rich: card do ticket inclui Prioridade e Catalogo (catalog_name > area_name > item_name).
 * - compact: 1 linha por ticket com cliente, mesa, status, estagio, responsavel, prioridade,
 *   catalogo e dia de criacao (horario de Brasilia). Descricao fica fora.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { footer, pagination, renderWithinBudget, listVerbosity, dateOnly, dateTime, cutCountLabel } = require('../_shared/format');
const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');
const { resolveCatalogItemIds } = require('../_shared/catalogFilterResolver');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { renderAppliedFilters } = require('../_shared/appliedFilters');
const { escapeCell } = require('../_shared/markdown');
const { diagnoseZero } = require('../_shared/zeroDiagnostics');
const { zeroFillTemporalBuckets, isoWeekRangeLabel } = require('../_shared/temporalBuckets');
const { slugToNumber, validSlugs } = require('./createdByWayOf');
const {
  MAX_FILTER_IDS, capFilterIds, capIdFilters, normalizeRequestorEmails, clampListLimit, resolveStageAcrossDesks
} = require('./ticketListFilters');

// Rotulos do aviso de corte dos filtros *_ids (H11).
const ID_FILTER_LABELS = {
  desk_ids: 'mesa', client_ids: 'cliente', stage_ids: 'estágio', responsible_ids: 'responsável', requestor_ids: 'solicitante'
};
// Piso de confianca para aceitar um match de priority_name sem pedir desambiguacao.
// Ver tabela de scores em _shared/fuzzyMatch.js (70 = algum token comeca com o termo).
const MIN_PRIORITY_SCORE = 70;
// Guard de volume: quando total de tickets supera este limiar na listagem normal
// (sem group_by), a saida inclui instrucao dura para nao paginar em analises.
const LIST_TOTAL_WARN_THRESHOLD = 500;
// Nome da tool de comparacao. Literal (nao require) para evitar acoplamento em
// load-time entre slices — um require no topo viraria dependencia circular
// silenciosa se getTicketsComparison passasse a importar listTickets.
const COMPARISON_TOOL_NAME = 'get_tickets_comparison';

// Tamanho minimo (apos trim) para `search` sozinho dispensar a mesa.
const MIN_SEARCH_SCOPE_LENGTH = 3;

// Catalogo de servico de um ticket: catalog_name › area_name › item_name.
function formatCatalog(servicesCatalog) {
  if (!servicesCatalog) return '—';
  const parts = [
    servicesCatalog.catalog_name,
    servicesCatalog.area_name,
    servicesCatalog.item_name
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' › ') : '—';
}

// Prazos de SLA de um ticket ABERTO (sem solved_in_time). A API devolve sla_info em
// cada item de GET /tickets; fechado/cancelado ou mesa sem SLA → null (nada a mostrar).
// Veredito (API v2, `attend_sla?`): attend_sla/attend_sla_solution sao null sem prazo
// (ou cancelado/mesa sem SLA); com 1o atendimento/solucao ja feito comparam o instante
// do feito com o prazo, senao comparam NOW com o prazo. Logo, com o prazo NO PASSADO:
// false = estourado (feito com atraso OU ainda pendente — os dois sao estouro) e
// true = feito no prazo. Com o prazo no FUTURO, true nao distingue "pendente" de
// "ja feito cedo" — por isso o rotulo e so "vence <dt>", sem afirmar pendencia.
// Atendimento: prazo futuro → mostra; prazo passado + false → mostra como estourado;
// prazo passado + true/null → omite (cumprido no prazo ou sem veredito: ruido).
function openSlaDeadlines(ticket, now = Date.now()) {
  const sla = ticket.sla_info;
  if (!sla || (sla.solved_in_time !== null && sla.solved_in_time !== undefined)) return null;
  const isPast = (iso) => Boolean(iso) && new Date(iso).getTime() <= now;
  const attendTs = sla.attend_expiration ? new Date(sla.attend_expiration).getTime() : Number.NaN;
  const attendBreached = isPast(sla.attend_expiration) && sla.attend_sla === false;
  const deadlines = {
    solve: sla.solve_expiration || null,
    solveBreached: isPast(sla.solve_expiration) && sla.attend_sla_solution === false,
    attend: (attendTs > now || attendBreached) ? sla.attend_expiration : null,
    attendBreached,
    stopped: sla.stopped === true
  };
  return (deadlines.solve || deadlines.attend || deadlines.stopped) ? deadlines : null;
}

// Mesmo termo do get_ticket compact (`Resolução vence: <dt> (estourado)`).
const BREACHED_SUFFIX = ' (estourado)';
const breached = (flag) => (flag ? BREACHED_SUFFIX : '');

// compact: `| resolução vence <dt>[ (estourado)]` / `| atendimento vence <dt>[ (estourado)]` / `| pausado`
function slaCompactSuffix(ticket) {
  const d = openSlaDeadlines(ticket);
  if (!d) return '';
  let out = '';
  if (d.solve) out += ` | resolução vence ${dateTime(d.solve, 'compact')}${breached(d.solveBreached)}`;
  if (d.attend) out += ` | atendimento vence ${dateTime(d.attend, 'compact')}${breached(d.attendBreached)}`;
  if (d.stopped) out += ' | pausado';
  return out;
}

// rich: `⏰ **Resolução vence:** <dt>[ (estourado)] · atendimento <dt>[ (estourado)] · SLA pausado`
function slaRichLine(ticket) {
  const d = openSlaDeadlines(ticket);
  if (!d) return '';
  const parts = [];
  if (d.solve) parts.push(`**Resolução vence:** ${dateTime(d.solve, 'rich')}${breached(d.solveBreached)}`);
  if (d.attend) {
    const attend = `${dateTime(d.attend, 'rich')}${breached(d.attendBreached)}`;
    parts.push(d.solve ? `atendimento ${attend}` : `**Atendimento vence:** ${attend}`);
  }
  if (d.stopped) parts.push(parts.length > 0 ? 'SLA pausado' : '**SLA pausado**');
  return `\n   ⏰ ${parts.join(' · ')}`;
}

// compact: item ultra-terso — 1 linha por ticket
function ticketCompactLine(ticket) {
  const n = ticket.ticket_number || 'N/A';
  const title = ticket.title || '(sem título)';
  const status = ticket.status?.name || 'N/A';
  const stage = ticket.stage?.name || 'N/A';
  const responsible = ticket.responsible?.name || 'N/A';
  const priority = ticket.priority?.name || '—';
  const catalog = formatCatalog(ticket.services_catalog);
  const client = ticket.client?.name || '—';
  const desk = ticket.desk?.name || '—';
  const created = dateOnly(ticket.created_at);
  const solvedInTime = ticket.sla_info?.solved_in_time;
  const closedSuffix = (solvedInTime !== null && solvedInTime !== undefined)
    ? ` | fechado ${dateTime(solvedInTime, 'compact')}`
    : '';
  return `#${n} ${title} | ${client} | ${desk} | ${status} | ${stage} | ${responsible} | ${priority} | ${catalog} | criado ${created}${closedSuffix}${slaCompactSuffix(ticket)}\n`;
}

// Guard de volume: quando o total real (X-Total-Items) supera o limiar e a listagem
// nao e agregada (sem group_by), orienta a nao paginar em analises. `volumeGuardTruncated`
// e a versao usada quando o teto de ~40k corta a pagina: a linha de corte manda continuar
// com offset/limit, entao o aviso nao pode dizer "NAO pagine".
function volumeGuardTexts(groupBy, total, v, offset = 1) {
  if (groupBy || typeof total !== 'number' || total <= LIST_TOTAL_WARN_THRESHOLD) {
    return { volumeGuard: '', volumeGuardTruncated: '' };
  }
  // offset > 1: o usuario ja esta seguindo uma continuacao (linha de corte ou
  // paginacao da pagina anterior) — "NAO pagine" contradiria a pagina 1.
  const continuing = Number.parseInt(offset, 10) > 1;
  if (v === 'compact') {
    const truncated = `\n⚠️ Volume alto: ${total} tickets no total — para analise use group_by ou ${COMPARISON_TOOL_NAME}, ou refine o recorte; para os itens, continue pela linha [cortado].`;
    return {
      volumeGuard: continuing
        ? `\n⚠️ Volume alto: ${total} tickets no total — para analise use group_by ou ${COMPARISON_TOOL_NAME}, ou refine o recorte; para os itens, siga a paginacao.`
        : `\n⚠️ Volume alto: ${total} tickets no total — NAO pagine para analise. Use group_by ou ${COMPARISON_TOOL_NAME}, ou refine o recorte.`,
      volumeGuardTruncated: truncated
    };
  }
  const analysis = ` Para contar/comparar/tendência use \`group_by\` ou \`${COMPARISON_TOOL_NAME}\`, ou refine o recorte (mesa, período, cliente).`;
  return {
    volumeGuard: continuing
      ? `\n**⚠️ Volume alto: ${total} tickets no total.**${analysis} Se o usuário precisar dos itens individuais, siga a paginação.`
      : `\n**⚠️ Volume alto: ${total} tickets no total — NÃO pagine para análise.**${analysis} Só pagine se o usuário precisar dos itens individuais.`,
    volumeGuardTruncated: `\n**⚠️ Volume alto: ${total} tickets no total.**${analysis} Se o usuário precisar dos itens individuais, continue pela linha de corte (✂️) acima.`
  };
}

// Cabecalho, 1 bloco por ticket e a dica final do compact (fora do execute: complexidade).
// `truncatedHeader(shown)` e o cabecalho quando o teto corta a pagina: conta os
// tickets MOSTRADOS (o "200 de 1305" original nao batia com os 182 exibidos).
function ticketListParts(tickets, total, v) {
  const hasTotal = total !== undefined && total !== null && total !== tickets.length;
  const countLabel = hasTotal ? `${tickets.length} de ${total}` : `${tickets.length}`;
  if (v === 'compact') {
    return {
      header: `Tickets (${countLabel}):\n`,
      truncatedHeader: (shown) => `Tickets (${cutCountLabel(shown, total, tickets.length)}):\n`,
      parts: tickets.map(ticketCompactLine),
      compactHint: `(use get_ticket #N para detalhes)\n`
    };
  }
  return {
    header: `**📋 Lista de Tickets** (${countLabel} encontrados)\n\n`,
    truncatedHeader: (shown) => `**📋 Lista de Tickets** (${cutCountLabel(shown, total, tickets.length, 'encontrados')})\n\n`,
    parts: tickets.map((ticket, index) => ticketRichBlock(ticket, index)),
    compactHint: ''
  };
}

// rich: card do ticket com catalogo + prioridade
function ticketRichBlock(ticket, index) {
  const ticketNumber = ticket.ticket_number || 'N/A';
  const title = ticket.title || 'Sem título';
  const clientName = ticket.client?.name || 'Cliente não informado';
  const deskName = ticket.desk?.name || 'Mesa não informada';
  const stageName = ticket.stage?.name || 'Estágio não informado';
  const responsibleName = ticket.responsible?.name || 'Não atribuído';
  const status = ticket.status?.name || 'Status não informado';
  const priority = ticket.priority?.name || '—';
  const catalog = formatCatalog(ticket.services_catalog);
  // dateTime(v,'rich') mostra data E hora em horario de Brasilia (achado de producao
  // 2026-09-22: toLocaleDateString sem timeZone usava o fuso do processo — Lambda em
  // UTC — e mostrava a data errada quando a hora local caia no dia anterior/seguinte).
  const createdAt = dateTime(ticket.created_at, 'rich');
  const solvedInTime = ticket.sla_info?.solved_in_time;
  const closedLine = (solvedInTime !== null && solvedInTime !== undefined)
    ? `\n   ✅ **Fechado em:** ${dateTime(solvedInTime, 'rich')}`
    : '';

  // Resumo da descricao (primeiras 100 caracteres)
  let descriptionSummary = '';
  if (ticket.description) {
    descriptionSummary = ticket.description.length > 100
      ? ticket.description.substring(0, 100) + '...'
      : ticket.description;
    descriptionSummary = `\n   📄 ${descriptionSummary}`;
  }

  return `**${index + 1}. Ticket #${ticketNumber}**\n` +
    `   📝 **Título:** ${title}\n` +
    `   👤 **Responsável:** ${responsibleName}\n` +
    `   🏢 **Cliente:** ${clientName}\n` +
    `   🗂️ **Mesa:** ${deskName}\n` +
    `   📊 **Estágio:** ${stageName}\n` +
    `   🚨 **Status:** ${status}\n` +
    `   🔴 **Prioridade:** ${priority}\n` +
    `   🗃️ **Catálogo:** ${catalog}\n` +
    `   📅 **Criado em:** ${createdAt}${closedLine}${slaRichLine(ticket)}${descriptionSummary}\n\n`;
}

/**
 * Constroi as entradas para renderAppliedFilters a partir dos parametros resolvidos.
 * Aceita parametros via objeto para evitar posicionais longos.
 */
function buildFilterEntries(opts) {
  const {
    finalDeskIds, resolvedDeskInfo,
    finalClientIds, client_name,
    finalStageIds, stage_name,
    finalResponsibleIds, responsible_name,
    requestor_ids, requestor_email,
    finalCatalogItemIds, catalog_query,
    finalPriorityIds, priority_name,
    effectiveFilterBy, filterByAssumed, is_closed,
    filter_by: origFilterBy,
    date_type, start_datetime, end_datetime,
    group_by, sla_expiring_before,
    search, update_start_datetime, update_end_datetime
  } = opts;

  const entries = [];

  // Mesa
  if (finalDeskIds) {
    if (resolvedDeskInfo) {
      entries.push({
        label: 'Mesa',
        value: `${resolvedDeskInfo.id} — "${resolvedDeskInfo.name}" (de "${resolvedDeskInfo.searchTerm}")`,
        origin: 'resolvido'
      });
    } else {
      entries.push({ label: 'Mesa', value: finalDeskIds, origin: 'informado' });
    }
  }

  // Cliente
  if (finalClientIds) {
    entries.push({
      label: 'Cliente',
      value: client_name ? `${finalClientIds} (${client_name})` : finalClientIds,
      origin: client_name ? 'resolvido' : 'informado'
    });
  }

  // Estagio
  if (finalStageIds) {
    entries.push({
      label: 'Estágio',
      value: stage_name ? `${finalStageIds} (${stage_name})` : finalStageIds,
      origin: stage_name ? 'resolvido' : 'informado'
    });
  }

  // Responsavel
  if (finalResponsibleIds) {
    entries.push({
      label: 'Responsável',
      value: responsible_name ? `${finalResponsibleIds} (${responsible_name})` : finalResponsibleIds,
      origin: responsible_name ? 'resolvido' : 'informado'
    });
  }

  if (requestor_ids) entries.push({ label: 'Solicitante (IDs)', value: requestor_ids, origin: 'informado' });
  if (requestor_email) entries.push({ label: 'Solicitante (email)', value: requestor_email, origin: 'informado' });

  if (finalCatalogItemIds) {
    entries.push({
      label: 'Catálogo',
      value: catalog_query ? `${finalCatalogItemIds} (query: "${catalog_query}")` : finalCatalogItemIds,
      origin: catalog_query ? 'resolvido' : 'informado'
    });
  }

  if (finalPriorityIds) {
    entries.push({
      label: 'Prioridade',
      value: priority_name ? `${finalPriorityIds} (${priority_name})` : finalPriorityIds,
      origin: priority_name ? 'resolvido' : 'informado'
    });
  }

  // Tipo de data
  if (date_type) {
    entries.push({
      label: 'Tipo de data',
      value: date_type === 'solved_in_time' ? 'fechamento/resolução (solved_in_time)' : 'criação (created_at)',
      origin: 'informado'
    });
  }

  // Periodo
  if (start_datetime || end_datetime) {
    entries.push({
      label: 'Período',
      value: `${start_datetime || '(início)'} → ${end_datetime || '(fim)'}`,
      origin: 'informado'
    });
  }

  if (update_start_datetime || update_end_datetime) {
    entries.push({
      label: 'Atualizado',
      value: `${update_start_datetime || '(início)'} → ${update_end_datetime || '(fim)'}`,
      origin: 'informado'
    });
  }

  if (search) entries.push({ label: 'Busca', value: `"${escapeCell(search)}"`, origin: 'informado' });

  // Status
  const statusLabelMap = { open: 'Abertos', closed: 'Fechados', canceled: 'Cancelados', all: 'Todos' };
  if (effectiveFilterBy) {
    const statusText = statusLabelMap[effectiveFilterBy] || effectiveFilterBy;
    const note = filterByAssumed ? ' — assumido; use "all" para incluir cancelados' : '';
    entries.push({
      label: 'Status',
      value: `${statusText}${note}`,
      origin: filterByAssumed ? 'assumido' : (origFilterBy ? 'informado' : 'padrao')
    });
  } else if (is_closed !== undefined) {
    entries.push({
      label: 'Status',
      value: is_closed ? 'Fechados' : 'Abertos',
      origin: 'informado'
    });
  } else {
    entries.push({ label: 'Status', value: 'Abertos', origin: 'padrao' });
  }

  // Agrupamento
  if (group_by) {
    const groupLabel = { day: 'dia', week: 'semana', month: 'mês', desk: 'mesa' }[group_by] || group_by;
    entries.push({ label: 'Agrupamento', value: groupLabel, origin: 'informado' });
  }

  // SLA
  if (sla_expiring_before) {
    entries.push({ label: 'SLA vence antes de', value: sla_expiring_before, origin: 'informado' });
  }

  return entries;
}

const schema = {
  name: 'list_tickets',
  description: `Lista tickets. Já traz data/hora de ABERTURA (rich: "Criado em", com hora em horário de Brasília) e, quando fechado, de FECHAMENTO ("Fechado em" no rich; sufixo "| fechado ..." no compact); em ticket aberto, o VENCIMENTO do SLA ("Resolução vence"/"| resolução vence ...", "atendimento vence ..." e "pausado"; " (estourado)" quando o prazo já passou e o SLA estourou — atendimento com prazo passado só aparece se estourou) — não é preciso chamar get_ticket por ticket para essas datas nem para o SLA. A API não ordena pelo prazo: ordene você. Para CONTAR/COMPARAR/TENDÊNCIA use \`group_by\` ou \`get_tickets_comparison\` (dois períodos), sem paginar.

**Regras:**
- Status sozinho (filter_by/is_closed) NÃO basta: exige MESA ou outro recorte forte (cliente, solicitante, responsável, stage_ids, período, período de atualização (update_start_datetime/update_end_datetime), sla_expiring_before, search com 3+ caracteres, catálogo, prioridade, group_by). search mais curto só vale junto com a mesa (ou outro recorte). Busca ampla sem recorte → PERGUNTE a mesa antes de chamar.
- Nome de MESA/equipe ("tickets do tuitui", "do Suporte") = desk_name. Nome de PESSOA: "tickets do João"/"abertos pelo João" = solicitante (requestor_email/requestor_ids); "atribuídos ao João"/"com o João" = responsible_name. client_name só se o usuário disser "cliente"/"empresa" ou der nome corporativo. Na dúvida entre mesa e pessoa, pergunte.
- date_type="solved_in_time" (data de fechamento) exige filter_by "closed" (assumido se omitido), "canceled" ou "all"; com "open" é erro.
- stage_name, catalog_query e priority_name exigem mesa; stage_ids, services_catalogs_item_ids e priority_ids, não.

**Receitas:**
- fechados por mês na mesa X → desk_name + date_type="solved_in_time" + filter_by="closed" + group_by="month"
- abertos hoje na mesa X → desk_name + date_type="created_at" + filter_by="all" + período
- cancelados no período → filter_by="canceled" + date_type="solved_in_time" + desk_name (mesmo com período, pergunte a mesa se não vier)
- tickets de um catálogo → catalog_query="infraestrutura" + desk_name
- prioridade alta → priority_name="alta" + desk_name
- SLA a vencer hoje na mesa X → desk_name + sla_expiring_before=fim do dia + limit=200 (cada linha traz o vencimento)
- abertos da mesa X que falam de "API" → desk_name + filter_by="open" + search="API"
- este semestre vs anterior → get_tickets_comparison`,
  inputSchema: {
    type: 'object',
    properties: {
      desk_ids: { type: 'string', description: 'IDs das mesas separados por vírgula (ex: "1,2,3") - máximo 15 IDs; repetidos são removidos e, acima de 15, só os 15 primeiros são aplicados (com aviso). O mesmo vale para client_ids, stage_ids, responsible_ids e requestor_ids.' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_ids). Aceita nomes parciais ou multi-palavra (ex: "cansados" resolve para "Dev - Cansados", "dev experimentos" resolve para "DEV - Experimentos"). Prefira este campo quando o usuário der um nome sem qualificar a entidade.' },
      client_ids: { type: 'string', description: 'IDs dos clientes (empresas) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar pela empresa contratante, nao pela pessoa que abriu o ticket.' },
      client_name: { type: 'string', description: 'Nome do cliente (empresa contratante) para busca automática (alternativa ao client_ids). Use apenas quando o usuário disser "cliente"/"empresa" ou der nome corporativo; para pessoa, requestor_email.' },
      stage_ids: { type: 'string', description: 'IDs dos estágios separados por vírgula (ex: "1,2,3") - máximo 15 IDs' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática. EXIGE mesa (desk_name ou desk_ids): estágio é por mesa — sem mesa é erro. Com várias mesas em desk_ids, o estágio é procurado em cada uma e a busca usa todos os encontrados; mesa sem o estágio entra num aviso. Nome exato (sem caixa/acento) vence nomes parecidos.' },
      responsible_ids: { type: 'string', description: 'IDs dos responsáveis (atendentes atribuidos) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use quando ja tiver o ID do responsavel.' },
      responsible_name: { type: 'string', description: 'Nome do responsavel (atendente atribuido) para busca automatica. Resolve o ID via GET /users (admin) ou via grupos de atendimento (nao-admin). Use quando o usuario disser "atribuido a", "responsavel" ou der um nome de atendente.' },
      requestor_ids: { type: 'string', description: 'IDs dos solicitantes (pessoa fisica que abriu o ticket) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar por **pessoa** (nao empresa). Resolva o ID via search_requestor.' },
      requestor_email: { type: 'string', description: 'Email do solicitante (pessoa que abriu o ticket). Use quando o usuario referencia uma **pessoa fisica** ou der um email diretamente. Evita round-trip de resolucao de ID. Aceita varios separados por virgula; maiusculas/espacos nao importam (o MCP normaliza para minusculas).' },
      services_catalogs_item_ids: { type: 'string', description: 'IDs de itens de catálogo de serviço separados por vírgula (ex: "11,12,13"). Passthrough direto para a API — máximo 15 IDs (limite da API /tickets); acima disso, apenas os 15 primeiros são aplicados com aviso. Use quando ja souber os IDs precisos (via search_catalog_item). Para busca por nome/área/catálogo, use catalog_query.' },
      catalog_query: { type: 'string', description: 'Termo de busca livre para filtrar por catálogo de serviço. Faz match parcial server-side contra nome de catálogo, área e item ao mesmo tempo — ex: "infraestrutura" retorna itens de todas as áreas/catálogos que contenham esse termo. Requer mesa (desk_id ou desk_name). Para IDs precisos, use services_catalogs_item_ids.' },
      priority_ids: { type: 'string', description: 'IDs de prioridade separados por vírgula (ex: "17,18"). Passthrough direto para a API — máximo 15 IDs (limite da API /tickets). Use quando ja souber os IDs (via list_desk_priorities). Para busca por nome, use priority_name.' },
      priority_name: { type: 'string', description: 'Nome da prioridade para busca automática via fuzzy match (ex: "alta", "high", "baixa"). Requer mesa (desk_id ou desk_name). Para IDs diretos, use priority_ids.' },
      ...paginationSchemaProperties(),
      is_closed: { type: 'boolean', description: 'Legado — prefira filter_by. Quando true, equivale a filter_by="closed"; quando false, equivale a filter_by="open". Ignorado se filter_by for informado. Atenção: is_closed=false + date_type="solved_in_time" é contradição e retorna erro imediato.' },
      filter_by: {
        type: 'string',
        enum: ['open', 'closed', 'canceled', 'all'],
        description: 'Modo de filtro por status, com PRECEDÊNCIA sobre is_closed. "open" = apenas abertos; "closed" = apenas FECHADOS (resolvidos, NÃO inclui cancelados); "canceled" = apenas CANCELADOS; "all" = TODOS os status numa única consulta. Sob date_type="solved_in_time": all = closed + canceled (ex: 358 + 31 = 389); omitido → o MCP assume "closed" e avisa; "open" é contradição e retorna erro sem chamar a API.'
      },
      date_type: {
        type: 'string',
        enum: ['created_at', 'solved_in_time'],
        description: 'Eixo da data: "created_at" (padrão) = CRIAÇÃO; "solved_in_time" = data de FECHAMENTO (gravada também ao cancelar; some ao reabrir — regras de status em filter_by). Aceita offsets de fuso além de Z (ex: "2026-01-01T00:00:00-03:00").'
      },
      group_by: {
        type: 'string',
        enum: ['day', 'week', 'month', 'desk'],
        description: 'Agrupa a CONTAGEM de tickets em vez de listar. "day"/"week"/"month" agrupam por período (combine com date_type + start/end) para comparação/tendência. "desk" agrupa por mesa (ex: "tickets em aberto por mesa", "mesas com SLA em risco"). Retorna um resumo com a quantidade por grupo, não a lista. Períodos sem tickets aparecem com contagem 0 quando start/end são informados (day/month).'
      },
      sla_expiring_before: {
        type: 'string',
        description: 'Filtra tickets ABERTOS (e não parados) cujo SLA de RESOLUÇÃO vence até a data/hora informada (ISO 8601), incluindo já vencidos. Use para "SLA em risco" / "o que pode estourar". Ex: para "hoje", passe o fim do dia. Combine com group_by="desk" para "mesas com SLA em risco".'
      },
      start_datetime: { type: 'string', description: 'Data/hora inicial do filtro no formato ISO 8601 (ex: "2024-05-15T00:00:00Z" ou "2024-05-15T00:00:00-03:00"). Filtra tickets com data >= start_datetime' },
      end_datetime: { type: 'string', description: 'Data/hora final do filtro no formato ISO 8601 (ex: "2024-05-15T23:59:59Z" ou "2024-05-15T23:59:59-03:00"). Filtra tickets com data <= end_datetime' },
      search: { type: 'string', description: 'Busca por palavra no título, cliente, mesa, número, responsável e início da descrição. Complementa a mesa, não a substitui; só dispensa a mesa com 3+ caracteres (mais curta exige mesa ou outro recorte).' },
      update_start_datetime: { type: 'string', description: 'Atualizados a partir de (ISO 8601).' },
      update_end_datetime: { type: 'string', description: 'Atualizados até (ISO 8601).' },
      created_by_way_of: {
        type: 'string',
        enum: validSlugs(),
        description: 'Filtra tickets pela origem de criacao. Valores aceitos: "web" (Tiflux Web), "agent" (Agente), "chat_widget" (Chat Widget), "whatsapp" (WhatsApp), "email" (E-mail), "external_form" (Formulario Externo), "mobile" (Mobile), "api" (API), "chat" (Chat), "recurrent_activity" (Atividade Recorrente), "trigger" (Gatilho), "ticket_group" (Grupo de Tickets), "ai_agent" (Agente de IA). Valor invalido e rejeitado localmente sem chamar a API.'
      }
    },
    required: []
  }
};

// group_by sem buckets: sem tabela — exibe filtros + diagnostico para nao deixar o modelo inventar zeros.
async function renderEmptyGroupBy({ api, filters, filtersBlock, unitLabel, dtSuffix, filterByAssumed, v }) {
  const diagFilters = { ...filters };
  delete diagFilters.group_by;
  const diagText = await diagnoseZero({ api, filters: diagFilters, verbosity: v });

  if (v === 'compact') {
    let out = `Contagem por ${unitLabel}${dtSuffix}: nenhum ticket no período/filtros informados.`;
    if (filtersBlock) out += `\n${filtersBlock}`;
    if (diagText) out += `\n${diagText}`;
    return textResponse(out);
  }

  let out = `**📊 Contagem por ${unitLabel}**${dtSuffix}\n\n`;
  if (filtersBlock) out += `${filtersBlock}\n`;
  if (filterByAssumed) {
    out += `**⚠️ Suposição de status:** \`filter_by\` não informado com \`date_type="solved_in_time"\` — assumiu \`filter_by="closed"\`.\n\n`;
  }
  out += `Nenhum ticket no período/filtros informados.`;
  if (diagText) out += `\n\n${diagText}`;
  return textResponse(out);
}

/**
 * Modo agregado (group_by): API retorna { group_by, date_type, total, buckets } em vez de lista.
 * Extraido do execute (complexidade cognitiva); comportamento identico nos 2 modos.
 */
async function renderGroupByResponse({ api, response, filters, filterEntries, filterWarnings = [], group_by, date_type, start_datetime, end_datetime, filterByAssumed, v }) {
  const payload = response.data || {};
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
  const agg = response.total ?? payload.total ?? buckets.reduce((s, b) => s + (b.count || 0), 0);
  const isDesk = group_by === 'desk';
  const unitLabel = { day: 'dia', week: 'semana', month: 'mês', desk: 'mesa' }[group_by] || group_by;
  const colLabel = isDesk ? 'Mesa' : 'Período';
  const dtSuffix = isDesk ? '' : ` (data de ${(payload.date_type || date_type) === 'solved_in_time' ? 'fechamento/resolução' : 'criação'})`;

  const warningLines = filterWarnings.map(w => `⚠️ ${w}`).join('\n');
  const filtersBlock = [renderAppliedFilters(filterEntries, v), warningLines].filter(Boolean).join('\n');

  if (buckets.length === 0) {
    return renderEmptyGroupBy({ api, filters, filtersBlock, unitLabel, dtSuffix, filterByAssumed, v });
  }

  // Zero-fill temporal buckets quando start/end informados e ao menos 1 bucket.
  // Vale nos 2 modos: bucket ausente e indistinguivel de "nao retornado" e o modelo
  // pode narrar tendencia errada a partir do buraco.
  // Semana sai com as datas (`2026-W33 (10/08–16/08)`): o modelo nao converte sozinho.
  const displayBuckets = zeroFillTemporalBuckets(buckets, start_datetime, end_datetime, group_by)
    .map(b => (group_by === 'week' ? { ...b, period: isoWeekRangeLabel(b.period) } : b));

  if (v === 'compact') {
    const filtersLine = filtersBlock ? `\n${filtersBlock}` : '';
    const line = displayBuckets.map(b => `${b.period}:${b.count}`).join(' · ');
    return textResponse(`Contagem por ${unitLabel} (total ${agg}): ${line}${filtersLine}`);
  }

  let out = '';
  if (filterByAssumed) {
    out += `**⚠️ Suposição de status:** \`filter_by\` não informado com \`date_type="solved_in_time"\` — assumiu \`filter_by="closed"\`. Use \`filter_by="all"\` para incluir cancelados.\n\n`;
  }
  out += `**📊 Tickets por ${unitLabel}**${dtSuffix} — total: ${agg}\n\n`;
  if (filtersBlock) out += `${filtersBlock}\n`;
  out += `| ${colLabel} | Quantidade |\n|---|---|\n`;
  displayBuckets.forEach(b => { out += `| ${b.period} | ${b.count} |\n`; });
  const footerStr = footer(v);
  return textResponse(footerStr ? `${out}\n${footerStr}` : out);
}

async function execute(args, { api, verbosity, verbosityExplicit }) {
  // Verbosidade base (sem compact automatico): group_by, lista vazia e erros.
  // O compact automatico (F4) e decidido apos o fetch, pela quantidade de itens.
  const v = listVerbosity({ verbosity, verbosityExplicit }).verbosity;
  const {
    desk_ids,
    desk_name,
    client_ids,
    client_name,
    stage_ids,
    stage_name,
    responsible_ids,
    responsible_name,
    requestor_ids,
    requestor_email,
    services_catalogs_item_ids,
    catalog_query,
    priority_ids,
    priority_name,
    offset,
    limit,
    is_closed,
    filter_by,
    date_type,
    group_by,
    sla_expiring_before,
    start_datetime,
    end_datetime,
    created_by_way_of,
    update_start_datetime,
    update_end_datetime
  } = args;
  // search so com espacos nao e busca: nao conta como recorte forte nem vai para a API
  // (sem o trim, "   " furava o guard de busca ampla e listava a org inteira).
  const search = typeof args.search === 'string' ? (args.search.trim() || undefined) : args.search;

  // Validar created_by_way_of localmente — rejeitar slug invalido ANTES de chamar a API
  // (API responde 200 com lista incorreta para numero errado, nao 422).
  let finalCreatedByWayOf = null;
  if (created_by_way_of !== undefined) {
    const num = slugToNumber(created_by_way_of);
    if (num === null) {
      return errorResponse(
        `**❌ Valor invalido para created_by_way_of: "${created_by_way_of}"**\n\n` +
        `Valores aceitos: ${validSlugs().join(', ')}.\n\n` +
        `*Verifique o valor informado e tente novamente.*`
      );
    }
    finalCreatedByWayOf = num;
  }

  // Validar o escopo da busca. Filtro de STATUS sozinho (filter_by / is_closed) NAO
  // basta: "tickets abertos" sem mais nada traria um volume enorme e gastaria creditos
  // a toa. Exigimos a MESA (desk) ou outro recorte forte (cliente, solicitante,
  // responsavel, estagio, periodo, SLA vencendo, catalogo, prioridade ou agrupamento).
  const hasDesk = desk_ids || desk_name;
  // H1: estagio e por mesa. stage_name sem mesa nao recorta nada (a API recebia so o
  // status e devolvia os abertos da org inteira) → erro local, antes de qualquer chamada.
  if (stage_name && !stage_ids && !hasDesk) {
    return errorResponse(
      `**❌ stage_name requer mesa**\n\n` +
      `Estágio é por mesa: o mesmo nome pode existir em várias mesas com IDs diferentes. ` +
      `Informe **desk_name** ou **desk_ids** junto com \`stage_name\` (com várias mesas, o estágio é procurado em cada uma).\n\n` +
      `*Para filtrar sem mesa, use stage_ids com os IDs exatos (via search_stage).*`
    );
  }
  // search curto ("ab") casa com quase tudo (titulo, cliente, mesa, numero...): so conta
  // como recorte forte a partir de 3 caracteres. Mais curto continua valido junto com a
  // mesa (ou outro recorte) e vai para a API normalmente.
  const searchIsStrongScope = typeof search === 'string' && search.length >= MIN_SEARCH_SCOPE_LENGTH;
  const hasOtherScope =
    client_ids || client_name || stage_ids ||
    responsible_ids || responsible_name || requestor_ids || requestor_email ||
    start_datetime || end_datetime || sla_expiring_before || group_by ||
    services_catalogs_item_ids || catalog_query || priority_ids || priority_name ||
    created_by_way_of || searchIsStrongScope || update_start_datetime || update_end_datetime;

  if (!hasDesk && !hasOtherScope) {
    return errorResponse(
      `**⚠️ Busca muito ampla — informe a mesa**\n\n` +
      `Filtrar apenas por status traria tickets demais. Informe ao menos a **mesa/equipe** ` +
      `(o recorte mais comum) ou outro filtro que delimite a busca:\n` +
      (search ? `*search "${search}" tem menos de ${MIN_SEARCH_SCOPE_LENGTH} caracteres: sozinho não delimita a busca — use junto com a mesa.*\n` : '') +
      `• **group_by** + **start/end** - Para CONTAR/COMPARAR/TENDÊNCIA (ex: group_by="month" para evolução mensal); para dois períodos use \`${COMPARISON_TOOL_NAME}\`\n` +
      `• **desk_name** - Nome da mesa/equipe (ex: "tuitui") — **preferencial; use quando o usuario der um nome sem qualificar**\n` +
      `• **desk_ids** - IDs das mesas (ex: "1,2,3")\n` +
      `• **client_name** / **client_ids** - Cliente/empresa (ex: "ACME")\n` +
      `• **requestor_email** / **requestor_ids** - Solicitante (ex: "joao@empresa.com")\n` +
      `• **responsible_name** / **responsible_ids** - Responsavel atribuido (ex: "Joao")\n` +
      `• **stage_ids** - Estagio por ID (stage_name exige desk_name ou desk_ids)\n` +
      `• **start_datetime** + **end_datetime** - Periodo (ex: "desta semana", "hoje")\n` +
      `• **search** - Palavra (3+ caracteres) no título/cliente/mesa/número/responsável (complementa a mesa; mais curta, só com a mesa)\n` +
      `• **update_start_datetime** / **update_end_datetime** - Atualizados no periodo\n` +
      `• **sla_expiring_before** - SLA vencendo (para "SLA em risco")\n` +
      `• **catalog_query** - Catalogo de servico (requer mesa)\n` +
      `• **services_catalogs_item_ids** - IDs de itens de catalogo (direto)\n` +
      `• **priority_name** / **priority_ids** - Prioridade\n\n` +
      `*Pergunte ao usuario qual mesa ele quer consultar antes de prosseguir.*`
    );
  }

  // --- Guard-rail: date_type='solved_in_time' x status incompativel ---
  // Feito ANTES dos resolvers para nao gastar chamadas API com filtros contraditorios.
  let filterByAssumed = false;
  if (date_type === 'solved_in_time') {
    const incompatibleFilterBy = filter_by === 'open';
    const incompatibleIsClosed = is_closed === false; // explicit false (not undefined)
    if (incompatibleFilterBy || incompatibleIsClosed) {
      const badParam = incompatibleFilterBy ? `filter_by="${filter_by}"` : `is_closed=false`;
      return errorResponse(
        `**❌ Combinação inválida: solved_in_time + status aberto**\n\n` +
        `\`date_type="solved_in_time"\` filtra pela data de **fechamento/resolução** — requer tickets fechados.\n\n` +
        `Mas \`${badParam}\` indica tickets **abertos** — o resultado seria zero por construção.\n\n` +
        `**Chamada corrigida:** use \`filter_by="closed"\` (resolvidos), \`"canceled"\` ou \`"all"\` (fechados + cancelados).\n\n` +
        `*Exemplo: tickets fechados este mês → \`date_type="solved_in_time"\` + \`filter_by="closed"\`*`
      );
    }
    if (!filter_by && is_closed === undefined) {
      // Nenhum filtro de status informado: assume 'closed' e anuncia no retorno.
      filterByAssumed = true;
    }
  }

  // effectiveFilterBy: o filter_by efetivo que vai para a API e para o eco de filtros.
  const effectiveFilterBy = filterByAssumed ? 'closed' : filter_by;

  try {
    // H11: dedup + corte em 15 dos *_ids informados (antes da resolucao por nome, para
    // o stage_name ser resolvido so nas mesas que de fato vao para a API).
    const capped = capIdFilters({ desk_ids, client_ids, stage_ids, responsible_ids, requestor_ids }, ID_FILTER_LABELS);
    const filterWarnings = [...capped.warnings];
    let finalDeskIds = capped.values.desk_ids;
    let finalDeskId = finalDeskIds ? Number.parseInt(finalDeskIds.split(',')[0], 10) : undefined;
    let finalClientIds = capped.values.client_ids;
    let finalStageIds = capped.values.stage_ids;
    let resolvedDeskInfo = null; // { id, name, searchTerm } para eco

    // Resolver nome da mesa em ID se fornecido
    if (desk_name && !desk_ids) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskIds = resolved.deskId.toString();
      finalDeskId = resolved.deskId;
      resolvedDeskInfo = {
        id: resolved.deskId,
        name: resolved.desk?.display_name || resolved.desk?.name || String(resolved.deskId),
        searchTerm: desk_name
      };
    }

    // H2/H48a: stage_name resolvido em CADA mesa (uniao dos stage_ids), exato unico
    // antes da substring. Sem mesa ja saiu como erro (H1).
    if (stage_name && !stage_ids && finalDeskIds) {
      const deskLabelOf = (id) => (resolvedDeskInfo ? resolvedDeskInfo.name : String(id));
      const stageResolved = await resolveStageAcrossDesks(api, finalDeskIds.split(','), stage_name, deskLabelOf);
      if (stageResolved.error) return stageResolved.error;
      finalStageIds = stageResolved.stageIds;
      filterWarnings.push(...stageResolved.warnings);
      // A uniao pode passar de 15 com muitas mesas: mesmo contrato da API.
      const stageCap = capIdFilters({ stage_ids: finalStageIds }, ID_FILTER_LABELS);
      finalStageIds = stageCap.values.stage_ids;
      filterWarnings.push(...stageCap.warnings);
    }

    // Resolver nome do cliente em ID se fornecido
    if (client_name && !client_ids) {
      const resolved = await resolveClientName(api, client_name);
      if (resolved.error) return resolved.response;
      finalClientIds = String(resolved.clientId);
    }

    // Resolver responsible_name -> responsible_id se fornecido.
    // Repassa deskId quando disponivel para desambiguacao server-side.
    let finalResponsibleIds = capped.values.responsible_ids;
    if (responsible_name && !responsible_ids) {
      const resolved = await resolveResponsibleName(api, responsible_name, {
        deskId: finalDeskId
      });
      if (resolved.error) return resolved.response;
      finalResponsibleIds = String(resolved.userId);
    }

    // Resolver catalog_query -> services_catalogs_item_ids (requer mesa)
    let finalCatalogItemIds = services_catalogs_item_ids || null;
    let catalogWarning = null;

    if (catalog_query) {
      if (!finalDeskId) {
        return errorResponse(
          `**❌ catalog_query requer mesa**\n\n` +
          `O parâmetro \`catalog_query\` requer uma mesa para escopo — catálogos são configurados por mesa.\n\n` +
          `Forneça **desk_id** ou **desk_name** junto com \`catalog_query\`.\n` +
          `Para filtrar por IDs de catálogo sem mesa, use \`services_catalogs_item_ids\` diretamente.`
        );
      }

      const resolved = await resolveCatalogItemIds(api, finalDeskId, catalog_query);
      if (resolved.error) return resolved.response;

      if (resolved.itemIds.length === 0) {
        return errorResponse(
          `**❌ Nenhum item de catálogo encontrado para "${catalog_query}"**\n\n` +
          `A busca por catálogo não retornou itens correspondentes na mesa informada.\n\n` +
          `*Verifique o termo ou use search_catalog_item para explorar os catálogos disponíveis.*`
        );
      }

      // Unir com services_catalogs_item_ids explícito, se houver
      const explicitIds = services_catalogs_item_ids
        ? services_catalogs_item_ids.split(',').map(id => id.trim()).filter(Boolean)
        : [];
      const allCatalogIds = [...new Set([...resolved.itemIds.map(String), ...explicitIds])];
      finalCatalogItemIds = allCatalogIds.join(',');

      if (resolved.warning) {
        catalogWarning = resolved.warning;
      }
    }

    // Enforce o contrato da API /tickets (max 15 IDs, sem duplicados) tanto para
    // catalog_query expandido quanto para services_catalogs_item_ids cru. Enviar >15
    // resultaria em 422 (erro 42201); aqui cortamos com aviso honesto ao usuario.
    if (finalCatalogItemIds) {
      const { ids, capped, total } = capFilterIds(finalCatalogItemIds);
      finalCatalogItemIds = ids;
      if (capped) {
        catalogWarning =
          `O filtro de catálogo resolveu ${total} itens, mas a API /tickets aceita no máximo ${MAX_FILTER_IDS} por consulta — ` +
          `apenas os primeiros ${MAX_FILTER_IDS} foram aplicados. O resultado pode estar incompleto; ` +
          `refine o catalog_query ou use services_catalogs_item_ids com IDs específicos.`;
      }
    }

    // Resolver priority_name -> priority_ids via fuzzy match (requer mesa)
    let finalPriorityIds = priority_ids || null;
    let priorityWarning = null;

    if (priority_name && !priority_ids) {
      if (!finalDeskId) {
        return errorResponse(
          `**❌ priority_name requer mesa**\n\n` +
          `O parâmetro \`priority_name\` requer uma mesa para escopo — prioridades são configuradas por mesa.\n\n` +
          `Forneça **desk_id** ou **desk_name** junto com \`priority_name\`.\n` +
          `Para filtrar por IDs de prioridade sem mesa, use \`priority_ids\` diretamente.`
        );
      }

      const prioritiesResponse = await api.listDeskPriorities(finalDeskId, { limit: 200 });
      if (prioritiesResponse.error) {
        return errorResponse(
          `**❌ Erro ao buscar prioridades da mesa**\n\n` +
          `**Erro:** ${prioritiesResponse.error}\n\n` +
          `*Verifique se a mesa existe e tem prioridades configuradas. Use priority_ids diretamente se souber o ID.*`
        );
      }

      const priorities = prioritiesResponse.data || [];
      const { matches, bestMatch } = fuzzyMatchItems(priority_name, priorities, p => p.name);

      if (!bestMatch) {
        const availableList = priorities.map(p => `• ${p.name} (ID ${p.id})`).join('\n');
        return errorResponse(
          `**❌ Prioridade "${priority_name}" não encontrada na mesa**\n\n` +
          `**Prioridades disponíveis:**\n${availableList || '(nenhuma configurada)'}\n\n` +
          `*Use priority_ids diretamente ou ajuste o priority_name.*`
        );
      }

      // Piso de confianca: so aceita match com score >= MIN_PRIORITY_SCORE (70).
      const topScore = matches[0]?.score ?? 0;
      if (topScore < MIN_PRIORITY_SCORE) {
        const availableList = priorities.map(p => `• ${p.name} (ID ${p.id})`).join('\n');
        return errorResponse(
          `**❌ "${priority_name}" não casou com nenhuma prioridade com confiança suficiente**\n\n` +
          `**Prioridades disponíveis:**\n${availableList || '(nenhuma configurada)'}\n\n` +
          `*Seja mais específico no priority_name ou use priority_ids diretamente.*`
        );
      }

      const sameTierMatches = matches.filter(m => m.score === topScore);

      if (sameTierMatches.length > 1) {
        const list = sameTierMatches.map((m, i) => `${i + 1}. **${m.item.name}** (ID ${m.item.id})`).join('\n');
        return errorResponse(
          `**⚠️ Múltiplas prioridades encontradas para "${priority_name}"**\n\n` +
          `${list}\n\n` +
          `*Use priority_ids específico ou seja mais específico no priority_name.*`
        );
      }

      finalPriorityIds = String(bestMatch.id);
    }

    // Enforce o contrato da API /tickets para priority_ids (max 15, sem duplicados).
    if (finalPriorityIds) {
      const { ids, capped, total } = capFilterIds(finalPriorityIds);
      finalPriorityIds = ids;
      if (capped) {
        priorityWarning =
          `O filtro de prioridade recebeu ${total} IDs, mas a API /tickets aceita no máximo ${MAX_FILTER_IDS} — ` +
          `apenas os primeiros ${MAX_FILTER_IDS} foram aplicados.`;
      }
    }

    // Preparar filtros para a API
    const filters = {};

    if (finalDeskIds) filters.desk_ids = finalDeskIds;
    if (finalClientIds) filters.client_ids = finalClientIds;
    if (finalStageIds) filters.stage_ids = finalStageIds;
    if (finalResponsibleIds) filters.responsible_ids = finalResponsibleIds;
    const finalRequestorIds = capped.values.requestor_ids;
    const finalRequestorEmail = normalizeRequestorEmails(requestor_email);
    const finalLimit = clampListLimit(limit);
    if (finalRequestorIds) filters.requestor_ids = finalRequestorIds;
    if (finalRequestorEmail) filters.requestor_email = finalRequestorEmail;
    if (finalCatalogItemIds) filters.services_catalogs_item_ids = finalCatalogItemIds;
    if (finalPriorityIds) filters.priority_ids = finalPriorityIds;
    if (offset) filters.offset = parseInt(offset);
    if (finalLimit) filters.limit = finalLimit;
    if (is_closed !== undefined) filters.is_closed = is_closed;
    // effectiveFilterBy pode ser 'closed' (assumido) ou o filter_by original
    if (effectiveFilterBy) filters.filter_by = effectiveFilterBy;
    if (date_type) filters.date_type = date_type;
    if (group_by) filters.group_by = group_by;
    if (sla_expiring_before) filters.sla_expiring_before = sla_expiring_before;
    if (start_datetime) filters.start_datetime = start_datetime;
    if (end_datetime) filters.end_datetime = end_datetime;
    if (finalCreatedByWayOf !== null) filters.created_by_way_of = finalCreatedByWayOf;
    if (search) filters.search = search;
    if (update_start_datetime) filters.update_start_datetime = update_start_datetime;
    if (update_end_datetime) filters.update_end_datetime = update_end_datetime;

    // Chamar API para listar tickets
    const response = await api.listTickets(filters);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao listar tickets**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique os filtros informados e suas permissões.*`
      );
    }

    // Entradas de filtros compartilhadas entre todos os caminhos de saida
    const filterEntries = buildFilterEntries({
      finalDeskIds, resolvedDeskInfo,
      finalClientIds, client_name,
      finalStageIds, stage_name,
      finalResponsibleIds, responsible_name,
      requestor_ids: finalRequestorIds, requestor_email: finalRequestorEmail,
      finalCatalogItemIds, catalog_query,
      finalPriorityIds, priority_name,
      effectiveFilterBy, filterByAssumed, is_closed, filter_by,
      date_type, start_datetime, end_datetime,
      group_by, sla_expiring_before,
      search, update_start_datetime, update_end_datetime
    });

    // Modo agregado: API retorna { group_by, date_type, total, buckets } em vez de lista.
    if (group_by) {
      return await renderGroupByResponse({ api, response, filters, filterEntries, filterWarnings, group_by, date_type, start_datetime, end_datetime, filterByAssumed, v });
    }

    const tickets = response.data || [];
    const total = response.total;

    if (tickets.length === 0) {
      const filtersBlock = renderAppliedFilters(filterEntries, v);
      const diagText = await diagnoseZero({ api, filters, verbosity: v });

      let out = `**📋 Nenhum ticket encontrado**\n\n`;
      if (filterByAssumed && v !== 'compact') {
        out += `**⚠️ Suposição de status:** \`filter_by\` não informado com \`date_type="solved_in_time"\` — assumiu \`filter_by="closed"\`. Use \`filter_by="all"\` para incluir cancelados.\n\n`;
      }
      if (filtersBlock) out += `${filtersBlock}\n`;
      if (catalogWarning) out += `**⚠️ Aviso:** ${catalogWarning}\n\n`;
      if (priorityWarning) out += `**⚠️ Aviso:** ${priorityWarning}\n\n`;
      filterWarnings.forEach(w => { out += `**⚠️ Aviso:** ${w}\n\n`; });
      out += `*Tente ajustar os filtros para encontrar tickets.*`;
      if (diagText) out += `\n\n${diagText}`;
      return textResponse(out);
    }

    const currentOffset = filters.offset || 1;
    const currentLimit = filters.limit || 20;

    // F4: sem verbosidade explicita e com > 50 tickets na pagina, sai em compact (com aviso).
    const { verbosity: listV, notice: autoCompactNotice } = listVerbosity({ verbosity, verbosityExplicit }, tickets.length);
    return renderTicketList({
      tickets, total, currentOffset, currentLimit, filterEntries,
      filterByAssumed, catalogWarning, priorityWarning, filterWarnings, group_by, autoCompactNotice, v: listV
    });
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar tickets**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

// Caminho com resultados (fora do execute: complexidade cognitiva).
function renderTicketList({ tickets, total, currentOffset, currentLimit, filterEntries, filterByAssumed, catalogWarning, priorityWarning, filterWarnings = [], group_by, autoCompactNotice, v }) {
  const { header, truncatedHeader, parts, compactHint } = ticketListParts(tickets, total, v);

  // Bloco de filtros para o caminho com resultados: 1 linha (rich) ou compacto
  const filtersBlock = renderAppliedFilters(filterEntries, v);
  const filtersSummary = filtersBlock ? `\n${filtersBlock}` : '';

  // Anuncio de suposicao no caminho com resultados (rich apenas)
  const assumptionBlock = (filterByAssumed && v !== 'compact')
    ? `\n**⚠️ Suposição de status:** \`filter_by\` não informado com \`date_type="solved_in_time"\` — assumiu \`filter_by="closed"\`. Use \`filter_by="all"\` para incluir cancelados.\n`
    : '';

  // Propagar warning de expansao de catalogo na saida
  const warningBlock =
    (catalogWarning ? `\n**⚠️ Aviso de catálogo:** ${catalogWarning}\n` : '') +
    (priorityWarning ? `\n**⚠️ Aviso de prioridade:** ${priorityWarning}\n` : '') +
    filterWarnings.map(w => `\n**⚠️ Aviso de filtro:** ${w}\n`).join('');
  const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: tickets.length, total, unit: 'tickets' }, v);
  const footerStr = footer(v);
  const sep = footerStr ? '\n' : '';

  // Guard de volume: quando o total real (X-Total-Items) supera o limiar e
  // a listagem nao e agregada (sem group_by), emite instrucao dura para nao
  // paginar em analises.
  // Quando o teto corta (ou offset > 1, continuacao em curso), o aviso troca o
  // "NAO pagine" por um texto coerente com a continuacao.
  const { volumeGuard, volumeGuardTruncated } = volumeGuardTexts(group_by, total, v, currentOffset);

  // Teto por item (F3): corta no limite de um ticket com instrucao de continuacao;
  // quando corta, a linha de corte substitui o bloco de paginacao e o cabecalho
  // passa a contar os tickets mostrados.
  return textResponse(renderWithinBudget({
    head: header,
    truncatedHead: truncatedHeader,
    parts,
    middle: `${compactHint}${assumptionBlock}${filtersSummary}${warningBlock}`,
    pagination: paginationInfo,
    tail: `${sep}${footerStr}${volumeGuard}${autoCompactNotice}`,
    truncatedTail: `${sep}${footerStr}${volumeGuardTruncated}${autoCompactNotice}`,
    offset: currentOffset,
    limit: currentLimit,
    unit: 'tickets',
    verbosity: v,
    total
  }));
}

module.exports = { name: schema.name, schema, execute };

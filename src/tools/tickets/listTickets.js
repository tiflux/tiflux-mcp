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
 * Heuristica mesa-first: quando o usuario referencia um nome sem qualificar a entidade,
 * use desk_name. So use client_name quando o usuario disser explicitamente "cliente" ou
 * "empresa". Para pessoas que abriram tickets, use requestor_email ou requestor_ids.
 *
 * Exibicao (Phase 1, custo zero de API):
 * - rich: card do ticket inclui Prioridade e Catalogo (catalog_name > area_name > item_name).
 * - compact: linha do ticket inclui prioridade e catalogo de forma terse.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { footer, pagination } = require('../_shared/format');
const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');
const { resolveCatalogItemIds } = require('../_shared/catalogFilterResolver');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

// Contrato de GET /tickets (Swagger): services_catalogs_item_ids e priority_ids aceitam
// no maximo 15 IDs, sem duplicados (erro 42201 "cannot have more than 15 items").
const MAX_FILTER_IDS = 15;
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

// Dedup + cap 15 num CSV de IDs. Retorna { ids: string, capped: boolean, total: number }.
function capFilterIds(csv) {
  const ids = [...new Set(String(csv).split(',').map(s => s.trim()).filter(Boolean))];
  return { ids: ids.slice(0, MAX_FILTER_IDS).join(','), capped: ids.length > MAX_FILTER_IDS, total: ids.length };
}

const schema = {
  name: 'list_tickets',
  description: `Para CONTAR/COMPARAR/TENDÊNCIA use \`group_by\` (agrupado) ou \`get_tickets_comparison\` (dois períodos, sem paginar). Para VER itens individualmente, use a listagem abaixo. Filtrar so por status (filter_by/is_closed) NAO basta — exige MESA (desk) ou outro recorte forte (cliente, solicitante, responsavel, estagio, periodo, sla_expiring_before, catalogo, prioridade ou group_by). Em busca ampla sem recorte, PERGUNTE a mesa antes de chamar.

**Heuristica mesa-first:** Quando o usuario referencia um nome sem qualificar a entidade (ex: "tickets do tuitui"), trate o termo como mesa (desk_name) — mesa = equipe e e o filtro mais comum. So use client_name se o usuario disser explicitamente "cliente", "empresa" ou nome corporativo. Para pessoas que abriram o ticket, use requestor_email ou requestor_ids. Para o atendente atribuido, use responsible_name (resolve automaticamente para todos os perfis, incluindo nao-admin). Em duvida, pergunte ao usuario.

**Filtro por catalogo:**
- Termo livre → \`catalog_query\`: faz match parcial server-side contra catalogo/area/item ao mesmo tempo — um termo como "segurança" retorna todos os itens de areas/catalogos cujo nome contém "segurança". Requer mesa (desk_id/desk_name).
- IDs precisos → \`services_catalogs_item_ids\` (passthrough direto, sem mesa obrigatoria). Para descobrir IDs, use search_catalog_item.

**Filtro por prioridade:**
- Nome → \`priority_name\`: resolve via fuzzy match em GET /desks/{id}/priorities. Requer mesa.
- IDs → \`priority_ids\` (passthrough direto, sem mesa obrigatoria).

**Exibicao:** catálogo e prioridade aparecem automaticamente no card de cada ticket (dados ja presentes no retorno do GET /tickets — sem custo extra de API).

| Entrada do usuario | Filtro a usar |
|---|---|
| "tickets do tuitui" (nome sem qualificar) | desk_name="tuitui" |
| "tickets da mesa X" ou "equipe Y" | desk_name |
| "tickets do cliente Z" ou "empresa ACME" | client_name |
| "tickets do Joao" (nome de pessoa) | requestor_email ou requestor_ids |
| "tickets atribuidos ao Joao" | responsible_name="Joao" (ou responsible_ids se tiver o ID) |
| "tickets aberto por joao@empresa.com" | requestor_email |
| "tickets do catalogo de infraestrutura" | catalog_query="infraestrutura" + desk_name |
| "tickets com prioridade alta" | priority_name="alta" + desk_name |`,
  inputSchema: {
    type: 'object',
    properties: {
      desk_ids: { type: 'string', description: 'IDs das mesas separados por vírgula (ex: "1,2,3") - máximo 15 IDs' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_ids). Aceita nomes parciais ou multi-palavra (ex: "cansados" resolve para "Dev - Cansados", "dev experimentos" resolve para "DEV - Experimentos"). O fallback fuzzy lista todas as mesas ativas (paginado) para cobrir orgs com muitas mesas. **Prefira este campo quando o usuario der um nome sem qualificar a entidade.**' },
      client_ids: { type: 'string', description: 'IDs dos clientes (empresas) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar pela empresa contratante, nao pela pessoa que abriu o ticket.' },
      client_name: { type: 'string', description: 'Nome do cliente (empresa contratante) para busca automática (alternativa ao client_ids). Use **apenas** quando o usuario disser explicitamente "cliente", "empresa" ou der um nome corporativo conhecido. Para pessoa fisica, prefira requestor_email.' },
      stage_ids: { type: 'string', description: 'IDs dos estágios separados por vírgula (ex: "1,2,3") - máximo 15 IDs' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática (deve ser usado junto com desk_name)' },
      responsible_ids: { type: 'string', description: 'IDs dos responsáveis (atendentes atribuidos) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use quando ja tiver o ID do responsavel.' },
      responsible_name: { type: 'string', description: 'Nome do responsavel (atendente atribuido) para busca automatica. Resolve o ID via GET /users (admin) ou via grupos de atendimento (nao-admin). Use quando o usuario disser "atribuido a", "responsavel" ou der um nome de atendente.' },
      requestor_ids: { type: 'string', description: 'IDs dos solicitantes (pessoa fisica que abriu o ticket) separados por vírgula (ex: "1,2,3") - máximo 15 IDs. Use para filtrar por **pessoa** (nao empresa). Resolva o ID via search_requestor.' },
      requestor_email: { type: 'string', description: 'Email do solicitante (pessoa que abriu o ticket). Use quando o usuario referencia uma **pessoa fisica** ou der um email diretamente. Evita round-trip de resolucao de ID.' },
      services_catalogs_item_ids: { type: 'string', description: 'IDs de itens de catálogo de serviço separados por vírgula (ex: "11,12,13"). Passthrough direto para a API — máximo 15 IDs (limite da API /tickets); acima disso, apenas os 15 primeiros são aplicados com aviso. Use quando ja souber os IDs precisos (via search_catalog_item). Para busca por nome/área/catálogo, use catalog_query.' },
      catalog_query: { type: 'string', description: 'Termo de busca livre para filtrar por catálogo de serviço. Faz match parcial server-side contra nome de catálogo, área e item ao mesmo tempo — ex: "infraestrutura" retorna itens de todas as áreas/catálogos que contenham esse termo. Requer mesa (desk_id ou desk_name). Para IDs precisos, use services_catalogs_item_ids.' },
      priority_ids: { type: 'string', description: 'IDs de prioridade separados por vírgula (ex: "17,18"). Passthrough direto para a API — máximo 15 IDs (limite da API /tickets). Use quando ja souber os IDs (via list_desk_priorities). Para busca por nome, use priority_name.' },
      priority_name: { type: 'string', description: 'Nome da prioridade para busca automática via fuzzy match (ex: "alta", "high", "baixa"). Requer mesa (desk_id ou desk_name). Para IDs diretos, use priority_ids.' },
      ...paginationSchemaProperties(),
      is_closed: { type: 'boolean', description: 'Filtrar tickets fechados/cancelados (padrão: false - apenas abertos). A API força este filtro como true automaticamente quando date_type="solved_in_time". Para "qualquer status" prefira filter_by="all".' },
      filter_by: {
        type: 'string',
        enum: ['open', 'closed', 'canceled', 'all'],
        description: 'Modo de filtro por status, com PRECEDÊNCIA sobre is_closed. "open" = apenas abertos; "closed" = apenas FECHADOS (resolvidos, NÃO inclui cancelados); "canceled" = apenas CANCELADOS; "all" = TODOS os status numa única consulta. Use filter_by="canceled" quando o usuário pedir especificamente "cancelados" (distingue de fechados, mesmo com nomes de status customizados). Use filter_by="all" para "independente de status"/"abertos e fechados".'
      },
      date_type: {
        type: 'string',
        enum: ['created_at', 'solved_in_time'],
        description: 'Tipo de data para filtro temporal. "created_at" (padrão) filtra pela data de CRIAÇÃO. "solved_in_time" filtra pela data de FECHAMENTO/CANCELAMENTO/RESOLUÇÃO. Para buscar tickets fechados, cancelados ou resolvidos em um período (ex: "tickets cancelados hoje", "fechados esta semana"), use "solved_in_time" com start_datetime e/ou end_datetime. A API força is_closed=true automaticamente quando date_type="solved_in_time".'
      },
      group_by: {
        type: 'string',
        enum: ['day', 'week', 'month', 'desk'],
        description: 'Agrupa a CONTAGEM de tickets em vez de listar. "day"/"week"/"month" agrupam por período (combine com date_type + start/end) para comparação/tendência. "desk" agrupa por mesa (ex: "tickets em aberto por mesa", "mesas com SLA em risco"). Retorna um resumo com a quantidade por grupo, não a lista.'
      },
      sla_expiring_before: {
        type: 'string',
        description: 'Filtra tickets ABERTOS (e não parados) cujo SLA de RESOLUÇÃO vence até a data/hora informada (ISO 8601), incluindo já vencidos. Use para "SLA em risco" / "o que pode estourar". Ex: para "hoje", passe o fim do dia. Combine com group_by="desk" para "mesas com SLA em risco".'
      },
      start_datetime: { type: 'string', description: 'Data/hora inicial do filtro no formato ISO 8601 (ex: "2024-05-15T00:00:00Z"). Filtra tickets com data >= start_datetime' },
      end_datetime: { type: 'string', description: 'Data/hora final do filtro no formato ISO 8601 (ex: "2024-05-15T23:59:59Z"). Filtra tickets com data <= end_datetime' }
    },
    required: []
  }
};

async function execute(args, { api, verbosity }) {
  const v = verbosity || 'rich';
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
    end_datetime
  } = args;

  // Validar o escopo da busca. Filtro de STATUS sozinho (filter_by / is_closed) NAO
  // basta: "tickets abertos" sem mais nada traria um volume enorme e gastaria creditos
  // a toa. Exigimos a MESA (desk) ou outro recorte forte (cliente, solicitante,
  // responsavel, estagio, periodo, SLA vencendo, catalogo, prioridade ou agrupamento).
  const hasDesk = desk_ids || desk_name;
  const hasOtherScope =
    client_ids || client_name || stage_ids || stage_name ||
    responsible_ids || responsible_name || requestor_ids || requestor_email ||
    start_datetime || end_datetime || sla_expiring_before || group_by ||
    services_catalogs_item_ids || catalog_query || priority_ids || priority_name;

  if (!hasDesk && !hasOtherScope) {
    return errorResponse(
      `**⚠️ Busca muito ampla — informe a mesa**\n\n` +
      `Filtrar apenas por status traria tickets demais. Informe ao menos a **mesa/equipe** ` +
      `(o recorte mais comum) ou outro filtro que delimite a busca:\n` +
      `• **group_by** + **start/end** - Para CONTAR/COMPARAR/TENDÊNCIA (ex: group_by="month" para evolução mensal); para dois períodos use \`${COMPARISON_TOOL_NAME}\`\n` +
      `• **desk_name** - Nome da mesa/equipe (ex: "tuitui") — **preferencial; use quando o usuario der um nome sem qualificar**\n` +
      `• **desk_ids** - IDs das mesas (ex: "1,2,3")\n` +
      `• **client_name** / **client_ids** - Cliente/empresa (ex: "ACME")\n` +
      `• **requestor_email** / **requestor_ids** - Solicitante (ex: "joao@empresa.com")\n` +
      `• **responsible_name** / **responsible_ids** - Responsavel atribuido (ex: "Joao")\n` +
      `• **stage_ids** / **stage_name** - Estagio (stage_name junto com desk_name)\n` +
      `• **start_datetime** + **end_datetime** - Periodo (ex: "desta semana", "hoje")\n` +
      `• **sla_expiring_before** - SLA vencendo (para "SLA em risco")\n` +
      `• **catalog_query** - Catalogo de servico (requer mesa)\n` +
      `• **services_catalogs_item_ids** - IDs de itens de catalogo (direto)\n` +
      `• **priority_name** / **priority_ids** - Prioridade\n\n` +
      `*Pergunte ao usuario qual mesa ele quer consultar antes de prosseguir.*`
    );
  }

  try {
    let finalDeskIds = desk_ids;
    let finalDeskId = desk_ids ? parseInt(desk_ids.split(',')[0]) : undefined;
    let finalClientIds = client_ids;
    let finalStageIds = stage_ids;

    // Resolver nome da mesa em ID se fornecido
    if (desk_name && !desk_ids) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskIds = resolved.deskId.toString();
      finalDeskId = resolved.deskId;

      // Se stage_name foi fornecido junto com desk_name, buscar o estagio
      if (stage_name && !stage_ids) {
        const stageSearchResponse = await api.searchStages(resolved.deskId);

        if (stageSearchResponse.error) {
          return errorResponse(
            `**❌ Erro ao buscar estágios da mesa "${desk_name}"**\n\n` +
            `**Erro:** ${stageSearchResponse.error}\n\n` +
            `*Verifique se a mesa existe e tem estágios configurados.*`
          );
        }

        const stages = stageSearchResponse.data || [];
        const matchingStages = stages.filter(stage =>
          stage.name.toLowerCase().includes(stage_name.toLowerCase())
        );

        if (matchingStages.length === 0) {
          const stagesList = stages.map(stage => `• ${stage.name}`).join('\n');
          return errorResponse(
            `**❌ Estágio "${stage_name}" não encontrado na mesa "${desk_name}"**\n\n` +
            `**Estágios disponíveis:**\n${stagesList}\n\n` +
            `*Use stage_ids diretamente ou ajuste o stage_name.*`
          );
        }

        if (matchingStages.length > 1) {
          let stagesList = '**Estágios encontrados:**\n';
          matchingStages.forEach((stage, index) => {
            stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name}\n`;
          });

          return errorResponse(
            `**⚠️ Múltiplos estágios encontrados para "${stage_name}" na mesa "${desk_name}"**\n\n` +
            `${stagesList}\n` +
            `*Use stage_ids específico ou seja mais específico no stage_name.*`
          );
        }

        finalStageIds = matchingStages[0].id.toString();
      }
    }

    // Resolver nome do cliente em ID se fornecido
    if (client_name && !client_ids) {
      const resolved = await resolveClientName(api, client_name);
      if (resolved.error) return resolved.response;
      finalClientIds = String(resolved.clientId);
    }

    // Resolver responsible_name -> responsible_id se fornecido.
    // Repassa deskId quando disponivel para desambiguacao server-side.
    let finalResponsibleIds = responsible_ids;
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
      // Abaixo disso (ex.: substring fraco como "ta" casando "Alta" = 50), retorna
      // erro listando as prioridades disponiveis em vez de filtrar por um match fraco.
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
    if (requestor_ids) filters.requestor_ids = requestor_ids;
    if (requestor_email) filters.requestor_email = requestor_email;
    if (finalCatalogItemIds) filters.services_catalogs_item_ids = finalCatalogItemIds;
    if (finalPriorityIds) filters.priority_ids = finalPriorityIds;
    if (offset) filters.offset = parseInt(offset);
    if (limit) filters.limit = parseInt(limit);
    if (is_closed !== undefined) filters.is_closed = is_closed;
    if (filter_by) filters.filter_by = filter_by;
    if (date_type) filters.date_type = date_type;
    if (group_by) filters.group_by = group_by;
    if (sla_expiring_before) filters.sla_expiring_before = sla_expiring_before;
    if (start_datetime) filters.start_datetime = start_datetime;
    if (end_datetime) filters.end_datetime = end_datetime;

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

    // Modo agregado: API retorna { group_by, date_type, total, buckets } em vez de lista.
    if (group_by) {
      const payload = response.data || {};
      const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
      const agg = response.total ?? payload.total ?? buckets.reduce((s, b) => s + (b.count || 0), 0);
      const isDesk = group_by === 'desk';
      const unitLabel = { day: 'dia', week: 'semana', month: 'mês', desk: 'mesa' }[group_by] || group_by;
      const colLabel = isDesk ? 'Mesa' : 'Período';
      // Contexto de data só faz sentido em agrupamento temporal.
      const dtSuffix = isDesk ? '' : ` (data de ${(payload.date_type || date_type) === 'solved_in_time' ? 'fechamento/resolução' : 'criação'})`;

      if (buckets.length === 0) {
        return textResponse(
          `**📊 Contagem por ${unitLabel}**${dtSuffix}\n\n` +
          `Nenhum ticket no período/filtros informados.`
        );
      }

      if (v === 'compact') {
        const line = buckets.map(b => `${b.period}:${b.count}`).join(' · ');
        return textResponse(`Contagem por ${unitLabel} (total ${agg}): ${line}`);
      }

      let out = `**📊 Tickets por ${unitLabel}**${dtSuffix} — total: ${agg}\n\n`;
      out += `| ${colLabel} | Quantidade |\n|---|---|\n`;
      buckets.forEach(b => { out += `| ${b.period} | ${b.count} |\n`; });
      const footerStr = footer(v);
      return textResponse(footerStr ? `${out}\n${footerStr}` : out);
    }

    const tickets = response.data || [];
    const total = response.total;
    // Quando o total (X-Total-Items) excede o que veio nesta pagina, deixa
    // explicito "N de TOTAL" para nao subcontar buscas paginadas.
    const hasTotal = total !== undefined && total !== null && total !== tickets.length;
    const countLabel = hasTotal ? `${tickets.length} de ${total}` : `${tickets.length}`;

    if (tickets.length === 0) {
      return textResponse(
        `**📋 Nenhum ticket encontrado**\n\n` +
        `Não foram encontrados tickets com os filtros aplicados.\n\n` +
        `**Filtros utilizados:**\n` +
        (finalDeskIds ? `• Mesas: ${finalDeskIds}${desk_name ? ` (${desk_name})` : ''}\n` : '') +
        (finalClientIds ? `• Clientes: ${finalClientIds}${client_name ? ` (${client_name})` : ''}\n` : '') +
        (finalStageIds ? `• Estágios: ${finalStageIds}${stage_name ? ` (${stage_name})` : ''}\n` : '') +
        (finalResponsibleIds ? `• Responsáveis: ${finalResponsibleIds}${responsible_name ? ` (${responsible_name})` : ''}\n` : '') +
        (requestor_ids ? `• Solicitantes: ${requestor_ids}\n` : '') +
        (requestor_email ? `• Email solicitante: ${requestor_email}\n` : '') +
        (finalCatalogItemIds ? `• Catálogo (IDs): ${finalCatalogItemIds}${catalog_query ? ` (query: "${catalog_query}")` : ''}\n` : '') +
        (finalPriorityIds ? `• Prioridade (IDs): ${finalPriorityIds}${priority_name ? ` (${priority_name})` : ''}\n` : '') +
        (date_type ? `• Tipo de data: ${date_type}\n` : '') +
        (start_datetime ? `• A partir de: ${start_datetime}\n` : '') +
        (end_datetime ? `• Até: ${end_datetime}\n` : '') +
        `• Status: ${filter_by ? ({ open: 'Abertos', closed: 'Fechados', canceled: 'Cancelados', all: 'Todos' }[filter_by]) : (is_closed ? 'Fechados' : 'Abertos')}\n\n` +
        (catalogWarning ? `**⚠️ Aviso:** ${catalogWarning}\n\n` : '') +
        (priorityWarning ? `**⚠️ Aviso:** ${priorityWarning}\n\n` : '') +
        `*Tente ajustar os filtros para encontrar tickets.*`
      );
    }

    const currentOffset = filters.offset || 1;
    const currentLimit = filters.limit || 20;

    // Helper para formatar o catalogo de servico de um ticket
    function formatCatalog(servicesCatalog) {
      if (!servicesCatalog) return '—';
      const parts = [
        servicesCatalog.catalog_name,
        servicesCatalog.area_name,
        servicesCatalog.item_name
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' › ') : '—';
    }

    let ticketsList;
    if (v === 'compact') {
      // compact: item ultra-terso — 1 linha por ticket
      ticketsList = `Tickets (${countLabel}):\n`;
      tickets.forEach(ticket => {
        const n = ticket.ticket_number || 'N/A';
        const title = ticket.title || '(sem título)';
        const status = ticket.status?.name || 'N/A';
        const stage = ticket.stage?.name || 'N/A';
        const responsible = ticket.responsible?.name || 'N/A';
        const priority = ticket.priority?.name || '—';
        const catalog = formatCatalog(ticket.services_catalog);
        ticketsList += `#${n} ${title} | ${status} | ${stage} | ${responsible} | ${priority} | ${catalog}\n`;
      });
      ticketsList += `(use get_ticket #N para detalhes)\n`;
    } else {
      // rich: saida com catalogo + prioridade
      ticketsList = `**📋 Lista de Tickets** (${countLabel} encontrados)\n\n`;

      tickets.forEach((ticket, index) => {
        const ticketNumber = ticket.ticket_number || 'N/A';
        const title = ticket.title || 'Sem título';
        const clientName = ticket.client?.name || 'Cliente não informado';
        const deskName = ticket.desk?.name || 'Mesa não informada';
        const stageName = ticket.stage?.name || 'Estágio não informado';
        const responsibleName = ticket.responsible?.name || 'Não atribuído';
        const status = ticket.status?.name || 'Status não informado';
        const priority = ticket.priority?.name || '—';
        const catalog = formatCatalog(ticket.services_catalog);
        const createdAt = ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('pt-BR') : 'Data não informada';

        // Resumo da descricao (primeiras 100 caracteres)
        let descriptionSummary = '';
        if (ticket.description) {
          descriptionSummary = ticket.description.length > 100
            ? ticket.description.substring(0, 100) + '...'
            : ticket.description;
          descriptionSummary = `\n   📄 ${descriptionSummary}`;
        }

        ticketsList += `**${index + 1}. Ticket #${ticketNumber}**\n` +
                      `   📝 **Título:** ${title}\n` +
                      `   👤 **Responsável:** ${responsibleName}\n` +
                      `   🏢 **Cliente:** ${clientName}\n` +
                      `   🗂️ **Mesa:** ${deskName}\n` +
                      `   📊 **Estágio:** ${stageName}\n` +
                      `   🚨 **Status:** ${status}\n` +
                      `   🔴 **Prioridade:** ${priority}\n` +
                      `   🗃️ **Catálogo:** ${catalog}\n` +
                      `   📅 **Criado em:** ${createdAt}${descriptionSummary}\n\n`;
      });
    }

    // Propagar warning de expansao de catalogo na saida
    const warningBlock =
      (catalogWarning ? `\n**⚠️ Aviso de catálogo:** ${catalogWarning}\n` : '') +
      (priorityWarning ? `\n**⚠️ Aviso de prioridade:** ${priorityWarning}\n` : '');
    const paginationInfo = pagination({ offset: currentOffset, limit: currentLimit, count: tickets.length, total, unit: 'tickets' }, v);
    const footerStr = footer(v);
    const sep = footerStr ? '\n' : '';

    // Guard de volume: quando o total real (X-Total-Items) supera o limiar e
    // a listagem nao e agregada (sem group_by), emite instrucao dura para nao
    // paginar em analises. O total vem do header via api.listTickets.
    let volumeGuard = '';
    if (!group_by && typeof total === 'number' && total > LIST_TOTAL_WARN_THRESHOLD) {
      if (v === 'compact') {
        volumeGuard = `\n⚠️ Volume alto: ${total} tickets no total — NAO pagine para analise. Use group_by ou ${COMPARISON_TOOL_NAME}, ou refine o recorte.`;
      } else {
        volumeGuard =
          `\n**⚠️ Volume alto: ${total} tickets no total — NÃO pagine para análise.**` +
          ` Para contar/comparar/tendência use \`group_by\` ou \`${COMPARISON_TOOL_NAME}\`, ou refine o recorte` +
          ` (mesa, período, cliente). Só pagine se o usuário precisar dos itens individuais.`;
      }
    }

    return textResponse(`${ticketsList}${warningBlock}${paginationInfo}${sep}${footerStr}${volumeGuard}`);
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao listar tickets**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };

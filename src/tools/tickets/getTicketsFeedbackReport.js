/**
 * Slice: get_tickets_feedback_report — relatório de avaliações de atendimento (tickets)
 * com comparação de período embutida.
 *
 * Resolve análise de satisfação em 1 chamada MCP: internamente 2 chamadas
 * sequenciais a GET /reports/feedbacks/tickets (período principal + período de
 * comparação), cálculo de Δ/Δ% sobre o summary, e lista opcional de tickets
 * avaliados (include_list=true).
 *
 * O fluxo comum (validação, período de comparação, 2 chamadas, tabela de
 * métricas, lista) vive em `_shared/feedbackReport.js`; aqui ficam apenas as
 * diferenças de tickets: schema, métricas do summary e render da tabela de itens.
 *
 * Contrato real verificado em produção (2026-07-16): o item da lista de tickets
 * diverge da Swagger em vários campos:
 *  - `rating`: integer (não string como na Swagger)
 *  - `revised_in_time`: timestamp da avaliação (não existe `rating_time`)
 *  - `comments`: plural, string vazia "" quando não há comentário
 *  - `desk_id` + `desk_name`: presentes (não constam na Swagger)
 *  - `origin`: não existe em tickets (existe apenas em chats)
 *
 * Nome deliberado: o orquestrador do Assistente IA filtra tools por prefixo
 * de leitura (list_, get_, search_) — get_ passa; report_ seria filtrado fora.
 *
 * Endpoint: GET /reports/feedbacks/tickets (2 chamadas por invocação).
 *
 * Nota: a rota requer permissão de administrador/relatórios na API v2.
 * Chaves não-admin recebem 403 com error_code 40301.
 */

const { runFeedbackReport } = require('../_shared/feedbackReport');
const { feedbackReportSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'get_tickets_feedback_report',
  description: `Relatório de AVALIAÇÕES DE ATENDIMENTO de tickets com comparação automática de período. Use quando o usuário pedir "avaliações de tickets", "satisfação dos tickets", "CSAT de tickets", "como estão as notas dos tickets?", "comentários das avaliações" ou qualquer análise de satisfação de atendimento via ticket por período.

**Quando usar vs outras tools:**
- **Avaliações/satisfação de TICKETS** → get_tickets_feedback_report (este)
- **Avaliações/satisfação de CHATS** → get_chats_feedback_report
- **Contagem/comparação de tickets** → get_tickets_comparison

**Período de comparação padrão:** se compare_start_date/compare_end_date não forem informados, o período de comparação é o imediatamente anterior de mesma duração (compare_end = start_date − 1s; mesma duração). Forneça apenas start_date e end_date e o período de comparação é calculado automaticamente.

**Filtro por nota não existe na API** — para filtrar por nota (rating), use include_list=true e filtre a lista retornada por rating client-side (ex: "mostre só os tickets com nota < 3").

**Campo comments:** só existe no relatório de tickets (não em chats). String vazia "" quando o cliente não deixou comentário.

**Fluxo de enriquecimento de um ticket avaliado:**
1. Rode com include_list=true para obter a lista de tickets avaliados do período (com rating, revised_in_time, cliente, responsável, mesa, comentário da avaliação).
2. Para detalhes completos de um ticket (histórico, respostas, SLA) → use get_ticket com o ticket_number ou list_ticket_answers.
3. Comentário da avaliação (comments) já está disponível na lista — não é necessário enriquecer para obtê-lo.

Exemplos de uso:
- "Como estão as avaliações de tickets desta semana?" → start_date/end_date da semana
- "Compare satisfação de tickets este mês vs mês passado" → start_date/end_date do mês atual, compare automático
- "Quais tickets receberam nota baixa com comentário?" → include_list=true + filtrar client-side`,
  inputSchema: {
    type: 'object',
    properties: feedbackReportSchemaProperties(
      'Se true, inclui a lista paginada de tickets avaliados no período principal (com comments, rating, mesa, responsável). Útil para ver itens individuais e filtrar por nota client-side. Default: false.'
    ),
    required: ['start_date', 'end_date']
  }
};

const METRICS = [
  { key: 'rating_average', label: 'Média de avaliação', isFloat: true },
  { key: 'tickets_evaluated', label: 'Tickets avaliados' },
  { key: 'tickets_finished', label: 'Tickets finalizados' },
  { key: 'clients_evaluated', label: 'Clientes avaliadores' },
  { key: 'answers_percentage', label: 'Taxa de resposta (%)', isPercent: true }
];

/** Render da tabela de tickets avaliados (colunas/mapeamento específicos de ticket). */
function renderList(list, { effectiveLimit, effectiveOffset, evaluatedTotal }) {
  let s = `| # | Cliente | Responsável | Mesa | Nota | Data avaliação | Comentário |\n`;
  s += `|---|---------|-------------|------|------|----------------|------------|\n`;
  for (const ticket of list) {
    const revisedTime = ticket.revised_in_time ? ticket.revised_in_time.substring(0, 10) : '—';
    const client = ticket.client_name || '—';
    const responsible = ticket.responsible_name || '—';
    const desk = ticket.desk_name || '—';
    const rating = ticket.rating ?? '—';
    // comments é plural e pode ser string vazia "" — contrato real verificado
    const comments = ticket.comments && ticket.comments.trim() ? ticket.comments.trim().substring(0, 80) : '—';
    const ticketNum = ticket.id ? `#${ticket.id}` : '—';
    s += `| ${ticketNum} | ${client} | ${responsible} | ${desk} | ${rating} | ${revisedTime} | ${comments} |\n`;
  }
  s += `\n*Para detalhes completos: use \`get_ticket\` com o número do ticket ou \`list_ticket_answers\` para ver as respostas.*\n`;
  s += `*Para filtrar por nota: filtre a coluna "Nota" da lista acima client-side (não há filtro por nota na API).*\n`;

  // Paginação (sem header X-Total-Items neste endpoint — usar tickets_evaluated do summary)
  if (list.length === effectiveLimit) {
    s += `\n*Há mais itens — use \`offset: ${effectiveOffset + 1}\` para ver a próxima página. Total avaliados: ${evaluatedTotal} (do summary acima).*\n`;
  }
  return s;
}

async function execute(args, ctx) {
  return runFeedbackReport(args, ctx, {
    entityLabel: 'Tickets',
    entitySingular: 'ticket',
    apiMethod: (api, filters) => api.getTicketsFeedbackReport(filters),
    listParamKey: 'tickets_list',
    listDataKey: 'tickets_list',
    evaluatedKey: 'tickets_evaluated',
    metrics: METRICS,
    renderList
  });
}

module.exports = { name: schema.name, schema, execute };

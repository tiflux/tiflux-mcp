/**
 * Slice: get_chats_feedback_report — relatório de avaliações de atendimento (chats)
 * com comparação de período embutida.
 *
 * Resolve análise de satisfação em 1 chamada MCP: internamente 2 chamadas
 * sequenciais a GET /reports/feedbacks/chats (período principal + período de
 * comparação), cálculo de Δ/Δ% sobre o summary, e lista opcional de chats
 * avaliados (include_list=true).
 *
 * O fluxo comum (validação, período de comparação, 2 chamadas, tabela de
 * métricas, lista) vive em `_shared/feedbackReport.js`; aqui ficam apenas as
 * diferenças de chats: schema, métricas do summary e render da tabela de itens.
 *
 * Nome deliberado: o orquestrador do Assistente IA filtra tools por prefixo
 * de leitura (list_, get_, search_) — get_ passa; report_ seria filtrado fora.
 *
 * Período de comparação default: imediatamente anterior de mesma duração
 * (compare_end = start − 1s; duração idêntica). Sem snapping de calendário.
 *
 * Endpoint: GET /reports/feedbacks/chats (2 chamadas por invocação).
 *
 * Nota: a rota requer permissão de administrador/relatórios na API v2.
 * Chaves não-admin recebem 403 com error_code 40301.
 */

const { runFeedbackReport } = require('../_shared/feedbackReport');
const { feedbackReportSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'get_chats_feedback_report',
  description: `Relatório de AVALIAÇÕES DE ATENDIMENTO de chats com comparação automática de período. Use quando o usuário pedir "avaliações de chats", "satisfação dos chats", "CSAT de chats", "como estão as notas dos chats?" ou qualquer análise de satisfação de atendimento por período.

**Quando usar vs outras tools:**
- **Avaliações/satisfação de CHATS** → get_chats_feedback_report (este)
- **Avaliações/satisfação de TICKETS** → get_tickets_feedback_report
- **Contagem/comparação de tickets** → get_tickets_comparison

**Período de comparação padrão:** se compare_start_date/compare_end_date não forem informados, o período de comparação é o imediatamente anterior de mesma duração (compare_end = start_date − 1s; mesma duração). Forneça apenas start_date e end_date e o período de comparação é calculado automaticamente.

**Filtro por nota não existe na API** — para filtrar por nota (rating), use include_list=true e filtre a lista retornada por rating client-side (ex: "mostre só os chats com nota < 3").

**Fluxo de enriquecimento de um chat avaliado:**
1. Rode com include_list=true para obter a lista de chats avaliados do período (com rating, rating_time, cliente, responsável, ticket vinculado).
2. Para detalhes completos de um chat (requestor, departamento, catálogo de serviços, origem completa, timestamps) → use get_chat com o id retornado.
3. Comentário da avaliação (comments) não está disponível no relatório de chats — apenas no relatório de tickets.

Exemplos de uso:
- "Como estão as avaliações de chats desta semana?" → start_date/end_date da semana
- "Compare satisfação de chats este mês vs mês passado" → start_date/end_date do mês atual, compare automático
- "Quais chats tiveram nota 1 ou 2 esta semana?" → include_list=true + filtrar rating client-side`,
  inputSchema: {
    type: 'object',
    properties: feedbackReportSchemaProperties(
      'Se true, inclui a lista paginada de chats avaliados no período principal. Útil para ver itens individuais e filtrar por nota client-side. Default: false.'
    ),
    required: ['start_date', 'end_date']
  }
};

const METRICS = [
  { key: 'rating_average', label: 'Média de avaliação', isFloat: true },
  { key: 'chats_evaluated', label: 'Chats avaliados' },
  { key: 'chats_finished', label: 'Chats finalizados' },
  { key: 'clients_evaluated', label: 'Clientes avaliadores' },
  { key: 'answers_percentage', label: 'Taxa de resposta (%)', isPercent: true }
];

/** Render da tabela de chats avaliados (colunas/mapeamento específicos de chat). */
function renderList(list, { effectiveLimit, effectiveOffset }) {
  let s = `| ID | Cliente | Responsável | Nota | Data avaliação | Ticket |\n`;
  s += `|----|---------|-------------|------|----------------|--------|\n`;
  for (const chat of list) {
    const ratingTime = chat.rating_time ? chat.rating_time.substring(0, 10) : '—';
    const client = chat.client_name || '—';
    const responsible = chat.responsible_name || '—';
    const rating = chat.rating ?? '—';
    const ticket = chat.ticket_number ? `#${chat.ticket_number}` : '—';
    s += `| ${chat.id} | ${client} | ${responsible} | ${rating} | ${ratingTime} | ${ticket} |\n`;
  }
  s += `\n*Para detalhes completos de um chat: use \`get_chat\` com o id retornado.*\n`;
  s += `*Para filtrar por nota: filtre a coluna "Nota" da lista acima client-side (não há filtro por nota na API).*\n`;

  // Paginação (sem header X-Total-Items neste endpoint)
  if (list.length === effectiveLimit) {
    s += `\n*Há mais itens — use \`offset: ${effectiveOffset + 1}\` para ver a próxima página. Total disponível: use \`chats_evaluated\` do summary acima.*\n`;
  }
  return s;
}

async function execute(args, ctx) {
  return runFeedbackReport(args, ctx, {
    entityLabel: 'Chats',
    entitySingular: 'chat',
    apiMethod: (api, filters) => api.getChatsFeedbackReport(filters),
    listParamKey: 'chats_list',
    listDataKey: 'chats_list',
    evaluatedKey: 'chats_evaluated',
    metrics: METRICS,
    renderList
  });
}

module.exports = { name: schema.name, schema, execute };

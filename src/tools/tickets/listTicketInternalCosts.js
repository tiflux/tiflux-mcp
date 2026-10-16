/**
 * Slice: list_ticket_internal_costs — custos internos de um ticket (NÃO cobrados do cliente).
 *
 * Endpoint: GET /tickets/{ticket_number}/internal-costs (via api.fetchTicketInternalCosts).
 * Formatter/execute compartilhados com list_ticket_extra_values em ./ticketValueEntries.js.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { buildValueEntriesExecute } = require('./ticketValueEntries');

const schema = {
  name: 'list_ticket_internal_costs',
  description:
    'Listar os custos internos de um ticket (aba "Valorização" → "Custos internos" do portal): o que a operação GASTOU para ' +
    'atender. Custos internos NÃO são cobrados do cliente. Cada lançamento traz data, item de valor extra (ou "Inserido manualmente"), ' +
    'descrição, quantidade, valor unitário, valor total, quem lançou e arquivos (links válidos por 72 h). O rodapé soma os valores ' +
    '("Total do ticket" quando a página cobre todos os lançamentos; senão "Soma desta página"). Sem a permissão "Visualizar valores ' +
    'dos tickets" os valores aparecem ocultos, exceto nos lançamentos que o próprio usuário criou, e ficam fora da soma. Num ' +
    'agrupamento de tickets os custos internos NÃO migram: ficam no ticket agrupado (cancelado). Para o que será ' +
    'cobrado do cliente, use `list_ticket_extra_values`. Somente leitura: a API não permite lançar ou editar custos internos.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket (ex: "6167")'
      },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

const execute = buildValueEntriesExecute({
  fetch: (api, ticketNumber, page) => api.fetchTicketInternalCosts(ticketNumber, page),
  resourceLabel: 'custos internos',
  title: 'Custos internos',
  emoji: '🧾',
  emptyLabel: 'custo interno',
  showBilled: false,
  contextNote: 'Os valores de custos internos não são cobrados do cliente.'
});

module.exports = { name: schema.name, schema, execute };

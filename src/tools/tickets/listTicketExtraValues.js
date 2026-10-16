/**
 * Slice: list_ticket_extra_values — valores extras de um ticket (cobrados do cliente).
 *
 * Endpoint: GET /tickets/{ticket_number}/extra-values (via api.fetchTicketExtraValues).
 * Formatter/execute compartilhados com list_ticket_internal_costs em ./ticketValueEntries.js.
 */

const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { buildValueEntriesExecute } = require('./ticketValueEntries');

const schema = {
  name: 'list_ticket_extra_values',
  description:
    'Listar os valores extras de um ticket (aba "Valorização" → "Valores extras" do portal): o que será COBRADO DO CLIENTE ' +
    'além do atendimento (ex.: deslocamento, peça, hora fora do expediente). Cada lançamento traz data, item de valor extra ' +
    '(ou "Inserido manualmente"), descrição, quantidade, valor unitário, valor total, quem lançou, arquivos (links válidos por 72 h) ' +
    'e se já foi faturado. O rodapé soma os valores e separa faturado × a faturar ("Total do ticket" quando a página cobre todos os ' +
    'lançamentos; senão "Soma desta página"). Sem a permissão "Visualizar valores dos tickets" os valores aparecem ocultos, exceto ' +
    'nos lançamentos que o próprio usuário criou, e ficam fora da soma. Valor extra já faturado não pode mais ser editado nem removido ' +
    'no portal. Num agrupamento de tickets os valores extras migram para o ticket principal. Valores avulsos de apontamento e ' +
    'deslocamentos NÃO estão aqui: use `list_appointments` e `get_ticket_shifts`. Para o que a operação gastou (não cobrado), ' +
    'use `list_ticket_internal_costs`. Somente leitura: a API não permite lançar ou editar valores extras.',
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
  fetch: (api, ticketNumber, page) => api.fetchTicketExtraValues(ticketNumber, page),
  resourceLabel: 'valores extras',
  title: 'Valores extras',
  emoji: '💵',
  emptyLabel: 'valor extra',
  showBilled: true,
  contextNote: 'Valores extras são cobrados do cliente além do atendimento.'
});

module.exports = { name: schema.name, schema, execute };

/**
 * TicketTools — agregador de slices do modulo tickets.
 *
 * Cada slice em `./<toolName>.js` exporta `{ name, schema, execute }`.
 * O agregador:
 *   - instancia `this.api` (TiFluxAPI) para o registry hidratar via setApiKey
 *   - instala um metodo `_exec_<toolName>` por slice, com ctx { api, logger }
 *   - expoe `static TOOLS` derivado dos slices (formato consumido pelo registry)
 *
 * Status: 19 slices — 10 originais com paridade byte-a-byte contra o legado
 * src/handlers/tickets.js (validado via tests/unit/tools/tickets/parity.test.js)
 * + 4 de answers/histories/reopen (spec 2026-06-12-ticket-answers-read)
 * + 2 de upload/delete arquivos (spec 2026-06-16-ticket-files-upload-delete-base64)
 * + 1 de comparação agregada (spec 2026-07-07-tickets-comparison-aggregation).
 * Registry swap ocorre em src/registry/index.js.
 */

const TiFluxAPI = require('../../api/tiflux-api');

// Ordem preservada do legado src/handlers/tickets.js (declaracao em TOOLS).
// Importante: registry agrega schemas nesta ordem; testes em
// tests/unit/registry/index.test.js validam a sequencia.
const slices = [
  require('./getTicket'),
  require('./createTicket'),
  require('./updateTicket'),
  require('./cancelTicket'),
  require('./closeTicket'),
  require('./listTickets'),
  require('./getTicketsComparison'),
  require('./createTicketAnswer'),
  require('./updateTicketEntities'),
  require('./getTicketFiles'),
  require('./getTicketStagesSlas'),
  require('./listTicketAnswers'),
  require('./getTicketAnswer'),
  require('./getTicketHistories'),
  require('./reopenTicket'),
  require('./uploadTicketFiles'),
  require('./deleteTicketFile'),
  require('./deleteTicketAnswer'),
  require('./deleteTicketAnswerFile'),
  require('./getTicketsFeedbackReport')
];

class TicketTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  TicketTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

TicketTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = TicketTools;

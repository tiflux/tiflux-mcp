/**
 * TicketTools — agregador de slices do modulo tickets.
 *
 * Cada slice em `./<toolName>.js` exporta `{ name, schema, execute }`.
 * O agregador:
 *   - instancia `this.api` (TiFluxAPI) para o registry hidratar via setApiKey
 *   - instala um metodo `_exec_<toolName>` por slice, com ctx { api, logger }
 *   - expoe `static TOOLS` derivado dos slices (formato consumido pelo registry)
 *
 * Status: 10/10 slices implementados com paridade byte-a-byte contra
 * src/handlers/tickets.js (validado via tests/unit/tools/tickets/parity.test.js).
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
  require('./createTicketAnswer'),
  require('./updateTicketEntities'),
  require('./getTicketFiles'),
  require('./getTicketStagesSlas')
];

class TicketTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  TicketTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

TicketTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = TicketTools;

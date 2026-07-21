/**
 * PreTicketTools — agregador do módulo pre_tickets.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listPreTickets'),
  require('./createPreTicket')
];

class PreTicketTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  PreTicketTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

PreTicketTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = PreTicketTools;

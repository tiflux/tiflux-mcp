/**
 * UserTools — agregador do modulo users.
 *
 * Mesma estrutura do TicketTools: slices exportam { name, schema, execute },
 * agregador instala _exec_<toolName> no prototype e deriva static TOOLS.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./searchUser')
];

class UserTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  UserTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

UserTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = UserTools;

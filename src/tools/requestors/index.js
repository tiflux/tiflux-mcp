/**
 * RequestorTools — agregador do modulo requestors.
 *
 * Mesma estrutura dos outros agregadores: slices exportam { name, schema, execute },
 * agregador instala _exec_<toolName> no prototype e deriva static TOOLS.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./searchRequestor'),
  require('./listRequestors'),
  require('./getRequestor'),
  require('./createRequestor'),
  require('./updateRequestor'),
  require('./updateRequestorEntities')
];

class RequestorTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  RequestorTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

RequestorTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = RequestorTools;

/**
 * ClientTools — agregador do modulo clients.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./searchClient')
];

class ClientTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  ClientTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

ClientTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = ClientTools;

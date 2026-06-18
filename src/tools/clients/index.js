/**
 * ClientTools — agregador do modulo clients.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./searchClient'),
  require('./getClient'),
  require('./createClient'),
  require('./updateClient'),
  require('./updateClientEntities'),
  require('./listClients'),
  require('./getClientDesks'),
  require('./getClientTechnicalGroups'),
  require('./createClientUser'),
  require('./addClientEmailPermission')
];

class ClientTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  ClientTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

ClientTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = ClientTools;

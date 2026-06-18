/**
 * EntityTools — agregador do modulo entities.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listEntities'),
  require('./listEntityFields'),
  require('./listEntityFieldOptions')
];

class EntityTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  EntityTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

EntityTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = EntityTools;

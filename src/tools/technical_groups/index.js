/**
 * TechnicalGroupTools — agregador do modulo technical_groups.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listTechnicalGroups'),
  require('./getTechnicalGroup'),
  require('./listTechnicalGroupDesks'),
  require('./listTechnicalGroupClients'),
  require('./listTechnicalGroupUsers')
];

class TechnicalGroupTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
    this.verbosityExplicit = false;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  TechnicalGroupTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity, verbosityExplicit: this.verbosityExplicit });
  };
});

TechnicalGroupTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = TechnicalGroupTools;

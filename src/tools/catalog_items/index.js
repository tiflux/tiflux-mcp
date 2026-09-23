/**
 * CatalogItemTools — agregador do modulo catalog_items.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./searchCatalogItem')
];

class CatalogItemTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
    this.verbosityExplicit = false;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  CatalogItemTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity, verbosityExplicit: this.verbosityExplicit });
  };
});

CatalogItemTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = CatalogItemTools;

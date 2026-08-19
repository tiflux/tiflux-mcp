/**
 * ServicesCatalogTools — agregador do módulo services_catalogs.
 *
 * 12 slices em 3 níveis: catálogos → áreas → itens.
 * Molde: src/tools/internal_communications/index.js
 */

const TiFluxAPI = require('../../api/tiflux-api');

// Ordem: catálogos (list/create/update/delete) → áreas → itens
const slices = [
  require('./listServicesCatalogs'),
  require('./createServicesCatalog'),
  require('./updateServicesCatalog'),
  require('./deleteServicesCatalog'),
  require('./listServicesCatalogAreas'),
  require('./createServicesCatalogArea'),
  require('./updateServicesCatalogArea'),
  require('./deleteServicesCatalogArea'),
  require('./listServicesCatalogItems'),
  require('./createServicesCatalogItem'),
  require('./updateServicesCatalogItem'),
  require('./deleteServicesCatalogItem')
];

class ServicesCatalogTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  ServicesCatalogTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

ServicesCatalogTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = ServicesCatalogTools;

/**
 * DeskTools — agregador do modulo desks.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listDesks'),
  require('./getDesk'),
  require('./listDeskPriorities'),
  require('./listDeskServicesCatalogs')
];

class DeskTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  DeskTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

DeskTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = DeskTools;

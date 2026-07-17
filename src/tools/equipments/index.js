/**
 * EquipmentTools — agregador do modulo equipments/recursos.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listEquipments'),
  require('./createEquipment'),
  require('./updateEquipment'),
  require('./listEquipmentSoftwares'),
  require('./listEquipmentGroups'),
  require('./listEquipmentTypes')
];

class EquipmentTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  EquipmentTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

EquipmentTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = EquipmentTools;

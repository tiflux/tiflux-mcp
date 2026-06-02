/**
 * InternalCommunicationsTools — agregador do modulo internal_communications.
 */

const TiFluxAPI = require('../../api/tiflux-api');

// Ordem preservada do handler legado: create -> list -> get.
const slices = [
  require('./createInternalCommunication'),
  require('./listInternalCommunications'),
  require('./getInternalCommunication')
];

class InternalCommunicationsTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  InternalCommunicationsTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

InternalCommunicationsTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = InternalCommunicationsTools;

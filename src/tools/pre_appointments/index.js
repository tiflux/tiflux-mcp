/**
 * PreAppointmentTools — agregador do modulo pre_appointments.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listPreAppointments')
];

class PreAppointmentTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  PreAppointmentTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

PreAppointmentTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = PreAppointmentTools;

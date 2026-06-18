/**
 * AppointmentTools — agregador do modulo appointments.
 */

const TiFluxAPI = require('../../api/tiflux-api');

// Ordem preservada do handler legado: create primeiro, list depois.
const slices = [
  require('./createAppointment'),
  require('./listAppointments')
];

class AppointmentTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  AppointmentTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

AppointmentTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = AppointmentTools;

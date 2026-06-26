/**
 * DepartmentTools — agregador do modulo departments.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listDepartments')
];

class DepartmentTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  DepartmentTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

DepartmentTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = DepartmentTools;

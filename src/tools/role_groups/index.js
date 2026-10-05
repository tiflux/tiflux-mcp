/**
 * RoleGroupTools — agregador do modulo role_groups.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listRoleGroups'),
  require('./getRoleGroup'),
  require('./listRoleGroupUsers'),
  require('./listRoleGroupTechnicalGroups')
];

class RoleGroupTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
    this.verbosityExplicit = false;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  RoleGroupTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity, verbosityExplicit: this.verbosityExplicit });
  };
});

RoleGroupTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = RoleGroupTools;

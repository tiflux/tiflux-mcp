/**
 * KnowledgeTools — agregador do modulo knowledges (base de conhecimento).
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listKnowledges'),
  require('./createKnowledge')
];

class KnowledgeTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  KnowledgeTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

KnowledgeTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = KnowledgeTools;

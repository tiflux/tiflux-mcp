/**
 * TemplateTools — agregador do módulo templates.
 *
 * Expõe as 2 tools de consulta de templates de mensagem via HandlerRegistry.
 * Seguindo o padrão de src/tools/chats/index.js.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./listGupshupTemplates'),
  require('./listWhatsappCloudTemplates')
];

class TemplateTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
    this.verbosity = 'rich';
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  TemplateTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger, verbosity: this.verbosity });
  };
});

TemplateTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = TemplateTools;

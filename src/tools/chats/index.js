/**
 * ChatTools — agregador do módulo chats.
 *
 * Expõe as 5 tools de consulta de chats via HandlerRegistry.
 * Seguindo o padrão de src/tools/appointments/index.js.
 */

const TiFluxAPI = require('../../api/tiflux-api');

const slices = [
  require('./getChat'),
  require('./listInboxChats'),
  require('./listMyChats'),
  require('./listInAttendanceChats'),
  require('./listArchivedChats'),
  require('./updateChat'),
  require('./sendMessage'),
  require('./archiveChat')
];

class ChatTools {
  constructor() {
    this.api = new TiFluxAPI();
    this.logger = console;
  }
}

slices.forEach(slice => {
  const methodName = `_exec_${slice.name}`;
  ChatTools.prototype[methodName] = function (args) {
    return slice.execute(args, { api: this.api, logger: this.logger });
  };
});

ChatTools.TOOLS = Object.fromEntries(
  slices.map(slice => [
    slice.name,
    { schema: slice.schema, method: `_exec_${slice.name}` }
  ])
);

module.exports = ChatTools;

/**
 * Registry central de handlers MCP.
 *
 * Para adicionar uma tool nova: declare `static TOOLS` no handler. Se for
 * uma classe de handler nova, registre uma linha abaixo. Nao precisa mais
 * editar server-sdk.js, ServerFactory.js, Server.js nem PresentationBootstrap.js.
 */

const HandlerRegistry = require('./HandlerRegistry');

const TicketHandlers = require('../tools/tickets');
const ClientHandlers = require('../tools/clients');
const UserHandlers = require('../tools/users');
const StageHandlers = require('../tools/stages');
const CatalogItemHandlers = require('../tools/catalog_items');
const InternalCommunicationsHandlers = require('../tools/internal_communications');
const AppointmentHandlers = require('../tools/appointments');
const ChatHandlers = require('../tools/chats');
const DeskHandlers = require('../tools/desks');
const DepartmentHandlers = require('../tools/departments');
const EntityHandlers = require('../tools/entities');
const RequestorHandlers = require('../tools/requestors');
const KnowledgeHandlers = require('../tools/knowledges');
const ContractHandlers = require('../tools/contracts');

function createRegistry() {
  const registry = new HandlerRegistry();
  registry.register(TicketHandlers);
  registry.register(ClientHandlers);
  registry.register(UserHandlers);
  registry.register(StageHandlers);
  registry.register(CatalogItemHandlers);
  registry.register(InternalCommunicationsHandlers);
  registry.register(AppointmentHandlers);
  registry.register(ChatHandlers);
  registry.register(DeskHandlers);
  registry.register(DepartmentHandlers);
  registry.register(EntityHandlers);
  registry.register(RequestorHandlers);
  registry.register(KnowledgeHandlers);
  registry.register(ContractHandlers);

  // Lê verbosidade do env (SDK); Lambda sobrescreve via registry.setVerbosity por request.
  // Default 'rich' preserva comportamento atual quando env nao esta definido.
  if (process.env.TIFLUX_MCP_VERBOSITY) {
    registry.setVerbosity(process.env.TIFLUX_MCP_VERBOSITY);
  }

  return registry;
}

module.exports = { HandlerRegistry, createRegistry };

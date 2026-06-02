/**
 * HandlerRegistry - registro central self-describing de tools MCP.
 *
 * Cada handler declara `static TOOLS = { toolName: { schema, method } }`.
 * O registry agrega os schemas para `ListTools` e roteia `CallTool` para
 * `instance[method](args)`. Substitui switch statements, handlerMaps manuais
 * e listas inline de tools nos bootstraps (server-sdk, ServerFactory,
 * Server.js, PresentationBootstrap).
 */

class HandlerRegistry {
  constructor() {
    this.handlers = {};
    this.tools = [];
  }

  /**
   * Registra um handler a partir da classe (instanciada aqui).
   * Extrai `static TOOLS` e agrega schemas + roteamento.
   */
  register(HandlerClass) {
    if (!HandlerClass || !HandlerClass.TOOLS) {
      const name = HandlerClass && HandlerClass.name ? HandlerClass.name : 'handler';
      throw new Error(`Handler ${name} nao declara static TOOLS`);
    }

    const instance = new HandlerClass();

    for (const [toolName, config] of Object.entries(HandlerClass.TOOLS)) {
      if (!config || !config.schema || !config.method) {
        throw new Error(`Tool ${toolName} precisa de { schema, method }`);
      }
      if (this.handlers[toolName]) {
        throw new Error(`Tool ${toolName} ja registrada`);
      }

      this.handlers[toolName] = { instance, method: config.method };
      this.tools.push(config.schema);
    }

    return instance;
  }

  /**
   * Substitui `handler.api` em todas as instancias deduplicadas
   * por um `TiFluxAPI(apiKey)` novo. Usado pelo Lambda (multi-tenancy).
   */
  setApiKey(apiKey) {
    const TiFluxAPI = require('../api/tiflux-api');
    const api = new TiFluxAPI(apiKey);
    const seen = new Set();

    for (const { instance } of Object.values(this.handlers)) {
      if (seen.has(instance)) continue;
      seen.add(instance);
      if (instance && 'api' in instance) {
        instance.api = api;
      }
    }
  }

  getTools() {
    return this.tools;
  }

  async execute(toolName, args) {
    const entry = this.handlers[toolName];
    if (!entry) {
      throw new Error(`Tool desconhecida: ${toolName}`);
    }
    return await entry.instance[entry.method](args);
  }

  listOperations() {
    return Object.keys(this.handlers);
  }
}

module.exports = HandlerRegistry;

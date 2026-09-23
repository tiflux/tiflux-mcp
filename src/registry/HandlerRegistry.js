/**
 * HandlerRegistry - registro central self-describing de tools MCP.
 *
 * Cada handler declara `static TOOLS = { toolName: { schema, method } }`.
 * O registry agrega os schemas para `ListTools` e roteia `CallTool` para
 * `instance[method](args)`. Substitui switch statements, handlerMaps manuais
 * e listas inline de tools nos bootstraps (server-sdk, ServerFactory).
 *
 * `execute` e o unico ponto por onde passam os 2 modos (SDK e Server), entao
 * e aqui que mora a rede global de tamanho de resposta (RESPONSE_HARD_CAP).
 */

const { capResponseText, RESPONSE_HARD_CAP } = require('../tools/_shared/format');

class HandlerRegistry {
  constructor() {
    this.handlers = {};
    this.tools = [];
  }

  /**
   * Define o nivel de verbosidade para todas as instancias de handlers.
   * Espelha o padrao de setApiKey: loop dedupe sobre instancias unicas.
   * Valores aceitos: 'rich' (default, comportamento atual) | 'compact'.
   * Ausencia de setVerbosity = 'rich' nao explicito (retrocompatibilidade +
   * compact automatico nas listagens com mais de 50 itens na pagina).
   */
  setVerbosity(v) {
    const verbosity = (v === 'compact') ? 'compact' : 'rich';
    // Explicita = header x-tiflux-verbosity ou env TIFLUX_MCP_VERBOSITY com valor
    // valido. Valor desconhecido cai em 'rich' e NAO conta como explicito — o
    // compact automatico por volume (itens > AUTO_COMPACT_LIMIT) continua valendo.
    const explicit = v === 'rich' || v === 'compact';
    const seen = new Set();
    for (const { instance } of Object.values(this.handlers)) {
      if (seen.has(instance)) continue;
      seen.add(instance);
      if (instance && 'verbosity' in instance) {
        instance.verbosity = verbosity;
        instance.verbosityExplicit = explicit;
      }
    }
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
    const result = await entry.instance[entry.method](args);
    return capResult(result);
  }

  listOperations() {
    return Object.keys(this.handlers);
  }
}

/**
 * Rede global (F4 da spec 2026-09-22-response-budget-listagens): todo item de
 * texto de `content` acima de RESPONSE_HARD_CAP e cortado no ultimo paragrafo
 * que cabe, com aviso. Itens dentro do teto, itens nao-texto e `isError` seguem
 * intactos. (Hoje toda tool devolve um unico `content[0].text`; cobrir os
 * demais itens e defensivo — achado B3 da revisao do PR #93.)
 */
function capResult(result) {
  const content = result && Array.isArray(result.content) ? result.content : null;
  const oversized = item => item && typeof item.text === 'string' && item.text.length > RESPONSE_HARD_CAP;
  if (!content || !content.some(oversized)) return result;
  return {
    ...result,
    content: content.map(item => (oversized(item) ? { ...item, text: capResponseText(item.text) } : item))
  };
}

module.exports = HandlerRegistry;

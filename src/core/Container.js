/**
 * Dependency Injection Container
 * Gerencia instâncias de serviços e suas dependências
 */

class Container {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
  }

  /**
   * Registra um serviço como singleton
   * @param {string} name - Nome do serviço
   * @param {Function|Object} implementation - Classe ou instância
   * @param {Array} dependencies - Array com nomes das dependências
   */
  registerSingleton(name, implementation, dependencies = []) {
    this.services.set(name, {
      type: 'singleton',
      implementation,
      dependencies,
      instance: null
    });
    return this;
  }

  /**
   * Registra um serviço como transient (nova instância a cada resolve)
   * @param {string} name - Nome do serviço
   * @param {Function} implementation - Classe do serviço
   * @param {Array} dependencies - Array com nomes das dependências
   */
  registerTransient(name, implementation, dependencies = []) {
    this.services.set(name, {
      type: 'transient',
      implementation,
      dependencies,
      instance: null
    });
    return this;
  }

  /**
   * Registra uma factory function
   * @param {string} name - Nome do serviço
   * @param {Function} factory - Factory function
   */
  registerFactory(name, factory) {
    this.factories.set(name, factory);
    return this;
  }

  /**
   * Registra uma instância diretamente
   * @param {string} name - Nome do serviço
   * @param {Object} instance - Instância do objeto
   */
  registerInstance(name, instance) {
    this.singletons.set(name, instance);
    return this;
  }

  /**
   * Resolve um serviço e suas dependências
   * @param {string} name - Nome do serviço
   * @returns {Object} - Instância do serviço
   */
  resolve(name) {
    // Verificar se já existe uma instância singleton
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Verificar se existe uma factory
    if (this.factories.has(name)) {
      const factory = this.factories.get(name);
      return factory(this);
    }

    // Verificar se o serviço está registrado
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not registered`);
    }

    const service = this.services.get(name);

    // Para singletons, retornar instância existente se houver
    if (service.type === 'singleton' && service.instance) {
      return service.instance;
    }

    // Resolver dependências
    const dependencies = service.dependencies.map(dep => this.resolve(dep));

    // Criar instância
    let instance;
    if (typeof service.implementation === 'function') {
      // Verifica se é uma factory function ou constructor
      if (service.isFactory) {
        // É uma factory function
        instance = service.implementation(...dependencies);
      } else {
        // É uma classe/construtor
        instance = new service.implementation(...dependencies);
      }
    } else {
      // É um objeto direto
      instance = service.implementation;
    }

    // Para singletons, armazenar a instância
    if (service.type === 'singleton') {
      service.instance = instance;
      this.singletons.set(name, instance);
    }

    return instance;
  }

  /**
   * Verifica se um serviço está registrado
   * @param {string} name - Nome do serviço
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name) ||
           this.singletons.has(name) ||
           this.factories.has(name);
  }

  /**
   * Lista todos os serviços registrados
   * @returns {Array} - Array com nomes dos serviços
   */
  list() {
    const services = Array.from(this.services.keys());
    const singletons = Array.from(this.singletons.keys());
    const factories = Array.from(this.factories.keys());

    return [...new Set([...services, ...singletons, ...factories])];
  }

  /**
   * Limpa o container (útil para testes)
   */
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
  }

  /**
   * Cria um container filho com escopo específico
   * @returns {Container} - Novo container filho
   */
  createScope() {
    const childContainer = new Container();

    // Copiar registros do container pai
    for (const [name, service] of this.services) {
      childContainer.services.set(name, { ...service });
    }

    for (const [name, instance] of this.singletons) {
      childContainer.singletons.set(name, instance);
    }

    for (const [name, factory] of this.factories) {
      childContainer.factories.set(name, factory);
    }

    return childContainer;
  }

  /**
   * Método para debug - mostra estado do container
   * @returns {Object} - Estado atual do container
   */
  debug() {
    return {
      services: Object.fromEntries(
        Array.from(this.services.entries()).map(([name, service]) => [
          name,
          {
            type: service.type,
            dependencies: service.dependencies,
            hasInstance: !!service.instance
          }
        ])
      ),
      singletons: Array.from(this.singletons.keys()),
      factories: Array.from(this.factories.keys())
    };
  }
}

module.exports = Container;
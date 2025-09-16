/**
 * ClientHandler - Handler limpo para operações de cliente
 *
 * Responsabilidades:
 * - Receber requests MCP e validar parâmetros básicos
 * - Delegar lógica de negócio para ClientService
 * - Aplicar formatação de resposta via middleware
 * - Error handling padronizado
 * - Logging de requests/responses
 */

class ClientHandler {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.clientService = container.resolve('clientService');
    this.domainValidator = container.resolve('domainValidator');
    this.responseFormatter = null; // Lazy loading
  }

  /**
   * Handler para buscar clientes por nome
   */
  async handleSearchClient(args) {
    const timer = this.logger.startTimer('handle_search_client');

    try {
      this.logger.info('Handling search client request', {
        hasClientName: !!args.client_name,
        clientNameLength: args.client_name?.length || 0
      });

      // Validação básica de parâmetros
      if (!args.client_name) {
        throw new ValidationError('client_name é obrigatório');
      }

      // Validação usando domain validator
      await this.domainValidator.validateClientSearch(args.client_name);

      // Delega para o domain service
      const result = await this.clientService.searchClientsByName(args.client_name);

      timer();
      return this._formatSearchResults(result);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle search client', {
        clientName: args.client_name?.substring(0, 50),
        error: error.message
      });

      return this._formatErrorResponse(error, 'search_client');
    }
  }

  /**
   * Handler para buscar cliente por ID
   */
  async handleGetClient(args) {
    const timer = this.logger.startTimer('handle_get_client');

    try {
      this.logger.info('Handling get client request', {
        clientId: args.client_id
      });

      // Validação básica de parâmetros
      if (!args.client_id) {
        throw new ValidationError('client_id é obrigatório');
      }

      const clientId = parseInt(args.client_id, 10);
      if (isNaN(clientId) || clientId <= 0) {
        throw new ValidationError('client_id deve ser um número válido maior que zero');
      }

      // Delega para o domain service
      const result = await this.clientService.getClientById(clientId);

      timer();
      return this._formatClientResult(result);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle get client', {
        clientId: args.client_id,
        error: error.message
      });

      return this._formatErrorResponse(error, 'get_client');
    }
  }

  /**
   * Handler para resolver client_name para client_id
   */
  async handleResolveClientName(args) {
    const timer = this.logger.startTimer('handle_resolve_client_name');

    try {
      this.logger.info('Handling resolve client name request', {
        hasClientName: !!args.client_name,
        clientNameLength: args.client_name?.length || 0
      });

      // Validação básica de parâmetros
      if (!args.client_name) {
        throw new ValidationError('client_name é obrigatório');
      }

      // Validação usando domain validator
      await this.domainValidator.validateClientSearch(args.client_name);

      // Delega para o domain service
      const clientId = await this.clientService.resolveClientNameToId(args.client_name);

      timer();
      return this._formatResolveResult(clientId, args.client_name);

    } catch (error) {
      timer();
      this.logger.error('Failed to handle resolve client name', {
        clientName: args.client_name?.substring(0, 50),
        error: error.message
      });

      return this._formatErrorResponse(error, 'resolve_client_name');
    }
  }

  /**
   * Formata resultado da busca de clientes
   */
  _formatSearchResults(clients) {
    if (!clients || clients.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '🔍 **Nenhum cliente encontrado**\n\n' +
                  'Não foram encontrados clientes que correspondam aos critérios de busca.\n\n' +
                  '*Verifique a grafia do nome e tente novamente.*'
          }
        ]
      };
    }

    let content = `🏢 **Encontrados ${clients.length} cliente(s)**\n\n`;

    clients.forEach((client, index) => {
      content += `**${index + 1}. ${client.name || 'Nome não informado'}** (ID: ${client.id})\n`;

      if (client.email) {
        content += `   📧 Email: ${client.email}\n`;
      }

      if (client.phone) {
        content += `   📱 Telefone: ${client.phone}\n`;
      }

      if (client.document) {
        content += `   📄 Documento: ${client.document}\n`;
      }

      if (client.company_name) {
        content += `   🏢 Empresa: ${client.company_name}\n`;
      }

      // Status do cliente
      const status = client.active ? '✅ Ativo' : '❌ Inativo';
      content += `   📊 Status: ${status}\n`;

      content += '\n';
    });

    content += `*Total encontrado: ${clients.length} cliente(s)*`;

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  /**
   * Formata resultado de cliente individual
   */
  _formatClientResult(client) {
    if (!client) {
      return {
        content: [
          {
            type: 'text',
            text: '🔍 **Cliente não encontrado**\n\n' +
                  'O cliente solicitado não foi encontrado ou não está acessível.\n\n' +
                  '*Verifique o ID do cliente e tente novamente.*'
          }
        ]
      };
    }

    let content = `🏢 **Detalhes do Cliente**\n\n`;
    content += `**Nome:** ${client.name || 'Não informado'}\n`;
    content += `**ID:** ${client.id}\n\n`;

    // Dados de contato
    if (client.email || client.phone) {
      content += `📞 **Contato**\n`;
      if (client.email) {
        content += `• Email: ${client.email}\n`;
      }
      if (client.phone) {
        content += `• Telefone: ${client.phone}\n`;
      }
      content += '\n';
    }

    // Documentos
    if (client.document || client.company_document) {
      content += `📄 **Documentos**\n`;
      if (client.document) {
        content += `• Documento: ${client.document}\n`;
      }
      if (client.company_document) {
        content += `• CNPJ: ${client.company_document}\n`;
      }
      content += '\n';
    }

    // Dados empresariais
    if (client.company_name || client.business_activity) {
      content += `🏢 **Dados Empresariais**\n`;
      if (client.company_name) {
        content += `• Razão Social: ${client.company_name}\n`;
      }
      if (client.business_activity) {
        content += `• Atividade: ${client.business_activity}\n`;
      }
      content += '\n';
    }

    // Endereço
    if (client.address_full) {
      content += `📍 **Endereço**\n`;
      content += `${client.address_full}\n\n`;
    }

    // Status e metadados
    content += `📊 **Status**\n`;
    content += `• Status: ${client.active ? '✅ Ativo' : '❌ Inativo'}\n`;
    content += `• Tipo: ${client.client_type || 'Não especificado'}\n`;

    if (client.created_at) {
      content += `• Cadastrado em: ${new Date(client.created_at).toLocaleDateString('pt-BR')}\n`;
    }

    // URLs úteis
    if (client.client_url) {
      content += `\n🔗 **Links Úteis**\n`;
      content += `• [Ver Cliente no TiFlux](${client.client_url})\n`;
      if (client.portal_url) {
        content += `• [Portal do Cliente](${client.portal_url})\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  /**
   * Formata resultado da resolução de nome
   */
  _formatResolveResult(clientId, clientName) {
    if (!clientId) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Cliente "${clientName}" não encontrado**\n\n` +
                  'Não foi possível encontrar um cliente com este nome.\n\n' +
                  '*Possíveis soluções:*\n' +
                  '• Verifique a grafia do nome\n' +
                  '• Use apenas parte do nome\n' +
                  '• Tente buscar por outros critérios (email, documento)\n\n' +
                  '*Use o comando search_client para ver clientes disponíveis.*'
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Cliente resolvido com sucesso**\n\n` +
                `**Nome:** "${clientName}"\n` +
                `**ID:** ${clientId}\n\n` +
                `*Este ID pode ser usado para criar tickets ou outras operações que requerem client_id.*`
        }
      ]
    };
  }

  /**
   * Formata resposta de erro padronizada
   */
  _formatErrorResponse(error, operation) {
    // Tipos de erro conhecidos
    const errorMap = {
      ValidationError: '❌',
      NotFoundError: '🔍',
      APIError: '🔌',
      TimeoutError: '⏱️',
      NetworkError: '🌐'
    };

    const icon = errorMap[error.constructor.name] || '❌';
    const operationText = {
      search_client: 'buscar clientes',
      get_client: 'buscar cliente',
      resolve_client_name: 'resolver nome de cliente'
    };

    let errorMessage = error.message;

    // Adiciona contexto específico para alguns erros
    if (error.constructor.name === 'ValidationError') {
      errorMessage = `Dados inválidos: ${error.message}`;
    } else if (error.constructor.name === 'NotFoundError') {
      errorMessage = `Cliente não encontrado: ${error.message}`;
    } else if (error.constructor.name === 'APIError') {
      errorMessage = `Erro na API: ${error.message}`;
      if (error.statusCode) {
        errorMessage += ` (HTTP ${error.statusCode})`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `**${icon} Erro ao ${operationText[operation] || 'processar solicitação'}**\n\n` +
                `**Erro:** ${errorMessage}\n\n` +
                `*Verifique os parâmetros fornecidos e tente novamente.*`
        }
      ]
    };
  }

  /**
   * Lazy loading do ResponseFormatter
   */
  _getResponseFormatter() {
    if (!this.responseFormatter) {
      this.responseFormatter = this.container.resolve('responseFormatter');
    }
    return this.responseFormatter;
  }

  /**
   * Estatísticas do handler
   */
  getStats() {
    return {
      operations: ['search_client', 'get_client', 'resolve_client_name'],
      features: {
        domain_service_integration: true,
        validation_support: true,
        error_formatting: true,
        request_logging: true,
        performance_timing: true,
        result_formatting: true
      },
      dependencies: {
        clientService: !!this.clientService,
        domainValidator: !!this.domainValidator,
        logger: !!this.logger
      }
    };
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = ClientHandler;
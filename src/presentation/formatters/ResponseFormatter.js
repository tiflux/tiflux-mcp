/**
 * ResponseFormatter - Formatador de respostas MCP consistente
 *
 * Responsabilidades:
 * - Padronizar formato de todas as respostas
 * - Aplicar temas e branding consistente
 * - Adicionar metadados úteis
 * - Suporte a diferentes tipos de conteúdo
 * - Formatação específica por operação
 * - Internacionalização básica
 */

class ResponseFormatter {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');

    // Configurações de formatação
    this.theme = this.config.get('formatting.theme', 'default');
    this.locale = this.config.get('formatting.locale', 'pt-BR');
    this.includeMetadata = this.config.get('formatting.includeMetadata', true);
    this.includeTimestamps = this.config.get('formatting.includeTimestamps', true);
  }

  /**
   * Formata resposta de sucesso
   */
  formatSuccess(data, operation, context = {}) {
    this.logger.debug('Formatting success response', {
      operation,
      hasData: !!data,
      dataType: typeof data
    });

    const response = {
      content: []
    };

    // Adiciona conteúdo principal
    if (data && data.content) {
      // Se data já tem formato MCP, usa diretamente
      response.content = [...data.content];
    } else {
      // Converte dados para formato MCP
      response.content = this._convertDataToContent(data, operation);
    }

    // Adiciona metadados se habilitado
    if (this.includeMetadata && context.metadata) {
      this._addMetadata(response, context.metadata, operation);
    }

    // Adiciona timestamp se habilitado
    if (this.includeTimestamps) {
      this._addTimestamp(response, 'success');
    }

    // Aplica tema
    this._applyTheme(response, 'success', operation);

    return response;
  }

  /**
   * Formata resposta de erro
   */
  formatError(error, operation, context = {}) {
    this.logger.debug('Formatting error response', {
      operation,
      errorType: error.constructor.name,
      hasMessage: !!error.message
    });

    const response = {
      content: []
    };

    // Determina ícone e tipo de erro
    const errorInfo = this._getErrorInfo(error);

    // Conteúdo principal do erro
    const errorContent = {
      type: 'text',
      text: this._buildErrorText(error, errorInfo, operation)
    };

    response.content.push(errorContent);

    // Adiciona contexto adicional se disponível
    if (context.additionalInfo) {
      response.content.push({
        type: 'text',
        text: '\n' + context.additionalInfo
      });
    }

    // Adiciona metadados se habilitado
    if (this.includeMetadata && context.metadata) {
      this._addMetadata(response, context.metadata, operation);
    }

    // Adiciona timestamp
    if (this.includeTimestamps) {
      this._addTimestamp(response, 'error');
    }

    // Aplica tema
    this._applyTheme(response, 'error', operation);

    return response;
  }

  /**
   * Formata lista de dados
   */
  formatList(items, operation, context = {}) {
    const { pagination, title, emptyMessage } = context;

    this.logger.debug('Formatting list response', {
      operation,
      itemCount: items ? items.length : 0,
      hasPagination: !!pagination
    });

    const response = {
      content: []
    };

    // Título da lista
    if (title) {
      response.content.push({
        type: 'text',
        text: `📋 **${title}**\n\n`
      });
    }

    // Lista vazia
    if (!items || items.length === 0) {
      response.content.push({
        type: 'text',
        text: emptyMessage || this._getDefaultEmptyMessage(operation)
      });

      return this.formatSuccess(response, operation, context);
    }

    // Informações de paginação
    if (pagination) {
      const paginationText = this._buildPaginationText(pagination);
      response.content.push({
        type: 'text',
        text: paginationText + '\n\n'
      });
    }

    // Itens da lista
    const listContent = this._buildListContent(items, operation, context);
    response.content.push({
      type: 'text',
      text: listContent
    });

    // Rodapé da paginação
    if (pagination && pagination.total_pages > 1) {
      const paginationFooter = this._buildPaginationFooter(pagination);
      response.content.push({
        type: 'text',
        text: '\n---\n' + paginationFooter
      });
    }

    return this.formatSuccess(response, operation, context);
  }

  /**
   * Formata detalhes de um item individual
   */
  formatDetails(item, operation, context = {}) {
    const { title, sections } = context;

    this.logger.debug('Formatting details response', {
      operation,
      hasItem: !!item,
      hasSections: !!sections
    });

    const response = {
      content: []
    };

    // Título
    if (title) {
      response.content.push({
        type: 'text',
        text: `📄 **${title}**\n\n`
      });
    }

    // Item não encontrado
    if (!item) {
      response.content.push({
        type: 'text',
        text: this._getNotFoundMessage(operation)
      });

      return this.formatSuccess(response, operation, context);
    }

    // Conteúdo detalhado
    const detailsContent = this._buildDetailsContent(item, operation, sections);
    response.content.push({
      type: 'text',
      text: detailsContent
    });

    return this.formatSuccess(response, operation, context);
  }

  /**
   * Converte dados gerais para conteúdo MCP
   */
  _convertDataToContent(data, operation) {
    if (!data) {
      return [{
        type: 'text',
        text: this._getDefaultEmptyMessage(operation)
      }];
    }

    if (typeof data === 'string') {
      return [{
        type: 'text',
        text: data
      }];
    }

    if (typeof data === 'object') {
      // Se é um objeto simples, formata como texto
      return [{
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }];
    }

    return [{
      type: 'text',
      text: String(data)
    }];
  }

  /**
   * Constrói conteúdo de lista
   */
  _buildListContent(items, operation, context) {
    const { itemFormatter, showNumbers = true } = context;

    let content = '';

    items.forEach((item, index) => {
      const number = showNumbers ? `${index + 1}. ` : '• ';

      if (typeof itemFormatter === 'function') {
        content += number + itemFormatter(item, index) + '\n\n';
      } else {
        content += number + this._getDefaultItemFormat(item, operation) + '\n\n';
      }
    });

    return content.trim();
  }

  /**
   * Constrói conteúdo de detalhes
   */
  _buildDetailsContent(item, operation, sections) {
    if (sections && typeof sections === 'function') {
      return sections(item);
    }

    // Formatação padrão baseada na operação
    switch (operation) {
      case 'get_ticket':
        return this._formatTicketDetails(item);
      case 'get_client':
        return this._formatClientDetails(item);
      case 'get_internal_communication':
        return this._formatCommunicationDetails(item);
      default:
        return this._formatGenericDetails(item);
    }
  }

  /**
   * Formatação específica para detalhes de ticket
   */
  _formatTicketDetails(ticket) {
    let content = `**ID:** ${ticket.id}\n`;
    content += `**Título:** ${ticket.title || 'Não informado'}\n`;

    if (ticket.description) {
      content += `**Descrição:** ${ticket.description}\n`;
    }

    if (ticket.status) {
      content += `**Status:** ${ticket.status.name || ticket.status}\n`;
    }

    if (ticket.client) {
      content += `**Cliente:** ${ticket.client.name || ticket.client.id}\n`;
    }

    if (ticket.responsible) {
      content += `**Responsável:** ${ticket.responsible.name || ticket.responsible.id}\n`;
    }

    if (ticket.created_at) {
      const date = new Date(ticket.created_at);
      content += `**Criado em:** ${date.toLocaleString(this.locale)}\n`;
    }

    return content;
  }

  /**
   * Formatação específica para detalhes de cliente
   */
  _formatClientDetails(client) {
    let content = `**ID:** ${client.id}\n`;
    content += `**Nome:** ${client.name || 'Não informado'}\n`;

    if (client.email) {
      content += `**Email:** ${client.email}\n`;
    }

    if (client.phone) {
      content += `**Telefone:** ${client.phone}\n`;
    }

    if (client.document) {
      content += `**Documento:** ${client.document}\n`;
    }

    content += `**Status:** ${client.active ? '✅ Ativo' : '❌ Inativo'}\n`;

    return content;
  }

  /**
   * Formatação específica para detalhes de comunicação
   */
  _formatCommunicationDetails(communication) {
    let content = `**ID:** ${communication.id}\n`;

    if (communication.author) {
      content += `**Autor:** ${communication.author.name || communication.author.id}\n`;
    }

    if (communication.created_at) {
      const date = new Date(communication.created_at);
      content += `**Data:** ${date.toLocaleString(this.locale)}\n`;
    }

    content += '\n**Conteúdo:**\n';
    content += communication.text || 'Nenhum conteúdo';

    if (communication.attachments && communication.attachments.length > 0) {
      content += `\n\n**Anexos (${communication.attachments.length}):**\n`;
      communication.attachments.forEach((att, index) => {
        content += `${index + 1}. ${att.filename} (${att.size_formatted || 'tamanho desconhecido'})\n`;
      });
    }

    return content;
  }

  /**
   * Formatação genérica para qualquer objeto
   */
  _formatGenericDetails(item) {
    let content = '';

    for (const [key, value] of Object.entries(item)) {
      if (value !== null && value !== undefined) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        content += `**${label}:** ${this._formatValue(value)}\n`;
      }
    }

    return content;
  }

  /**
   * Formata valor individual
   */
  _formatValue(value) {
    if (value === null || value === undefined) {
      return 'Não informado';
    }

    if (typeof value === 'boolean') {
      return value ? '✅ Sim' : '❌ Não';
    }

    if (value instanceof Date) {
      return value.toLocaleString(this.locale);
    }

    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return new Date(value).toLocaleString(this.locale);
    }

    if (typeof value === 'object') {
      if (value.name) return value.name;
      if (value.id) return `ID: ${value.id}`;
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Constrói texto de erro formatado
   */
  _buildErrorText(error, errorInfo, operation) {
    const { icon, category } = errorInfo;
    const operationText = this._getOperationText(operation);

    let text = `**${icon} Erro ao ${operationText}**\n\n`;
    text += `**Tipo:** ${category}\n`;
    text += `**Erro:** ${error.message}\n\n`;

    // Adiciona dicas específicas do tipo de erro
    const tips = this._getErrorTips(error, operation);
    if (tips) {
      text += tips;
    }

    return text;
  }

  /**
   * Obtém informações sobre o erro
   */
  _getErrorInfo(error) {
    const errorMap = {
      ValidationError: { icon: '❌', category: 'Validação' },
      NotFoundError: { icon: '🔍', category: 'Não encontrado' },
      APIError: { icon: '🔌', category: 'API' },
      TimeoutError: { icon: '⏱️', category: 'Timeout' },
      NetworkError: { icon: '🌐', category: 'Rede' },
      RateLimitError: { icon: '🚦', category: 'Rate Limit' },
      FileUploadError: { icon: '📎', category: 'Upload' }
    };

    return errorMap[error.constructor.name] || { icon: '❌', category: 'Erro desconhecido' };
  }

  /**
   * Obtém dicas específicas por tipo de erro
   */
  _getErrorTips(error, operation) {
    const errorType = error.constructor.name;

    if (errorType === 'ValidationError') {
      return '*Verifique se todos os parâmetros obrigatórios foram fornecidos corretamente.*';
    }

    if (errorType === 'NotFoundError') {
      return '*Verifique se o ID ou nome fornecido está correto e tente novamente.*';
    }

    if (errorType === 'RateLimitError') {
      return '*Aguarde um momento antes de fazer uma nova solicitação.*';
    }

    if (errorType === 'FileUploadError') {
      return '*Verifique se os arquivos não excedem 25MB cada e se não são executáveis.*';
    }

    return '*Tente novamente ou contate o suporte se o problema persistir.*';
  }

  /**
   * Adiciona metadados à resposta
   */
  _addMetadata(response, metadata, operation) {
    if (!metadata) return;

    const metadataText = `\n---\n**Metadados:**\n`;
    let details = '';

    if (metadata.performance) {
      details += `⏱️ Tempo: ${metadata.performance.total_time_ms}ms\n`;
    }

    if (metadata.request_id) {
      details += `🔖 Request ID: ${metadata.request_id}\n`;
    }

    if (details) {
      response.content.push({
        type: 'text',
        text: metadataText + details
      });
    }
  }

  /**
   * Adiciona timestamp à resposta
   */
  _addTimestamp(response, type) {
    const now = new Date();
    const timestamp = now.toLocaleString(this.locale);
    const icon = type === 'error' ? '❌' : '✅';

    response.content.push({
      type: 'text',
      text: `\n*${icon} ${timestamp}*`
    });
  }

  /**
   * Aplica tema à resposta
   */
  _applyTheme(response, type, operation) {
    // Implementação básica de temas
    // Em uma versão mais avançada, poderia modificar cores, estilos, etc.

    if (this.theme === 'compact') {
      // Remove espaços extras para tema compacto
      response.content.forEach(content => {
        if (content.type === 'text') {
          content.text = content.text.replace(/\n{3,}/g, '\n\n');
        }
      });
    }
  }

  /**
   * Constrói texto de paginação
   */
  _buildPaginationText(pagination) {
    return `📊 **Resultado:** ${pagination.total} item(ns) • Página ${pagination.current_page} de ${pagination.total_pages}`;
  }

  /**
   * Constrói rodapé de paginação
   */
  _buildPaginationFooter(pagination) {
    let footer = `📄 **Paginação:** Página ${pagination.current_page} de ${pagination.total_pages}`;

    if (pagination.current_page < pagination.total_pages) {
      footer += `\n*Use offset=${pagination.current_page + 1} para ver a próxima página.*`;
    }

    if (pagination.current_page > 1) {
      footer += `\n*Use offset=${pagination.current_page - 1} para ver a página anterior.*`;
    }

    return footer;
  }

  /**
   * Obtém mensagem padrão para listas vazias
   */
  _getDefaultEmptyMessage(operation) {
    const messages = {
      list_tickets: '📭 Nenhum ticket encontrado com os filtros aplicados.',
      search_client: '🔍 Nenhum cliente encontrado com este nome.',
      list_internal_communications: '💬 Nenhuma comunicação interna encontrada.'
    };

    return messages[operation] || '📭 Nenhum resultado encontrado.';
  }

  /**
   * Obtém mensagem padrão para item não encontrado
   */
  _getNotFoundMessage(operation) {
    const messages = {
      get_ticket: '🔍 Ticket não encontrado.',
      get_client: '🔍 Cliente não encontrado.',
      get_internal_communication: '🔍 Comunicação não encontrada.'
    };

    return messages[operation] || '🔍 Item não encontrado.';
  }

  /**
   * Formatação padrão para itens de lista
   */
  _getDefaultItemFormat(item, operation) {
    if (operation === 'list_tickets') {
      return `**${item.title || 'Sem título'}** (ID: ${item.id}) - ${item.status?.name || 'Status desconhecido'}`;
    }

    if (operation === 'search_client') {
      return `**${item.name || 'Nome não informado'}** (ID: ${item.id}) - ${item.email || 'Email não informado'}`;
    }

    if (item.name) return `**${item.name}** (ID: ${item.id})`;
    if (item.title) return `**${item.title}** (ID: ${item.id})`;

    return `**Item ${item.id}**`;
  }

  /**
   * Obtém texto descritivo da operação
   */
  _getOperationText(operation) {
    const operations = {
      get_ticket: 'buscar ticket',
      create_ticket: 'criar ticket',
      update_ticket: 'atualizar ticket',
      list_tickets: 'listar tickets',
      search_client: 'buscar cliente',
      get_client: 'obter cliente',
      resolve_client_name: 'resolver nome do cliente',
      create_internal_communication: 'criar comunicação interna',
      list_internal_communications: 'listar comunicações internas',
      get_internal_communication: 'buscar comunicação interna'
    };

    return operations[operation] || 'processar solicitação';
  }
}

module.exports = ResponseFormatter;
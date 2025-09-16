/**
 * TicketMapper - Transformação de dados entre API e domínio
 *
 * Responsabilidades:
 * - Converter dados da API TiFlux para formato interno
 * - Converter dados internos para formato da API
 * - Normalizar campos e estruturas
 * - Garantir compatibilidade entre versões
 * - Aplicar transformações específicas
 */

class TicketMapper {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
  }

  /**
   * Mapeia dados da API para formato interno
   */
  mapFromAPI(apiData) {
    if (!apiData) {
      return null;
    }

    try {
      // A API pode retornar o ticket dentro de { ticket: {...} } ou direto
      const ticketData = apiData.ticket || apiData;

      const mapped = {
        // IDs e identificadores
        id: this._extractId(ticketData),
        number: ticketData.number || ticketData.id,

        // Campos básicos
        title: this._extractString(ticketData.title),
        description: this._extractString(ticketData.description),

        // Status e estado
        status: this._mapStatus(ticketData.status),
        priority: this._mapPriority(ticketData.priority),
        stage: this._mapStage(ticketData.stage),

        // Relacionamentos
        client: this._mapClient(ticketData.client),
        desk: this._mapDesk(ticketData.desk),
        assigned_to: this._mapAssignedUser(ticketData.assigned_to || ticketData.responsible),
        responsible: this._mapAssignedUser(ticketData.responsible || ticketData.assigned_to),

        // Solicitante
        requestor: this._mapRequestor(ticketData),

        // Seguidores
        followers: this._mapFollowers(ticketData.followers),

        // Datas
        created_at: this._mapDateTime(ticketData.created_at),
        updated_at: this._mapDateTime(ticketData.updated_at),
        due_date: this._mapDateTime(ticketData.due_date),
        closed_at: this._mapDateTime(ticketData.closed_at),

        // Campos computados
        is_closed: this._isTicketClosed(ticketData),
        is_overdue: this._isTicketOverdue(ticketData),

        // Metadados
        url: this._buildTicketURL(ticketData.id || ticketData.number),
        api_version: 'v2'
      };

      // Remove campos null/undefined
      return this._cleanObject(mapped);

    } catch (error) {
      this.logger.error('Failed to map ticket from API', {
        error: error.message,
        ticketId: apiData.id || apiData.ticket?.id
      });
      throw new Error(`Falha ao mapear dados do ticket: ${error.message}`);
    }
  }

  /**
   * Mapeia dados internos para formato da API (criação)
   */
  mapToAPI(internalData) {
    if (!internalData) {
      return null;
    }

    try {
      const apiData = {
        // Campos obrigatórios
        title: internalData.title,
        description: internalData.description,

        // Cliente
        client_id: this._extractId(internalData.client_id),

        // Campos opcionais com defaults
        desk_id: this._extractId(internalData.desk_id) || this.config.get('defaults.desk_id'),
        priority_id: this._extractId(internalData.priority_id) || this.config.get('defaults.priority_id'),
        services_catalogs_item_id: this._extractId(internalData.services_catalogs_item_id) || this.config.get('defaults.catalog_item_id'),

        // Status inicial
        status_id: this._extractId(internalData.status_id) || this.config.get('defaults.status_id'),

        // Responsável (opcional)
        responsible_id: this._extractId(internalData.responsible_id),

        // Dados do solicitante
        requestor_name: this._extractString(internalData.requestor_name),
        requestor_email: this._extractString(internalData.requestor_email),
        requestor_telephone: this._extractString(internalData.requestor_telephone),

        // Seguidores
        followers: this._extractString(internalData.followers)
      };

      // Remove campos null/undefined
      return this._cleanObject(apiData);

    } catch (error) {
      this.logger.error('Failed to map ticket to API', {
        error: error.message,
        title: internalData.title
      });
      throw new Error(`Falha ao preparar dados para API: ${error.message}`);
    }
  }

  /**
   * Mapeia dados de atualização para formato da API
   */
  mapUpdateToAPI(updateData) {
    if (!updateData || Object.keys(updateData).length === 0) {
      return {};
    }

    try {
      const apiData = {};

      // Campos que podem ser atualizados diretamente
      if (updateData.title !== undefined) {
        apiData.title = updateData.title;
      }

      if (updateData.description !== undefined) {
        apiData.description = updateData.description;
      }

      // IDs que podem ser atualizados
      const idFields = [
        'client_id', 'desk_id', 'priority_id', 'status_id',
        'stage_id', 'responsible_id'
      ];

      idFields.forEach(field => {
        if (updateData[field] !== undefined) {
          if (updateData[field] === null) {
            apiData[field] = null;
          } else {
            apiData[field] = this._extractId(updateData[field]);
          }
        }
      });

      // Seguidores
      if (updateData.followers !== undefined) {
        apiData.followers = updateData.followers === null ? null : this._extractString(updateData.followers);
      }

      return this._cleanObject(apiData);

    } catch (error) {
      this.logger.error('Failed to map ticket update to API', {
        error: error.message,
        fields: Object.keys(updateData)
      });
      throw new Error(`Falha ao preparar dados de atualização: ${error.message}`);
    }
  }

  /**
   * Mapeia lista de tickets da API
   */
  mapListFromAPI(apiResponse) {
    try {
      // A API pode retornar diferentes formatos de lista
      let tickets = [];
      let pagination = null;

      if (Array.isArray(apiResponse)) {
        // Array simples de tickets
        tickets = apiResponse;
      } else if (apiResponse.tickets && Array.isArray(apiResponse.tickets)) {
        // Formato { tickets: [...], pagination: {...} }
        tickets = apiResponse.tickets;
        pagination = apiResponse.pagination || apiResponse.meta;
      } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
        // Formato { data: [...], meta: {...} }
        tickets = apiResponse.data;
        pagination = apiResponse.meta || apiResponse.pagination;
      }

      // Mapeia cada ticket
      const mappedTickets = tickets.map(ticket => {
        try {
          return this.mapFromAPI(ticket);
        } catch (error) {
          this.logger.warn('Failed to map individual ticket in list', {
            ticketId: ticket.id,
            error: error.message
          });
          // Retorna ticket com dados básicos em caso de erro
          return {
            id: ticket.id,
            title: ticket.title || 'Erro ao carregar',
            status: { name: 'Erro' },
            client: { name: 'N/A' }
          };
        }
      });

      return {
        tickets: mappedTickets,
        pagination: this._mapPagination(pagination),
        total_count: mappedTickets.length
      };

    } catch (error) {
      this.logger.error('Failed to map ticket list from API', {
        error: error.message
      });
      throw new Error(`Falha ao mapear lista de tickets: ${error.message}`);
    }
  }

  /**
   * Mapeia objeto de status
   */
  _mapStatus(status) {
    if (!status) return null;

    if (typeof status === 'string') {
      return { name: status };
    }

    return {
      id: this._extractId(status.id),
      name: this._extractString(status.name) || 'N/A',
      color: this._extractString(status.color),
      is_closed: !!status.is_closed
    };
  }

  /**
   * Mapeia objeto de prioridade
   */
  _mapPriority(priority) {
    if (!priority) return null;

    if (typeof priority === 'string') {
      return { name: priority };
    }

    return {
      id: this._extractId(priority.id),
      name: this._extractString(priority.name) || 'N/A',
      level: this._extractNumber(priority.level),
      color: this._extractString(priority.color)
    };
  }

  /**
   * Mapeia objeto de estágio
   */
  _mapStage(stage) {
    if (!stage) return null;

    if (typeof stage === 'string') {
      return { name: stage };
    }

    return {
      id: this._extractId(stage.id),
      name: this._extractString(stage.name) || 'N/A',
      order: this._extractNumber(stage.order)
    };
  }

  /**
   * Mapeia objeto de cliente
   */
  _mapClient(client) {
    if (!client) return null;

    if (typeof client === 'string') {
      return { name: client };
    }

    return {
      id: this._extractId(client.id),
      name: this._extractString(client.name) || 'Cliente N/A',
      email: this._extractString(client.email),
      phone: this._extractString(client.phone)
    };
  }

  /**
   * Mapeia objeto de mesa/departamento
   */
  _mapDesk(desk) {
    if (!desk) return null;

    if (typeof desk === 'string') {
      return { name: desk };
    }

    return {
      id: this._extractId(desk.id),
      name: this._extractString(desk.name) || 'Mesa N/A',
      department: this._extractString(desk.department)
    };
  }

  /**
   * Mapeia usuário responsável/atribuído
   */
  _mapAssignedUser(user) {
    if (!user) return null;

    if (typeof user === 'string') {
      return { name: user };
    }

    return {
      id: this._extractId(user.id),
      name: this._extractString(user.name) || 'Usuário N/A',
      email: this._extractString(user.email),
      role: this._extractString(user.role)
    };
  }

  /**
   * Mapeia dados do solicitante
   */
  _mapRequestor(ticketData) {
    const requestor = {
      name: this._extractString(ticketData.requestor_name || ticketData.requester_name),
      email: this._extractString(ticketData.requestor_email || ticketData.requester_email),
      phone: this._extractString(ticketData.requestor_telephone || ticketData.requester_phone)
    };

    // Retorna null se não há dados de solicitante
    if (!requestor.name && !requestor.email && !requestor.phone) {
      return null;
    }

    return requestor;
  }

  /**
   * Mapeia seguidores
   */
  _mapFollowers(followersData) {
    if (!followersData) return [];

    if (typeof followersData === 'string') {
      return followersData.split(',').map(email => email.trim()).filter(email => email);
    }

    if (Array.isArray(followersData)) {
      return followersData.map(follower => {
        if (typeof follower === 'string') return follower.trim();
        return follower.email || follower.name || 'N/A';
      }).filter(email => email);
    }

    return [];
  }

  /**
   * Mapeia paginação
   */
  _mapPagination(paginationData) {
    if (!paginationData) return null;

    return {
      current_page: this._extractNumber(paginationData.current_page || paginationData.page) || 1,
      total_pages: this._extractNumber(paginationData.total_pages || paginationData.pages),
      per_page: this._extractNumber(paginationData.per_page || paginationData.limit) || 20,
      total_count: this._extractNumber(paginationData.total_count || paginationData.total),
      has_more: !!paginationData.has_more || !!paginationData.next_page
    };
  }

  /**
   * Mapeia data/hora
   */
  _mapDateTime(dateTime) {
    if (!dateTime) return null;

    try {
      const date = new Date(dateTime);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Determina se ticket está fechado
   */
  _isTicketClosed(ticketData) {
    // Verifica pelo status
    if (ticketData.status && ticketData.status.is_closed) {
      return true;
    }

    // Verifica pela data de fechamento
    if (ticketData.closed_at) {
      return true;
    }

    // Verifica por nomes de status conhecidos
    const statusName = (ticketData.status?.name || ticketData.status || '').toLowerCase();
    const closedStatuses = ['fechado', 'closed', 'resolvido', 'resolved', 'cancelado', 'cancelled'];

    return closedStatuses.some(status => statusName.includes(status));
  }

  /**
   * Determina se ticket está atrasado
   */
  _isTicketOverdue(ticketData) {
    if (!ticketData.due_date) return false;
    if (this._isTicketClosed(ticketData)) return false;

    try {
      const dueDate = new Date(ticketData.due_date);
      const now = new Date();
      return dueDate < now;
    } catch {
      return false;
    }
  }

  /**
   * Constrói URL do ticket
   */
  _buildTicketURL(ticketId) {
    if (!ticketId) return null;

    const baseUrl = this.config.get('ui.base_url', 'https://app.tiflux.com');
    return `${baseUrl}/tickets/${ticketId}`;
  }

  /**
   * Extrai ID numérico
   */
  _extractId(value) {
    if (value === null || value === undefined) return null;
    const id = parseInt(value);
    return isNaN(id) ? null : id;
  }

  /**
   * Extrai string
   */
  _extractString(value) {
    if (value === null || value === undefined) return null;
    return String(value).trim() || null;
  }

  /**
   * Extrai número
   */
  _extractNumber(value) {
    if (value === null || value === undefined) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Remove campos null/undefined de um objeto
   */
  _cleanObject(obj) {
    const cleaned = {};

    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          const cleanedChild = this._cleanObject(value);
          if (Object.keys(cleanedChild).length > 0) {
            cleaned[key] = cleanedChild;
          }
        } else {
          cleaned[key] = value;
        }
      }
    });

    return cleaned;
  }

  /**
   * Estatísticas do mapper
   */
  getStats() {
    return {
      supported_formats: {
        api_to_internal: true,
        internal_to_api: true,
        list_mapping: true,
        update_mapping: true
      },
      transformations: {
        status_normalization: true,
        date_iso_conversion: true,
        id_extraction: true,
        url_generation: true
      }
    };
  }
}

module.exports = TicketMapper;
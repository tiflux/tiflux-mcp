/**
 * ClientMapper - Transformação de dados entre API e domínio para clientes
 *
 * Responsabilidades:
 * - Converter dados da API TiFlux para formato interno
 * - Normalizar campos e estruturas de cliente
 * - Padronizar dados de contato e documentos
 * - Garantir compatibilidade entre versões
 */

class ClientMapper {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
  }

  /**
   * Mapeia dados de cliente da API para formato interno
   */
  mapFromAPI(apiData) {
    if (!apiData) {
      return null;
    }

    try {
      // A API pode retornar o cliente dentro de { client: {...} } ou direto
      const clientData = apiData.client || apiData;

      const mapped = {
        // Identificadores
        id: this._extractId(clientData.id),
        uuid: this._extractString(clientData.uuid),

        // Dados básicos
        name: this._extractString(clientData.name) || 'Cliente N/A',
        display_name: this._extractString(clientData.display_name || clientData.name),

        // Tipo de cliente (pessoa física/jurídica)
        type: this._mapClientType(clientData.type || clientData.client_type),

        // Status
        active: this._extractBoolean(clientData.active, true), // Default: ativo

        // Documentos
        document: this._extractString(clientData.document || clientData.cpf_cnpj),
        document_type: this._mapDocumentType(clientData.document_type),

        // Dados de contato
        email: this._extractEmail(clientData.email),
        phone: this._extractPhone(clientData.phone || clientData.telephone),
        mobile: this._extractPhone(clientData.mobile || clientData.mobile_phone),

        // Endereço
        address: this._mapAddress(clientData.address || clientData),

        // Dados empresariais (se aplicável)
        company: this._mapCompanyData(clientData),

        // Responsável/contato principal
        contact_person: this._mapContactPerson(clientData.contact || clientData.responsible),

        // Configurações
        settings: this._mapClientSettings(clientData.settings || clientData.preferences),

        // Datas
        created_at: this._mapDateTime(clientData.created_at),
        updated_at: this._mapDateTime(clientData.updated_at),
        last_activity_at: this._mapDateTime(clientData.last_activity_at || clientData.last_login),

        // Metadados
        source: this._extractString(clientData.source),
        notes: this._extractString(clientData.notes || clientData.observations),

        // URLs e referências
        url: this._buildClientURL(clientData.id),
        portal_url: this._buildPortalURL(clientData.id || clientData.uuid)
      };

      // Remove campos null/undefined
      return this._cleanObject(mapped);

    } catch (error) {
      this.logger.error('Failed to map client from API', {
        error: error.message,
        clientId: apiData.id || apiData.client?.id
      });
      throw new Error(`Falha ao mapear dados do cliente: ${error.message}`);
    }
  }

  /**
   * Mapeia resultados de busca da API
   */
  mapSearchResultsFromAPI(apiResponse) {
    try {
      let clients = [];

      // A API pode retornar diferentes formatos de busca
      if (Array.isArray(apiResponse)) {
        clients = apiResponse;
      } else if (apiResponse.clients && Array.isArray(apiResponse.clients)) {
        clients = apiResponse.clients;
      } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
        clients = apiResponse.data;
      } else if (apiResponse.results && Array.isArray(apiResponse.results)) {
        clients = apiResponse.results;
      }

      // Mapeia cada cliente
      const mappedClients = clients.map(client => {
        try {
          return this.mapFromAPI(client);
        } catch (error) {
          this.logger.warn('Failed to map individual client in search results', {
            clientId: client.id,
            error: error.message
          });
          // Retorna dados básicos em caso de erro
          return {
            id: client.id,
            name: client.name || 'Erro ao carregar',
            active: true,
            email: client.email || null,
            phone: client.phone || null
          };
        }
      }).filter(client => client !== null);

      this.logger.debug('Client search results mapped', {
        originalCount: clients.length,
        mappedCount: mappedClients.length
      });

      return mappedClients;

    } catch (error) {
      this.logger.error('Failed to map client search results from API', {
        error: error.message
      });
      throw new Error(`Falha ao mapear resultados de busca: ${error.message}`);
    }
  }

  /**
   * Mapeia lista paginada de clientes
   */
  mapListFromAPI(apiResponse) {
    try {
      const searchResults = this.mapSearchResultsFromAPI(apiResponse);

      // Extrai informações de paginação se disponíveis
      let pagination = null;
      if (apiResponse.pagination) {
        pagination = this._mapPagination(apiResponse.pagination);
      } else if (apiResponse.meta) {
        pagination = this._mapPagination(apiResponse.meta);
      }

      return {
        clients: searchResults,
        pagination,
        total_count: searchResults.length
      };

    } catch (error) {
      this.logger.error('Failed to map client list from API', {
        error: error.message
      });
      throw new Error(`Falha ao mapear lista de clientes: ${error.message}`);
    }
  }

  /**
   * Mapeia tipo de cliente
   */
  _mapClientType(type) {
    if (!type) return null;

    const typeStr = type.toString().toLowerCase();

    const typeMap = {
      'pf': 'pessoa_fisica',
      'pj': 'pessoa_juridica',
      'person': 'pessoa_fisica',
      'company': 'pessoa_juridica',
      'individual': 'pessoa_fisica',
      'business': 'pessoa_juridica'
    };

    return typeMap[typeStr] || typeStr;
  }

  /**
   * Mapeia tipo de documento
   */
  _mapDocumentType(docType) {
    if (!docType) return null;

    const typeStr = docType.toString().toLowerCase();

    const docTypeMap = {
      'cpf': 'cpf',
      'cnpj': 'cnpj',
      'rg': 'rg',
      'passport': 'passaporte',
      'other': 'outro'
    };

    return docTypeMap[typeStr] || typeStr;
  }

  /**
   * Mapeia dados de endereço
   */
  _mapAddress(addressData) {
    if (!addressData) return null;

    // Verifica se há dados de endereço
    const hasAddressFields = ['street', 'address', 'city', 'state', 'zipcode', 'country']
      .some(field => addressData[field]);

    if (!hasAddressFields) return null;

    return {
      street: this._extractString(addressData.street || addressData.address),
      number: this._extractString(addressData.number || addressData.address_number),
      complement: this._extractString(addressData.complement),
      neighborhood: this._extractString(addressData.neighborhood || addressData.district),
      city: this._extractString(addressData.city),
      state: this._extractString(addressData.state || addressData.uf),
      zipcode: this._extractString(addressData.zipcode || addressData.cep),
      country: this._extractString(addressData.country || 'Brasil'),
      full_address: this._buildFullAddress(addressData)
    };
  }

  /**
   * Mapeia dados empresariais
   */
  _mapCompanyData(clientData) {
    // Só mapeia se for pessoa jurídica ou tiver dados empresariais
    const isCompany = this._mapClientType(clientData.type) === 'pessoa_juridica' ||
                     clientData.cnpj || clientData.company_name;

    if (!isCompany) return null;

    return {
      legal_name: this._extractString(clientData.legal_name || clientData.company_name),
      trade_name: this._extractString(clientData.trade_name || clientData.fantasy_name),
      cnpj: this._extractString(clientData.cnpj),
      state_registration: this._extractString(clientData.state_registration || clientData.ie),
      municipal_registration: this._extractString(clientData.municipal_registration || clientData.im),
      activity: this._extractString(clientData.activity || clientData.business_activity)
    };
  }

  /**
   * Mapeia pessoa de contato
   */
  _mapContactPerson(contactData) {
    if (!contactData) return null;

    return {
      name: this._extractString(contactData.name),
      email: this._extractEmail(contactData.email),
      phone: this._extractPhone(contactData.phone),
      position: this._extractString(contactData.position || contactData.role)
    };
  }

  /**
   * Mapeia configurações do cliente
   */
  _mapClientSettings(settingsData) {
    if (!settingsData) return null;

    return {
      notifications_enabled: this._extractBoolean(settingsData.notifications_enabled, true),
      email_notifications: this._extractBoolean(settingsData.email_notifications, true),
      sms_notifications: this._extractBoolean(settingsData.sms_notifications, false),
      portal_access: this._extractBoolean(settingsData.portal_access, true),
      language: this._extractString(settingsData.language || 'pt-BR'),
      timezone: this._extractString(settingsData.timezone || 'America/Sao_Paulo')
    };
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
   * Constrói endereço completo
   */
  _buildFullAddress(addressData) {
    const parts = [];

    if (addressData.street) {
      let streetPart = addressData.street;
      if (addressData.number) streetPart += ', ' + addressData.number;
      if (addressData.complement) streetPart += ', ' + addressData.complement;
      parts.push(streetPart);
    }

    if (addressData.neighborhood) {
      parts.push(addressData.neighborhood);
    }

    if (addressData.city) {
      let cityPart = addressData.city;
      if (addressData.state) cityPart += ' - ' + addressData.state;
      parts.push(cityPart);
    }

    if (addressData.zipcode) {
      parts.push('CEP: ' + addressData.zipcode);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Constrói URL do cliente no sistema
   */
  _buildClientURL(clientId) {
    if (!clientId) return null;

    const baseUrl = this.config.get('ui.base_url', 'https://app.tiflux.com');
    return `${baseUrl}/clients/${clientId}`;
  }

  /**
   * Constrói URL do portal do cliente
   */
  _buildPortalURL(clientId) {
    if (!clientId) return null;

    const portalUrl = this.config.get('portal.base_url', 'https://portal.tiflux.com');
    return `${portalUrl}/client/${clientId}`;
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
    const str = String(value).trim();
    return str === '' ? null : str;
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
   * Extrai boolean com valor padrão
   */
  _extractBoolean(value, defaultValue = false) {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'boolean') return value;
    const str = String(value).toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(str);
  }

  /**
   * Valida e normaliza email
   */
  _extractEmail(email) {
    if (!email) return null;

    const emailStr = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(emailStr) ? emailStr : null;
  }

  /**
   * Normaliza telefone
   */
  _extractPhone(phone) {
    if (!phone) return null;

    let phoneStr = String(phone).trim();

    // Remove caracteres especiais mas mantém + para código do país
    phoneStr = phoneStr.replace(/[^\d\+]/g, '');

    // Valida tamanho mínimo
    if (phoneStr.length < 8) return null;

    return phoneStr;
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
        search_results: true,
        paginated_lists: true
      },
      transformations: {
        document_normalization: true,
        address_parsing: true,
        contact_validation: true,
        type_mapping: true,
        date_iso_conversion: true
      },
      features: {
        full_address_building: true,
        url_generation: true,
        company_data_mapping: true,
        contact_person_mapping: true
      }
    };
  }
}

module.exports = ClientMapper;
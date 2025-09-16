/**
 * CommunicationMapper - Transformação de dados entre API e domínio para comunicações internas
 *
 * Responsabilidades:
 * - Converter dados da API TiFlux para formato interno
 * - Normalizar estruturas de comunicação e anexos
 * - Mapear dados de autor e timestamps
 * - Garantir compatibilidade entre versões
 */

class CommunicationMapper {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
  }

  /**
   * Mapeia dados de comunicação da API para formato interno
   */
  mapFromAPI(apiData) {
    if (!apiData) {
      return null;
    }

    try {
      // A API pode retornar a comunicação dentro de { internal_communication: {...} } ou direto
      const commData = apiData.internal_communication || apiData.communication || apiData;

      const mapped = {
        // Identificadores
        id: this._extractId(commData.id),
        ticket_number: this._extractString(commData.ticket_number || commData.ticket_id),

        // Conteúdo
        text: this._extractString(commData.text || commData.content || commData.message),
        html_text: this._extractString(commData.html_text || commData.html_content),

        // Autor
        author: this._mapAuthor(commData.author || commData.user || commData.created_by),

        // Timestamps
        created_at: this._mapDateTime(commData.created_at),
        updated_at: this._mapDateTime(commData.updated_at),

        // Anexos
        attachments: this._mapAttachments(commData.attachments || commData.files),

        // Visibilidade e tipo
        visibility: this._mapVisibility(commData.visibility || commData.type),
        is_private: this._extractBoolean(commData.is_private || commData.private, true), // Default: privado

        // Status
        status: this._extractString(commData.status),

        // Metadados
        source: this._extractString(commData.source || 'mcp'),
        ip_address: this._extractString(commData.ip_address),
        user_agent: this._extractString(commData.user_agent),

        // URLs
        url: this._buildCommunicationURL(commData.ticket_number || commData.ticket_id, commData.id)
      };

      // Remove campos null/undefined
      return this._cleanObject(mapped);

    } catch (error) {
      this.logger.error('Failed to map communication from API', {
        error: error.message,
        communicationId: apiData.id || apiData.communication?.id
      });
      throw new Error(`Falha ao mapear dados da comunicação: ${error.message}`);
    }
  }

  /**
   * Mapeia lista de comunicações da API
   */
  mapListFromAPI(apiResponse) {
    try {
      let communications = [];
      let pagination = null;

      // A API pode retornar diferentes formatos de lista
      if (Array.isArray(apiResponse)) {
        communications = apiResponse;
      } else if (apiResponse.internal_communications && Array.isArray(apiResponse.internal_communications)) {
        communications = apiResponse.internal_communications;
        pagination = apiResponse.pagination || apiResponse.meta;
      } else if (apiResponse.communications && Array.isArray(apiResponse.communications)) {
        communications = apiResponse.communications;
        pagination = apiResponse.pagination || apiResponse.meta;
      } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
        communications = apiResponse.data;
        pagination = apiResponse.meta || apiResponse.pagination;
      }

      // Mapeia cada comunicação
      const mappedCommunications = communications.map(comm => {
        try {
          return this.mapFromAPI(comm);
        } catch (error) {
          this.logger.warn('Failed to map individual communication in list', {
            communicationId: comm.id,
            error: error.message
          });
          // Retorna comunicação com dados básicos em caso de erro
          return {
            id: comm.id,
            text: comm.text || 'Erro ao carregar conteúdo',
            author: { name: 'Desconhecido' },
            created_at: comm.created_at || new Date().toISOString(),
            attachments: []
          };
        }
      });

      return {
        communications: mappedCommunications,
        pagination: this._mapPagination(pagination),
        total_count: mappedCommunications.length
      };

    } catch (error) {
      this.logger.error('Failed to map communication list from API', {
        error: error.message
      });
      throw new Error(`Falha ao mapear lista de comunicações: ${error.message}`);
    }
  }

  /**
   * Mapeia dados do autor
   */
  _mapAuthor(authorData) {
    if (!authorData) return null;

    if (typeof authorData === 'string') {
      return { name: authorData };
    }

    return {
      id: this._extractId(authorData.id),
      name: this._extractString(authorData.name || authorData.full_name) || 'Autor Desconhecido',
      email: this._extractEmail(authorData.email),
      role: this._extractString(authorData.role || authorData.position),
      department: this._extractString(authorData.department),
      avatar_url: this._extractString(authorData.avatar_url || authorData.photo_url)
    };
  }

  /**
   * Mapeia anexos
   */
  _mapAttachments(attachmentsData) {
    if (!attachmentsData || !Array.isArray(attachmentsData)) {
      return [];
    }

    return attachmentsData.map(attachment => {
      try {
        return {
          id: this._extractId(attachment.id),
          filename: this._extractString(attachment.filename || attachment.name || attachment.original_name),
          original_filename: this._extractString(attachment.original_filename || attachment.original_name),
          size: this._extractNumber(attachment.size || attachment.file_size),
          mime_type: this._extractString(attachment.mime_type || attachment.content_type),
          extension: this._extractFileExtension(attachment.filename || attachment.name),

          // URLs
          url: this._extractString(attachment.url || attachment.download_url),
          preview_url: this._extractString(attachment.preview_url || attachment.thumbnail_url),

          // Metadados
          uploaded_at: this._mapDateTime(attachment.uploaded_at || attachment.created_at),
          uploader: this._mapAuthor(attachment.uploader || attachment.uploaded_by),

          // Informações adicionais
          is_image: this._isImageFile(attachment.filename || attachment.name),
          is_document: this._isDocumentFile(attachment.filename || attachment.name),
          formatted_size: this._formatFileSize(attachment.size || attachment.file_size)
        };
      } catch (error) {
        this.logger.warn('Failed to map individual attachment', {
          attachmentId: attachment.id,
          error: error.message
        });
        return {
          id: attachment.id,
          filename: attachment.filename || 'Arquivo sem nome',
          size: attachment.size || 0,
          url: attachment.url || null,
          formatted_size: this._formatFileSize(attachment.size || 0)
        };
      }
    }).filter(attachment => attachment !== null);
  }

  /**
   * Mapeia visibilidade da comunicação
   */
  _mapVisibility(visibility) {
    if (!visibility) return 'internal';

    const visibilityStr = visibility.toString().toLowerCase();

    const visibilityMap = {
      'internal': 'internal',
      'private': 'internal',
      'public': 'public',
      'external': 'public',
      'client': 'client'
    };

    return visibilityMap[visibilityStr] || 'internal';
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
   * Constrói URL da comunicação
   */
  _buildCommunicationURL(ticketNumber, communicationId) {
    if (!ticketNumber || !communicationId) return null;

    const baseUrl = this.config.get('ui.base_url', 'https://app.tiflux.com');
    return `${baseUrl}/tickets/${ticketNumber}#communication-${communicationId}`;
  }

  /**
   * Extrai extensão do arquivo
   */
  _extractFileExtension(filename) {
    if (!filename) return null;

    const parts = filename.split('.');
    if (parts.length < 2) return null;

    return parts[parts.length - 1].toLowerCase();
  }

  /**
   * Verifica se é arquivo de imagem
   */
  _isImageFile(filename) {
    if (!filename) return false;

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const extension = this._extractFileExtension(filename);

    return extension && imageExtensions.includes(extension);
  }

  /**
   * Verifica se é arquivo de documento
   */
  _isDocumentFile(filename) {
    if (!filename) return false;

    const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'];
    const extension = this._extractFileExtension(filename);

    return extension && documentExtensions.includes(extension);
  }

  /**
   * Formata tamanho de arquivo
   */
  _formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        list_mapping: true,
        attachment_mapping: true,
        author_mapping: true
      },
      transformations: {
        file_type_detection: true,
        size_formatting: true,
        visibility_normalization: true,
        date_iso_conversion: true,
        url_generation: true
      },
      features: {
        attachment_preview_detection: true,
        image_document_classification: true,
        author_details_mapping: true,
        pagination_support: true
      }
    };
  }
}

module.exports = CommunicationMapper;
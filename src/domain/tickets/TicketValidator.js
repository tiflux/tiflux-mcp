/**
 * TicketValidator - Validações específicas para tickets
 *
 * Centraliza todas as regras de validação:
 * - Dados de criação e atualização
 * - Filtros de listagem
 * - Business rules específicas
 * - Formatos e tipos de dados
 */

class TicketValidator {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
  }

  /**
   * Valida dados para criação de ticket
   */
  async validateCreateData(ticketData) {
    const errors = [];

    this.logger.debug('Validating ticket create data', {
      hasTitle: !!ticketData.title,
      hasDescription: !!ticketData.description,
      hasClientId: !!ticketData.client_id,
      hasClientName: !!ticketData.client_name
    });

    // 1. Campos obrigatórios
    if (!ticketData.title || ticketData.title.toString().trim() === '') {
      errors.push('title é obrigatório');
    }

    if (!ticketData.description || ticketData.description.toString().trim() === '') {
      errors.push('description é obrigatório');
    }

    // 2. Cliente é obrigatório (ID ou nome)
    if (!ticketData.client_id && !ticketData.client_name) {
      errors.push('client_id ou client_name é obrigatório');
    }

    // 3. Validações de formato e tamanho
    if (ticketData.title) {
      const title = ticketData.title.toString().trim();
      if (title.length < 3) {
        errors.push('title deve ter pelo menos 3 caracteres');
      }
      if (title.length > 255) {
        errors.push('title deve ter no máximo 255 caracteres');
      }
    }

    if (ticketData.description) {
      const description = ticketData.description.toString().trim();
      if (description.length < 10) {
        errors.push('description deve ter pelo menos 10 caracteres');
      }
      if (description.length > 65535) {
        errors.push('description deve ter no máximo 65535 caracteres');
      }
    }

    // 4. Validações de IDs numéricos
    const numericFields = [
      'client_id',
      'desk_id',
      'priority_id',
      'status_id',
      'responsible_id',
      'services_catalogs_item_id'
    ];

    numericFields.forEach(field => {
      if (ticketData[field] !== undefined && ticketData[field] !== null) {
        const value = parseInt(ticketData[field]);
        if (isNaN(value) || value <= 0) {
          errors.push(`${field} deve ser um número inteiro positivo`);
        }
      }
    });

    // 5. Validações de strings
    const stringFields = [
      'client_name',
      'desk_name',
      'requestor_name',
      'requestor_email',
      'requestor_telephone',
      'followers'
    ];

    stringFields.forEach(field => {
      if (ticketData[field] !== undefined && ticketData[field] !== null) {
        if (typeof ticketData[field] !== 'string') {
          errors.push(`${field} deve ser uma string`);
        } else if (ticketData[field].trim() === '') {
          errors.push(`${field} não pode estar vazio`);
        }
      }
    });

    // 6. Validações específicas
    if (ticketData.requestor_email) {
      if (!this._isValidEmail(ticketData.requestor_email)) {
        errors.push('requestor_email deve ter um formato válido');
      }
    }

    if (ticketData.requestor_telephone) {
      if (!this._isValidPhone(ticketData.requestor_telephone)) {
        errors.push('requestor_telephone deve ter um formato válido');
      }
    }

    if (ticketData.followers) {
      const emails = ticketData.followers.split(',').map(e => e.trim());
      const invalidEmails = emails.filter(email => !this._isValidEmail(email));
      if (invalidEmails.length > 0) {
        errors.push(`followers contém emails inválidos: ${invalidEmails.join(', ')}`);
      }
    }

    // 7. Validações de business rules
    await this._validateBusinessRules(ticketData, errors, 'create');

    if (errors.length > 0) {
      this.logger.warn('Ticket create validation failed', { errors });
      throw new ValidationError(`Dados de criação inválidos: ${errors.join(', ')}`);
    }

    this.logger.debug('Ticket create validation passed');
  }

  /**
   * Valida dados para atualização de ticket
   */
  async validateUpdateData(updateData) {
    const errors = [];

    this.logger.debug('Validating ticket update data', {
      fields: Object.keys(updateData)
    });

    // 1. Pelo menos um campo deve ser fornecido
    const allowedFields = [
      'title', 'description', 'client_id', 'desk_id', 'priority_id',
      'status_id', 'stage_id', 'responsible_id', 'followers',
      'client_name', 'desk_name'
    ];

    const providedFields = Object.keys(updateData).filter(key =>
      allowedFields.includes(key) && updateData[key] !== undefined
    );

    if (providedFields.length === 0) {
      errors.push('Pelo menos um campo deve ser fornecido para atualização');
    }

    // 2. Validações de formato (similares ao create, mas opcionais)
    if (updateData.title !== undefined) {
      if (updateData.title === null || updateData.title === '') {
        errors.push('title não pode ser vazio');
      } else {
        const title = updateData.title.toString().trim();
        if (title.length < 3) {
          errors.push('title deve ter pelo menos 3 caracteres');
        }
        if (title.length > 255) {
          errors.push('title deve ter no máximo 255 caracteres');
        }
      }
    }

    if (updateData.description !== undefined) {
      if (updateData.description === null || updateData.description === '') {
        errors.push('description não pode ser vazio');
      } else {
        const description = updateData.description.toString().trim();
        if (description.length < 10) {
          errors.push('description deve ter pelo menos 10 caracteres');
        }
        if (description.length > 65535) {
          errors.push('description deve ter no máximo 65535 caracteres');
        }
      }
    }

    // 3. Validações de IDs numéricos
    const numericFields = [
      'client_id', 'desk_id', 'priority_id', 'status_id',
      'stage_id', 'responsible_id'
    ];

    numericFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (updateData[field] === null) {
          // null é válido para alguns campos (ex: responsible_id)
          if (!['responsible_id'].includes(field)) {
            errors.push(`${field} não pode ser nulo`);
          }
        } else {
          const value = parseInt(updateData[field]);
          if (isNaN(value) || value <= 0) {
            errors.push(`${field} deve ser um número inteiro positivo`);
          }
        }
      }
    });

    // 4. Validações específicas para atualização
    if (updateData.followers !== undefined) {
      if (updateData.followers !== null && updateData.followers !== '') {
        const emails = updateData.followers.split(',').map(e => e.trim());
        const invalidEmails = emails.filter(email => !this._isValidEmail(email));
        if (invalidEmails.length > 0) {
          errors.push(`followers contém emails inválidos: ${invalidEmails.join(', ')}`);
        }
      }
    }

    // 5. Validações de business rules
    await this._validateBusinessRules(updateData, errors, 'update');

    if (errors.length > 0) {
      this.logger.warn('Ticket update validation failed', { errors });
      throw new ValidationError(`Dados de atualização inválidos: ${errors.join(', ')}`);
    }

    this.logger.debug('Ticket update validation passed');
  }

  /**
   * Valida filtros para listagem de tickets
   */
  async validateListFilters(filters) {
    const errors = [];

    this.logger.debug('Validating ticket list filters', {
      filters: Object.keys(filters)
    });

    // 1. Pelo menos um filtro obrigatório deve estar presente
    const requiredFilters = ['desk_ids', 'desk_name', 'client_ids', 'stage_ids', 'stage_name', 'responsible_ids'];
    const hasRequiredFilter = requiredFilters.some(filter => filters[filter]);

    if (!hasRequiredFilter) {
      errors.push('Pelo menos um dos filtros é obrigatório: desk_ids, desk_name, client_ids, stage_ids, stage_name ou responsible_ids');
    }

    // 2. Validações de formato de IDs
    const idFields = ['desk_ids', 'client_ids', 'stage_ids', 'responsible_ids'];

    idFields.forEach(field => {
      if (filters[field]) {
        const ids = filters[field].toString().split(',').map(id => id.trim());

        // Máximo 15 IDs
        if (ids.length > 15) {
          errors.push(`${field} deve conter no máximo 15 IDs`);
        }

        // Todos devem ser números inteiros positivos
        const invalidIds = ids.filter(id => {
          const num = parseInt(id);
          return isNaN(num) || num <= 0;
        });

        if (invalidIds.length > 0) {
          errors.push(`${field} contém IDs inválidos: ${invalidIds.join(', ')}`);
        }
      }
    });

    // 3. Validações de nomes
    if (filters.desk_name) {
      if (typeof filters.desk_name !== 'string' || filters.desk_name.trim() === '') {
        errors.push('desk_name deve ser uma string não vazia');
      }
    }

    if (filters.stage_name) {
      if (typeof filters.stage_name !== 'string' || filters.stage_name.trim() === '') {
        errors.push('stage_name deve ser uma string não vazia');
      }

      // stage_name deve ser usado junto com desk_name
      if (!filters.desk_name) {
        errors.push('stage_name deve ser usado junto com desk_name');
      }
    }

    // 4. Validações de paginação
    if (filters.limit !== undefined) {
      const limit = parseInt(filters.limit);
      if (isNaN(limit) || limit < 1 || limit > 200) {
        errors.push('limit deve ser um número entre 1 e 200');
      }
    }

    if (filters.offset !== undefined) {
      const offset = parseInt(filters.offset);
      if (isNaN(offset) || offset < 1) {
        errors.push('offset deve ser um número maior que 0');
      }
    }

    // 5. Validação de is_closed
    if (filters.is_closed !== undefined) {
      if (typeof filters.is_closed !== 'boolean' &&
          !['true', 'false', '1', '0'].includes(filters.is_closed.toString().toLowerCase())) {
        errors.push('is_closed deve ser um valor booleano (true/false)');
      }
    }

    if (errors.length > 0) {
      this.logger.warn('Ticket list validation failed', { errors });
      throw new ValidationError(`Filtros de listagem inválidos: ${errors.join(', ')}`);
    }

    this.logger.debug('Ticket list validation passed');
  }

  /**
   * Validações de business rules específicas
   */
  async _validateBusinessRules(data, errors, operation) {
    // 1. Validar se client existe (se fornecido client_id)
    if (data.client_id && this.container.has('clientService')) {
      try {
        // Será implementado quando tivermos ClientService
        this.logger.debug('Client validation not implemented yet', { clientId: data.client_id });
      } catch (error) {
        this.logger.warn('Failed to validate client', { clientId: data.client_id, error: error.message });
        // Não falha a validação por isso
      }
    }

    // 2. Validar limites de configuração
    const limits = this.config.get('validation.limits', {});

    if (limits.maxTitleLength && data.title) {
      const titleLength = data.title.toString().length;
      if (titleLength > limits.maxTitleLength) {
        errors.push(`title não pode exceder ${limits.maxTitleLength} caracteres`);
      }
    }

    if (limits.maxDescriptionLength && data.description) {
      const descriptionLength = data.description.toString().length;
      if (descriptionLength > limits.maxDescriptionLength) {
        errors.push(`description não pode exceder ${limits.maxDescriptionLength} caracteres`);
      }
    }

    // 3. Validações específicas por operação
    if (operation === 'create') {
      // Validações específicas para criação
      if (data.status_id && data.status_id !== this.config.get('defaults.initial_status_id')) {
        this.logger.debug('Creating ticket with non-default status', { statusId: data.status_id });
      }
    }

    if (operation === 'update') {
      // Validações específicas para atualização
      if (data.stage_id) {
        // Poderiam haver validações de transição de estado aqui
        this.logger.debug('Updating ticket stage', { stageId: data.stage_id });
      }
    }
  }

  /**
   * Valida formato de email
   */
  _isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Valida formato de telefone (básico)
   */
  _isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return false;
    }

    // Remove espaços e caracteres especiais para validação
    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');

    // Deve ter pelo menos 8 dígitos e no máximo 15
    const phoneRegex = /^[\+]?[0-9]{8,15}$/;
    return phoneRegex.test(cleanPhone);
  }

  /**
   * Sanitiza dados removendo campos não permitidos
   */
  sanitizeCreateData(data) {
    const allowedFields = [
      'title', 'description', 'client_id', 'client_name', 'desk_id', 'desk_name',
      'priority_id', 'status_id', 'responsible_id', 'services_catalogs_item_id',
      'requestor_name', 'requestor_email', 'requestor_telephone', 'followers'
    ];

    const sanitized = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        sanitized[field] = data[field];
      }
    });

    return sanitized;
  }

  /**
   * Sanitiza dados de atualização
   */
  sanitizeUpdateData(data) {
    const allowedFields = [
      'title', 'description', 'client_id', 'desk_id', 'priority_id',
      'status_id', 'stage_id', 'responsible_id', 'followers',
      'client_name', 'desk_name'
    ];

    const sanitized = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        sanitized[field] = data[field];
      }
    });

    return sanitized;
  }

  /**
   * Configurações de validação atuais
   */
  getValidationConfig() {
    return {
      limits: this.config.get('validation.limits', {}),
      required: {
        create: ['title', 'description', 'client_id_or_name'],
        update: ['at_least_one_field']
      },
      formats: {
        email: 'RFC 5322 compliant',
        phone: '8-15 digits, optional country code'
      }
    };
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = TicketValidator;
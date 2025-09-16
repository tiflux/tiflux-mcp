/**
 * CommunicationValidator - Validações específicas para comunicações internas
 *
 * Centraliza todas as regras de validação:
 * - Dados de criação de comunicação
 * - Validação de arquivos e uploads
 * - Formatos e tipos de dados
 * - Business rules específicas
 */

class CommunicationValidator {
  constructor(container) {
    this.container = container;
    this.logger = container.resolve('logger');
    this.config = container.resolve('config');
  }

  /**
   * Valida dados para criação de comunicação interna
   */
  async validateCreateData(ticketNumber, communicationData) {
    const errors = [];

    this.logger.debug('Validating communication create data', {
      ticketNumber,
      hasText: !!communicationData.text,
      hasFiles: !!(communicationData.files && communicationData.files.length > 0),
      fileCount: communicationData.files?.length || 0
    });

    // 1. Validação do ticket number
    if (!ticketNumber || ticketNumber.toString().trim() === '') {
      errors.push('ticket_number é obrigatório');
    } else {
      const ticketNum = ticketNumber.toString().trim();
      if (!/^[0-9]+$/.test(ticketNum)) {
        errors.push('ticket_number deve ser um número válido');
      }
    }

    // 2. Validação do conteúdo
    if (!communicationData.text || communicationData.text.toString().trim() === '') {
      errors.push('text é obrigatório para criar comunicação interna');
    }

    if (communicationData.text) {
      const text = communicationData.text.toString().trim();

      // Tamanho mínimo
      if (text.length < 3) {
        errors.push('text deve ter pelo menos 3 caracteres');
      }

      // Tamanho máximo
      const maxLength = this.config.get('communications.maxTextLength', 65535);
      if (text.length > maxLength) {
        errors.push(`text deve ter no máximo ${maxLength} caracteres`);
      }

      // Validação de conteúdo perigoso (se habilitado)
      if (this.config.get('communications.validateContent', true)) {
        this._validateTextContent(text, errors);
      }
    }

    // 3. Validação de arquivos
    if (communicationData.files && communicationData.files.length > 0) {
      await this._validateFiles(communicationData.files, errors);
    } else {
      // Se não há texto suficiente e não há arquivos, é inválido
      if (!communicationData.text || communicationData.text.toString().trim().length < 3) {
        errors.push('É necessário fornecer texto significativo ou anexar arquivos');
      }
    }

    // 4. Validações de metadados opcionais
    if (communicationData.visibility) {
      const allowedVisibilities = ['internal', 'private', 'public', 'client'];
      if (!allowedVisibilities.includes(communicationData.visibility)) {
        errors.push(`visibility deve ser um dos valores: ${allowedVisibilities.join(', ')}`);
      }
    }

    // 5. Validações de business rules
    await this._validateBusinessRules(ticketNumber, communicationData, errors);

    if (errors.length > 0) {
      this.logger.warn('Communication create validation failed', {
        ticketNumber,
        errors,
        dataKeys: Object.keys(communicationData)
      });
      throw new ValidationError(`Dados de comunicação inválidos: ${errors.join(', ')}`);
    }

    this.logger.debug('Communication create validation passed');
  }

  /**
   * Valida arquivos para upload
   */
  async _validateFiles(files, errors) {
    if (!Array.isArray(files)) {
      errors.push('files deve ser um array de caminhos de arquivo');
      return;
    }

    const maxFiles = this.config.get('communications.maxFiles', 10);
    const maxFileSize = this.config.get('communications.maxFileSize', 25 * 1024 * 1024); // 25MB
    const allowedExtensions = this.config.get('communications.allowedExtensions', []);
    const blockedExtensions = this.config.get('communications.blockedExtensions', ['exe', 'bat', 'cmd', 'scr', 'com']);

    // Limite de quantidade
    if (files.length > maxFiles) {
      errors.push(`Máximo de ${maxFiles} arquivos permitidos por comunicação`);
    }

    // Validação individual de cada arquivo
    const fs = require('fs');
    const path = require('path');
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fileIndex = i + 1;

      // Verificação básica do caminho
      if (!filePath || typeof filePath !== 'string') {
        errors.push(`Arquivo ${fileIndex}: caminho inválido`);
        continue;
      }

      // Verifica se arquivo existe
      if (!fs.existsSync(filePath)) {
        errors.push(`Arquivo ${fileIndex}: não encontrado - ${filePath}`);
        continue;
      }

      // Informações do arquivo
      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch (error) {
        errors.push(`Arquivo ${fileIndex}: erro ao acessar arquivo - ${error.message}`);
        continue;
      }

      // Verifica se é realmente um arquivo
      if (!stats.isFile()) {
        errors.push(`Arquivo ${fileIndex}: não é um arquivo válido`);
        continue;
      }

      // Tamanho individual do arquivo
      if (stats.size > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        const fileSizeMB = Math.round(stats.size / (1024 * 1024));
        errors.push(`Arquivo ${fileIndex}: tamanho ${fileSizeMB}MB excede limite de ${maxSizeMB}MB`);
        continue;
      }

      // Soma para tamanho total
      totalSize += stats.size;

      // Validação de extensão
      const fileName = path.basename(filePath);
      const fileExt = path.extname(fileName).toLowerCase().substring(1);

      // Extensões bloqueadas
      if (blockedExtensions.includes(fileExt)) {
        errors.push(`Arquivo ${fileIndex}: extensão .${fileExt} não permitida por segurança`);
        continue;
      }

      // Extensões permitidas (se configurado)
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(fileExt)) {
        errors.push(`Arquivo ${fileIndex}: extensão .${fileExt} não permitida. Permitidas: ${allowedExtensions.join(', ')}`);
        continue;
      }

      // Validação de nome de arquivo
      if (fileName.length > 255) {
        errors.push(`Arquivo ${fileIndex}: nome muito longo (máximo 255 caracteres)`);
      }

      // Caracteres perigosos no nome
      const dangerousChars = /[<>:"|?*\x00-\x1F]/;
      if (dangerousChars.test(fileName)) {
        errors.push(`Arquivo ${fileIndex}: nome contém caracteres inválidos`);
      }

      // Validação de conteúdo (básica)
      if (this.config.get('communications.validateFileContent', true)) {
        this._validateFileContent(filePath, fileExt, errors, fileIndex);
      }
    }

    // Tamanho total de todos os arquivos
    const maxTotalSize = this.config.get('communications.maxTotalFileSize', 100 * 1024 * 1024); // 100MB
    if (totalSize > maxTotalSize) {
      const maxTotalSizeMB = Math.round(maxTotalSize / (1024 * 1024));
      const totalSizeMB = Math.round(totalSize / (1024 * 1024));
      errors.push(`Tamanho total dos arquivos ${totalSizeMB}MB excede limite de ${maxTotalSizeMB}MB`);
    }

    this.logger.debug('File validation completed', {
      fileCount: files.length,
      totalSizeMB: Math.round(totalSize / (1024 * 1024)),
      errorCount: errors.length
    });
  }

  /**
   * Valida conteúdo do texto da comunicação
   */
  _validateTextContent(text, errors) {
    // 1. Verifica se não é apenas espaços em branco
    if (text.trim().length === 0) {
      errors.push('text não pode conter apenas espaços em branco');
      return;
    }

    // 2. Verifica conteúdo suspeito (script tags, etc.)
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^>]*>/gi,
      /<object\b[^>]*>/gi,
      /<embed\b[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) {
        errors.push('text contém conteúdo potencialmente perigoso');
        break;
      }
    }

    // 3. Verifica URLs suspeitas
    const suspiciousUrlPattern = /https?:\/\/[^\s]+\.(tk|ml|ga|cf|exe|scr|bat|cmd)/gi;
    if (suspiciousUrlPattern.test(text)) {
      errors.push('text contém URLs com domínios ou extensões suspeitos');
    }

    // 4. Verifica spam/flood
    const repeatedChars = /(.)\1{20,}/g;
    if (repeatedChars.test(text)) {
      errors.push('text contém repetição excessiva de caracteres');
    }

    // 5. Verifica conteúdo mínimo significativo
    const meaningfulContent = text.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '');
    if (meaningfulContent.length < 3) {
      errors.push('text deve conter pelo menos 3 caracteres significativos');
    }
  }

  /**
   * Validação básica de conteúdo de arquivo
   */
  _validateFileContent(filePath, extension, errors, fileIndex) {
    const fs = require('fs');

    try {
      // Lê apenas os primeiros bytes para verificação
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);

      if (bytesRead === 0) {
        errors.push(`Arquivo ${fileIndex}: arquivo vazio`);
        return;
      }

      // Verifica assinaturas de arquivo perigosas
      const dangerousSignatures = [
        Buffer.from([0x4D, 0x5A]), // Executáveis Windows (PE)
        Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // Executáveis Linux (ELF)
      ];

      for (const signature of dangerousSignatures) {
        if (buffer.subarray(0, signature.length).equals(signature)) {
          errors.push(`Arquivo ${fileIndex}: tipo de arquivo executável não permitido`);
          return;
        }
      }

      // Validação específica para alguns tipos de arquivo
      this._validateSpecificFileType(buffer, extension, errors, fileIndex);

    } catch (error) {
      this.logger.warn('Failed to validate file content', {
        filePath,
        error: error.message
      });
      // Não adiciona erro pois a validação de conteúdo é opcional
    }
  }

  /**
   * Validação específica por tipo de arquivo
   */
  _validateSpecificFileType(buffer, extension, errors, fileIndex) {
    // Validação para imagens
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(extension)) {
      const imageSignatures = {
        'jpg': [0xFF, 0xD8, 0xFF],
        'jpeg': [0xFF, 0xD8, 0xFF],
        'png': [0x89, 0x50, 0x4E, 0x47],
        'gif': [0x47, 0x49, 0x46],
        'bmp': [0x42, 0x4D]
      };

      const expectedSignature = imageSignatures[extension];
      if (expectedSignature) {
        const actualSignature = Array.from(buffer.subarray(0, expectedSignature.length));
        if (!this._arraysEqual(actualSignature, expectedSignature)) {
          errors.push(`Arquivo ${fileIndex}: não é um arquivo ${extension.toUpperCase()} válido`);
        }
      }
    }

    // Validação para PDFs
    if (extension === 'pdf') {
      const pdfSignature = Buffer.from('%PDF');
      if (!buffer.subarray(0, 4).equals(pdfSignature)) {
        errors.push(`Arquivo ${fileIndex}: não é um arquivo PDF válido`);
      }
    }
  }

  /**
   * Validações de business rules específicas
   */
  async _validateBusinessRules(ticketNumber, communicationData, errors) {
    // 1. Verificar se ticket existe (se configurado)
    if (this.config.get('communications.validateTicketExists', false)) {
      try {
        const ticketService = this.container.resolve('ticketService');
        await ticketService.getTicket(ticketNumber);
      } catch (error) {
        if (error.constructor.name === 'NotFoundError') {
          errors.push(`Ticket #${ticketNumber} não encontrado`);
        }
        // Outros erros não impedem a criação
        this.logger.warn('Could not validate ticket existence', {
          ticketNumber,
          error: error.message
        });
      }
    }

    // 2. Validações de limite por usuário/tempo (se implementado)
    const rateLimit = this.config.get('communications.rateLimit');
    if (rateLimit && rateLimit.enabled) {
      // Implementar rate limiting se necessário
      this.logger.debug('Rate limiting validation not implemented', {
        ticketNumber
      });
    }

    // 3. Validações de horário de trabalho (se configurado)
    const workingHours = this.config.get('communications.workingHours');
    if (workingHours && workingHours.enforce) {
      const now = new Date();
      const hour = now.getHours();

      if (hour < workingHours.start || hour >= workingHours.end) {
        this.logger.warn('Communication created outside working hours', {
          ticketNumber,
          currentHour: hour,
          workingHours
        });
        // Não adiciona erro, apenas log
      }
    }
  }

  /**
   * Compara arrays de bytes
   */
  _arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Configurações de validação atuais
   */
  getValidationConfig() {
    return {
      text: {
        required: true,
        min_length: 3,
        max_length: this.config.get('communications.maxTextLength', 65535),
        content_validation: this.config.get('communications.validateContent', true)
      },
      files: {
        max_files: this.config.get('communications.maxFiles', 10),
        max_file_size: this.config.get('communications.maxFileSize', 25 * 1024 * 1024),
        max_total_size: this.config.get('communications.maxTotalFileSize', 100 * 1024 * 1024),
        allowed_extensions: this.config.get('communications.allowedExtensions', []),
        blocked_extensions: this.config.get('communications.blockedExtensions', ['exe', 'bat', 'cmd', 'scr', 'com']),
        content_validation: this.config.get('communications.validateFileContent', true)
      },
      business_rules: {
        validate_ticket_exists: this.config.get('communications.validateTicketExists', false),
        rate_limit_enabled: this.config.get('communications.rateLimit.enabled', false),
        working_hours_enforced: this.config.get('communications.workingHours.enforce', false)
      }
    };
  }
}

// Import das classes de erro
const { ValidationError } = require('../../utils/errors');

module.exports = CommunicationValidator;
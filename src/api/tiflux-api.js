/**
 * TiFlux API Client
 * Centraliza todas as chamadas para a API do TiFlux
 */

const https = require('https');
const { URL } = require('url');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

class TiFluxAPI {
  constructor() {
    this.baseUrl = 'https://api.tiflux.com/api/v2';
    this.apiKey = process.env.TIFLUX_API_KEY;
  }

  /**
   * Faz uma requisição HTTP para a API do TiFlux
   */
  async makeRequest(endpoint, method = 'GET', data = null, headers = {}) {
    if (!this.apiKey) {
      return {
        error: 'TIFLUX_API_KEY não configurada',
        status: 'CONFIG_ERROR'
      };
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        
        // Headers padrão
        const defaultHeaders = {
          'accept': 'application/json',
          'authorization': `Bearer ${this.apiKey}`,
          ...headers
        };

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: method,
          headers: defaultHeaders
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                const jsonData = JSON.parse(responseData);
                resolve({ data: jsonData, status: res.statusCode });
              } else if (res.statusCode === 401) {
                resolve({ 
                  error: 'Token de API inválido ou expirado', 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 404) {
                resolve({ 
                  error: `Recurso não encontrado`, 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 422) {
                resolve({ 
                  error: `Erro de validação: ${responseData}`, 
                  status: res.statusCode 
                });
              } else {
                resolve({ 
                  error: `Erro HTTP ${res.statusCode}: ${responseData}`, 
                  status: res.statusCode 
                });
              }
            } catch (parseError) {
              resolve({ 
                error: `Erro ao processar resposta: ${parseError.message}`, 
                status: 'PARSE_ERROR' 
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ 
            error: `Erro de conexão: ${error.message}`, 
            status: 'CONNECTION_ERROR' 
          });
        });

        req.setTimeout(15000, () => {
          req.destroy();
          resolve({ 
            error: 'Timeout na requisição (15s)', 
            status: 'TIMEOUT' 
          });
        });

        // Enviar dados se for POST ou PUT
        if (data && (method === 'POST' || method === 'PUT')) {
          req.write(data);
        }
        
        req.end();
      });
      
    } catch (error) {
      return {
        error: `Erro interno: ${error.message}`,
        status: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Busca um ticket específico pelo ID
   */
  async fetchTicket(ticketId) {
    return await this.makeRequest(`/tickets/${ticketId}`);
  }

  /**
   * Busca clientes por nome
   */
  async searchClients(clientName = '') {
    const nameParam = clientName ? `&name=${encodeURIComponent(clientName)}` : '';
    const endpoint = `/clients?active=true${nameParam}`;
    return await this.makeRequest(endpoint);
  }

  /**
   * Cria um novo ticket
   */
  async createTicket(ticketData) {
    // Preparar dados para form-urlencoded
    const formData = {};
    
    // Adicionar campos obrigatórios
    if (ticketData.title) formData.title = ticketData.title;
    if (ticketData.description) formData.description = ticketData.description;
    if (ticketData.client_id) formData.client_id = ticketData.client_id;
    if (ticketData.desk_id) formData.desk_id = ticketData.desk_id;
    
    // Adicionar campos opcionais se fornecidos
    if (ticketData.priority_id) formData.priority_id = ticketData.priority_id;
    if (ticketData.services_catalogs_item_id) formData.services_catalogs_item_id = ticketData.services_catalogs_item_id;
    if (ticketData.status_id) formData.status_id = ticketData.status_id;
    if (ticketData.requestor_name) formData.requestor_name = ticketData.requestor_name;
    if (ticketData.requestor_email) formData.requestor_email = ticketData.requestor_email;
    if (ticketData.requestor_telephone) formData.requestor_telephone = ticketData.requestor_telephone;
    if (ticketData.responsible_id) formData.responsible_id = ticketData.responsible_id;
    if (ticketData.followers) formData.followers = ticketData.followers;

    const postData = querystring.stringify(formData);
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    };

    return await this.makeRequest('/tickets', 'POST', postData, headers);
  }

  /**
   * Atualiza um ticket existente
   */
  async updateTicket(ticketId, ticketData) {
    // Preparar dados no formato JSON conforme a API espera
    const ticketObject = {};
    
    // Adicionar campos editáveis se fornecidos
    if (ticketData.title !== undefined) ticketObject.title = ticketData.title;
    if (ticketData.description !== undefined) ticketObject.description = ticketData.description;
    if (ticketData.client_id !== undefined) ticketObject.client_id = ticketData.client_id;
    if (ticketData.desk_id !== undefined) ticketObject.desk_id = ticketData.desk_id;
    if (ticketData.stage_id !== undefined) ticketObject.stage_id = ticketData.stage_id;
    if (ticketData.followers !== undefined) ticketObject.followers = ticketData.followers;
    
    // Tratamento especial para responsible_id (pode ser null)
    if (ticketData.responsible_id !== undefined) {
      ticketObject.responsible_id = ticketData.responsible_id;
    }

    const jsonData = JSON.stringify(ticketObject);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData)
    };

    return await this.makeRequest(`/tickets/${ticketId}`, 'PUT', jsonData, headers);
  }

  /**
   * Busca mesas por nome
   */
  async searchDesks(deskName = '') {
    const nameParam = deskName ? `&name=${encodeURIComponent(deskName)}` : '';
    const endpoint = `/desks?active=true${nameParam}`;
    return await this.makeRequest(endpoint);
  }

  /**
   * Busca estágios de uma mesa específica
   */
  async searchStages(deskId) {
    const endpoint = `/desks/${deskId}/stages`;
    return await this.makeRequest(endpoint);
  }

  /**
   * Lista tickets com filtros aplicados
   */
  async listTickets(filters = {}) {
    // Construir parâmetros de query
    const params = new URLSearchParams();

    // Paginação
    const offset = filters.offset || 1;
    const limit = Math.min(filters.limit || 20, 200); // Máximo 200 conforme API
    params.append('offset', offset);
    params.append('limit', limit);

    // Filtro padrão: apenas tickets abertos
    const isClosed = filters.is_closed !== undefined ? filters.is_closed : false;
    params.append('is_closed', isClosed);

    // Filtros de IDs (arrays separados por vírgula)
    if (filters.desk_ids) {
      // Validar e limitar a 15 IDs
      const deskIds = filters.desk_ids.split(',').slice(0, 15).map(id => id.trim()).filter(id => id);
      if (deskIds.length > 0) {
        params.append('desk_ids', deskIds.join(','));
      }
    }

    if (filters.client_ids) {
      const clientIds = filters.client_ids.split(',').slice(0, 15).map(id => id.trim()).filter(id => id);
      if (clientIds.length > 0) {
        params.append('client_ids', clientIds.join(','));
      }
    }

    if (filters.stage_ids) {
      const stageIds = filters.stage_ids.split(',').slice(0, 15).map(id => id.trim()).filter(id => id);
      if (stageIds.length > 0) {
        params.append('stage_ids', stageIds.join(','));
      }
    }

    if (filters.responsible_ids) {
      const responsibleIds = filters.responsible_ids.split(',').slice(0, 15).map(id => id.trim()).filter(id => id);
      if (responsibleIds.length > 0) {
        params.append('responsible_ids', responsibleIds.join(','));
      }
    }

    const endpoint = `/tickets?${params.toString()}`;
    return await this.makeRequest(endpoint);
  }

  /**
   * Cria uma comunicação interna em um ticket usando multipart/form-data
   */
  async createInternalCommunication(ticketNumber, text, files = []) {
    try {
      // Para apenas texto, usar abordagem mais simples
      if (!files || files.length === 0) {
        return await this.createInternalCommunicationTextOnly(ticketNumber, text);
      }
      
      // Para arquivos, usar multipart/form-data completo
      return await this.createInternalCommunicationWithFiles(ticketNumber, text, files);
      
    } catch (error) {
      return {
        error: `Erro ao preparar comunicação interna: ${error.message}`,
        status: 'PREPARE_ERROR'
      };
    }
  }

  /**
   * Versão simplificada para texto apenas
   */
  async createInternalCommunicationTextOnly(ticketNumber, text) {
    const boundary = `----formdata-tiflux-${Date.now()}`;
    let formData = '';
    
    formData += `--${boundary}\r\n`;
    formData += 'Content-Disposition: form-data; name="text"\r\n';
    formData += '\r\n';
    formData += text + '\r\n';
    formData += `--${boundary}--\r\n`;
    
    const formDataBuffer = Buffer.from(formData);
    
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': formDataBuffer.length
    };
    
    return await this.makeRequestBinary(
      `/tickets/${ticketNumber}/internal_communications`, 
      'POST', 
      formDataBuffer, 
      headers
    );
  }

  /**
   * Versão completa com arquivos
   */
  async createInternalCommunicationWithFiles(ticketNumber, text, files) {
    // Validar arquivos
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const filePath = files[i];
      
      if (!fs.existsSync(filePath)) {
        return {
          error: `Arquivo não encontrado: ${filePath}`,
          status: 'FILE_NOT_FOUND'
        };
      }
      
      const fileStats = fs.statSync(filePath);
      if (fileStats.size > 26214400) {
        return {
          error: `Arquivo muito grande (máx 25MB): ${path.basename(filePath)}`,
          status: 'FILE_TOO_LARGE'
        };
      }
    }

    const boundary = `----formdata-tiflux-${Date.now()}`;
    const parts = [];
    
    // Parte do texto
    let textPart = '';
    textPart += `--${boundary}\r\n`;
    textPart += 'Content-Disposition: form-data; name="text"\r\n';
    textPart += '\r\n';
    textPart += text + '\r\n';
    parts.push(Buffer.from(textPart));
    
    // Partes dos arquivos
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const filePath = files[i];
      const fileName = path.basename(filePath);
      const fileContent = fs.readFileSync(filePath);
      
      let filePart = '';
      filePart += `--${boundary}\r\n`;
      filePart += `Content-Disposition: form-data; name="files[]"; filename="${fileName}"\r\n`;
      filePart += 'Content-Type: application/octet-stream\r\n';
      filePart += '\r\n';
      
      parts.push(Buffer.from(filePart));
      parts.push(fileContent);
      parts.push(Buffer.from('\r\n'));
    }
    
    // Finalizar boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    
    // Combinar todas as partes
    const formDataBuffer = Buffer.concat(parts);
    
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': formDataBuffer.length
    };
    
    return await this.makeRequestBinary(
      `/tickets/${ticketNumber}/internal_communications`, 
      'POST', 
      formDataBuffer, 
      headers
    );
  }

  /**
   * Lista comunicações internas de um ticket com paginação
   */
  async listInternalCommunications(ticketNumber, offset = 1, limit = 20) {
    // Validar e limitar parâmetros
    const validOffset = Math.max(1, parseInt(offset) || 1);
    const validLimit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    
    const params = new URLSearchParams();
    params.append('offset', validOffset);
    params.append('limit', validLimit);
    
    const endpoint = `/tickets/${ticketNumber}/internal_communications?${params.toString()}`;
    return await this.makeRequest(endpoint);
  }

  /**
   * Versão especial do makeRequest para dados binários (arquivos)
   */
  async makeRequestBinary(endpoint, method = 'GET', data = null, headers = {}) {
    if (!this.apiKey) {
      return {
        error: 'TIFLUX_API_KEY não configurada',
        status: 'CONFIG_ERROR'
      };
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      return new Promise((resolve) => {
        const parsedUrl = new URL(url);
        
        // Headers padrão
        const defaultHeaders = {
          'accept': 'application/json',
          'authorization': `Bearer ${this.apiKey}`,
          ...headers
        };

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: method,
          headers: defaultHeaders
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                const jsonData = JSON.parse(responseData);
                resolve({ data: jsonData, status: res.statusCode });
              } else if (res.statusCode === 401) {
                resolve({ 
                  error: 'Token de API inválido ou expirado', 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 404) {
                resolve({ 
                  error: `Recurso não encontrado`, 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 415) {
                resolve({ 
                  error: `Tipo de mídia não suportado (verifique arquivos anexados)`, 
                  status: res.statusCode 
                });
              } else if (res.statusCode === 422) {
                resolve({ 
                  error: `Erro de validação: ${responseData}`, 
                  status: res.statusCode 
                });
              } else {
                resolve({ 
                  error: `Erro HTTP ${res.statusCode}: ${responseData}`, 
                  status: res.statusCode 
                });
              }
            } catch (parseError) {
              resolve({ 
                error: `Erro ao processar resposta: ${parseError.message}`, 
                status: 'PARSE_ERROR' 
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ 
            error: `Erro de conexão: ${error.message}`, 
            status: 'CONNECTION_ERROR' 
          });
        });

        req.setTimeout(15000, () => {
          req.destroy();
          resolve({ 
            error: 'Timeout na requisição (15s)', 
            status: 'TIMEOUT' 
          });
        });

        // Enviar dados binários
        if (data && method === 'POST') {
          req.write(data);
        }
        
        req.end();
      });
      
    } catch (error) {
      return {
        error: `Erro interno: ${error.message}`,
        status: 'INTERNAL_ERROR'
      };
    }
  }
}

module.exports = TiFluxAPI;
/**
 * TiFlux API Client
 * Centraliza todas as chamadas para a API do TiFlux
 */

const https = require('https');
const { URL } = require('url');
const querystring = require('querystring');

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

        // Enviar dados se for POST
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
}

module.exports = TiFluxAPI;
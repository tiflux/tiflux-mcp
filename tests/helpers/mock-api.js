/**
 * Mock da classe TiFluxAPI para testes
 * Garante isolamento completo - sem comunicação com APIs externas
 */

const mockResponses = require('../fixtures/mock-responses.json');

class MockTiFluxAPI {
  constructor() {
    this.baseUrl = 'https://api.tiflux.com/api/v2';
    this.apiKey = 'test-api-key';
    this.mockResponses = mockResponses;
  }

  // Mock do método base de requisição
  async makeRequest(endpoint, method = 'GET', data = null, headers = {}) {
    // Simular delay real da API (10-100ms)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 90 + 10));

    // Simular diferentes respostas baseadas no endpoint
    if (endpoint.includes('/tickets/999')) {
      return this.mockResponses.tickets.get_not_found;
    }
    
    if (endpoint.includes('/tickets/') && method === 'GET' && !endpoint.includes('internal_communications')) {
      return this.mockResponses.tickets.get_success;
    }

    if (endpoint === '/tickets' && method === 'POST') {
      return this.mockResponses.tickets.create_success;
    }

    if (endpoint.includes('/tickets?')) {
      return { data: this.mockResponses.tickets.list_success };
    }

    if (endpoint.includes('/clients?')) {
      if (endpoint.includes('name=inexistente')) {
        return this.mockResponses.clients.search_empty;
      }
      return this.mockResponses.clients.search_success;
    }

    // Default: sucesso genérico
    return { data: {}, status: 200 };
  }

  // Mock específico para requisições binárias
  async makeRequestBinary(endpoint, method = 'GET', data = null, headers = {}) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 50)); // Upload mais lento

    if (endpoint.includes('internal_communications') && method === 'POST') {
      // Verificar se tem arquivo baseado no tamanho dos dados
      const hasFiles = data && data.length > 1000;
      return hasFiles ? 
        this.mockResponses.internal_communications.create_success :
        this.mockResponses.internal_communications.create_no_files;
    }

    return { data: {}, status: 201 };
  }

  // Mocks específicos dos métodos da API

  async fetchTicket(ticketId) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 90 + 10)); // Simular delay
    if (ticketId === '999') {
      return this.mockResponses.tickets.get_not_found;
    }
    return this.mockResponses.tickets.get_success;
  }

  async createTicket(ticketData) {
    if (!ticketData.title || !ticketData.description) {
      return {
        error: 'Título e descrição são obrigatórios',
        status: 422
      };
    }
    return this.mockResponses.tickets.create_success;
  }

  async updateTicket(ticketId, ticketData) {
    if (ticketId === '999') {
      return this.mockResponses.tickets.get_not_found;
    }
    return { data: { ...this.mockResponses.tickets.get_success.data, ...ticketData } };
  }

  async listTickets(filters = {}) {
    return { data: this.mockResponses.tickets.list_success };
  }

  async searchClients(clientName = '') {
    if (clientName === 'inexistente') {
      return this.mockResponses.clients.search_empty;
    }
    return this.mockResponses.clients.search_success;
  }

  async searchDesks(deskName = '') {
    return {
      data: [
        { id: 1, name: 'cansados', display_name: 'Mesa dos Cansados' }
      ]
    };
  }

  async searchStages(deskId) {
    return {
      data: [
        { id: 1, name: 'to do' },
        { id: 2, name: 'in progress' },
        { id: 3, name: 'done' }
      ]
    };
  }

  async createInternalCommunication(ticketNumber, text, files = []) {
    if (ticketNumber === '999') {
      return this.mockResponses.internal_communications.not_found;
    }

    if (!text) {
      return this.mockResponses.internal_communications.validation_error;
    }

    // Simular erro se muitos arquivos
    if (files.length > 10) {
      return {
        error: 'Máximo 10 arquivos permitidos',
        status: 422
      };
    }

    // Simular erro de arquivo não encontrado
    if (files.some(file => file.includes('inexistente'))) {
      return {
        error: 'Arquivo não encontrado: inexistente.txt',
        status: 'FILE_NOT_FOUND'
      };
    }

    // Simular arquivo muito grande
    if (files.some(file => file.includes('grande'))) {
      return {
        error: 'Arquivo muito grande (máx 25MB): grande.zip',
        status: 'FILE_TOO_LARGE'
      };
    }

    return files.length > 0 ? 
      this.mockResponses.internal_communications.create_success :
      this.mockResponses.internal_communications.create_no_files;
  }

  async listInternalCommunications(ticketNumber, offset = 1, limit = 20) {
    if (ticketNumber === '999') {
      return this.mockResponses.internal_communications.not_found;
    }

    if (offset > 1) {
      // Simular página vazia
      return this.mockResponses.internal_communications.list_empty;
    }

    return this.mockResponses.internal_communications.list_success;
  }
}

// Funções helper para cenários específicos de teste

const createMockApiWithError = (errorType) => {
  const mockApi = new MockTiFluxAPI();
  const errorResponse = mockResponses.errors[errorType] || mockResponses.errors.connection_error;
  
  // Override todos os métodos para retornar erro
  mockApi.makeRequest = async () => errorResponse;
  mockApi.makeRequestBinary = async () => errorResponse;
  mockApi.fetchTicket = async () => errorResponse;
  mockApi.createTicket = async () => errorResponse;
  mockApi.updateTicket = async () => errorResponse;
  mockApi.listTickets = async () => errorResponse;
  mockApi.searchClients = async () => errorResponse;
  mockApi.searchDesks = async () => errorResponse;
  mockApi.searchStages = async () => errorResponse;
  mockApi.createInternalCommunication = async () => errorResponse;
  mockApi.listInternalCommunications = async () => errorResponse;
  
  return mockApi;
};

const createMockApiWithConfig = (config) => {
  const mockApi = new MockTiFluxAPI();
  Object.assign(mockApi, config);
  
  if (!config.apiKey) {
    const configError = mockResponses.errors.config_error;
    mockApi.makeRequest = async () => configError;
    mockApi.makeRequestBinary = async () => configError;
    mockApi.fetchTicket = async () => configError;
    mockApi.createTicket = async () => configError;
    mockApi.updateTicket = async () => configError;
    mockApi.listTickets = async () => configError;
    mockApi.searchClients = async () => configError;
    mockApi.searchDesks = async () => configError;
    mockApi.searchStages = async () => configError;
    mockApi.createInternalCommunication = async () => configError;
    mockApi.listInternalCommunications = async () => configError;
  }
  
  return mockApi;
};

module.exports = {
  MockTiFluxAPI,
  createMockApiWithError,
  createMockApiWithConfig,
  mockResponses
};
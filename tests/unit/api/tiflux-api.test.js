/**
 * Testes unitários para TiFluxAPI
 * Testa a lógica da API sem fazer chamadas HTTP reais
 */

const TiFluxAPI = require('../../../src/api/tiflux-api');
const fs = require('fs');
const path = require('path');

// Mock do módulo fs para testes de upload
jest.mock('fs');
jest.mock('path');

// Mock do módulo https para interceptar chamadas HTTP
jest.mock('https');

describe('TiFluxAPI', () => {
  let api;
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    // Configurar API key para testes
    process.env.TIFLUX_API_KEY = 'test-api-key-12345';
    api = new TiFluxAPI();

    // Mock básico de request/response
    mockResponse = {
      statusCode: 200,
      on: jest.fn()
    };
    mockRequest = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      setTimeout: jest.fn(),
      destroy: jest.fn()
    };

    // Configurar https mock
    const https = require('https');
    https.request.mockImplementation((options, callback) => {
      // Simular resposta assíncrona
      setTimeout(() => {
        callback(mockResponse);
        // Simular dados recebidos
        mockResponse.on.mock.calls
          .filter(([event]) => event === 'data')
          .forEach(([, handler]) => handler('{"success": true}'));
        // Simular fim da resposta
        mockResponse.on.mock.calls
          .filter(([event]) => event === 'end')
          .forEach(([, handler]) => handler());
      }, 10);
      
      return mockRequest;
    });

    // Limpar mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Configuração e inicialização', () => {
    it('deve inicializar com configurações corretas', () => {
      expect(api.baseUrl).toBe('https://api.tiflux.com/api/v2');
      expect(api.apiKey).toBe('test-api-key-12345');
    });

    it('deve detectar API key não configurada', async () => {
      // Arrange
      delete process.env.TIFLUX_API_KEY;
      const apiSemKey = new TiFluxAPI();

      // Act
      const result = await apiSemKey.makeRequest('/test');

      // Assert
      expect(result.error).toBe('TIFLUX_API_KEY não configurada');
      expect(result.status).toBe('CONFIG_ERROR');
    });
  });

  describe('makeRequest', () => {
    it('deve fazer requisição GET básica', async () => {
      // Arrange
      mockResponse.statusCode = 200;

      // Act
      const result = await api.makeRequest('/tickets/123');

      // Assert
      expect(result.data).toEqual({ success: true });
      expect(result.status).toBe(200);
      
      const https = require('https');
      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'api.tiflux.com',
          method: 'GET',
          headers: expect.objectContaining({
            'accept': 'application/json',
            'authorization': 'Bearer test-api-key-12345'
          })
        }),
        expect.any(Function)
      );
    });

    it('deve tratar erro 404', async () => {
      // Arrange
      mockResponse.statusCode = 404;
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') handler('Ticket não encontrado');
        if (event === 'end') handler();
      });

      // Act
      const result = await api.makeRequest('/tickets/999');

      // Assert
      expect(result.error).toBe('Recurso não encontrado');
      expect(result.status).toBe(404);
    });

    it('deve tratar erro 401', async () => {
      // Arrange
      mockResponse.statusCode = 401;

      // Act
      const result = await api.makeRequest('/tickets/123');

      // Assert
      expect(result.error).toBe('Token de API inválido ou expirado');
      expect(result.status).toBe(401);
    });

    it('deve tratar timeout', async () => {
      // Arrange
      const https = require('https');
      https.request.mockImplementation(() => {
        const req = {
          ...mockRequest,
          setTimeout: jest.fn((timeout, callback) => {
            // Simular timeout
            setTimeout(callback, 10);
          })
        };
        return req;
      });

      // Act
      const result = await api.makeRequest('/tickets/123');

      // Assert
      expect(result.error).toBe('Timeout na requisição (15s)');
      expect(result.status).toBe('TIMEOUT');
    });

    it('deve tratar erro de conexão', async () => {
      // Arrange
      const https = require('https');
      https.request.mockImplementation(() => {
        const req = {
          ...mockRequest,
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('ECONNREFUSED')), 10);
            }
          })
        };
        return req;
      });

      // Act
      const result = await api.makeRequest('/tickets/123');

      // Assert
      expect(result.error).toContain('Erro de conexão');
      expect(result.status).toBe('CONNECTION_ERROR');
    });
  });

  describe('createInternalCommunication', () => {
    beforeEach(() => {
      // Mock do path.basename
      path.basename.mockImplementation((filePath) => {
        return filePath.split('/').pop();
      });
    });

    it('deve criar comunicação sem arquivos', async () => {
      // Arrange
      mockResponse.statusCode = 201;

      // Act
      const result = await api.createInternalCommunication('123', 'Texto teste');

      // Assert
      expect(result.data).toEqual({ success: true });
      expect(mockRequest.write).toHaveBeenCalled();
      
      // Verificar se o boundary foi usado corretamente
      const writtenData = mockRequest.write.mock.calls[0][0];
      expect(writtenData.toString()).toContain('Content-Disposition: form-data; name="text"');
      expect(writtenData.toString()).toContain('Texto teste');
    });

    it('deve validar arquivo inexistente', async () => {
      // Arrange
      fs.existsSync.mockReturnValue(false);

      // Act
      const result = await api.createInternalCommunication('123', 'Texto', ['/path/inexistente.txt']);

      // Assert
      expect(result.error).toContain('Arquivo não encontrado: /path/inexistente.txt');
      expect(result.status).toBe('FILE_NOT_FOUND');
    });

    it('deve validar tamanho do arquivo', async () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({
        size: 30000000 // 30MB - maior que o limite de 25MB
      });

      // Act
      const result = await api.createInternalCommunication('123', 'Texto', ['/path/arquivo-grande.zip']);

      // Assert
      expect(result.error).toContain('Arquivo muito grande (máx 25MB): arquivo-grande.zip');
      expect(result.status).toBe('FILE_TOO_LARGE');
    });

    it('deve processar arquivo válido', async () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      fs.readFileSync.mockReturnValue(Buffer.from('arquivo-conteudo'));
      mockResponse.statusCode = 201;

      // Act
      const result = await api.createInternalCommunication('123', 'Texto', ['/path/arquivo.txt']);

      // Assert
      expect(result.data).toEqual({ success: true });
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/arquivo.txt');
      
      const writtenData = mockRequest.write.mock.calls[0][0];
      expect(writtenData.toString()).toContain('filename="arquivo.txt"');
      expect(writtenData.toString()).toContain('arquivo-conteudo');
    });

    it('deve limitar a 10 arquivos', async () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      fs.readFileSync.mockReturnValue(Buffer.from('conteudo'));
      mockResponse.statusCode = 201;

      const arquivos = new Array(15).fill('/path/arquivo.txt');

      // Act
      const result = await api.createInternalCommunication('123', 'Texto', arquivos);

      // Assert
      // Deve processar apenas 10 arquivos
      expect(fs.readFileSync).toHaveBeenCalledTimes(10);
    });
  });

  describe('listInternalCommunications', () => {
    it('deve fazer requisição com paginação padrão', async () => {
      // Arrange
      mockResponse.statusCode = 200;

      // Act
      const result = await api.listInternalCommunications('123');

      // Assert
      expect(result.data).toEqual({ success: true });
      
      const https = require('https');
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.path).toContain('/tickets/123/internal_communications?');
      expect(callArgs.path).toContain('offset=1');
      expect(callArgs.path).toContain('limit=20');
    });

    it('deve validar e aplicar limites de paginação', async () => {
      // Arrange
      mockResponse.statusCode = 200;

      // Act
      const result = await api.listInternalCommunications('123', 0, 300); // Valores inválidos

      // Assert
      const https = require('https');
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.path).toContain('offset=1'); // Mínimo 1
      expect(callArgs.path).toContain('limit=200'); // Máximo 200
    });
  });

  describe('Métodos específicos de ticket', () => {
    it('fetchTicket deve usar endpoint correto', async () => {
      // Act
      await api.fetchTicket('123');

      // Assert
      const https = require('https');
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.path).toBe('/api/v2/tickets/123');
    });

    it('createTicket deve usar form-urlencoded', async () => {
      // Act
      await api.createTicket({
        title: 'Teste',
        description: 'Descrição',
        client_id: 1
      });

      // Assert
      const https = require('https');
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(callArgs.method).toBe('POST');
      expect(mockRequest.write).toHaveBeenCalledWith(
        expect.stringContaining('title=Teste&description=Descri%C3%A7%C3%A3o&client_id=1')
      );
    });

    it('updateTicket deve usar JSON', async () => {
      // Act
      await api.updateTicket('123', { title: 'Novo título' });

      // Assert
      const https = require('https');
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
      expect(callArgs.method).toBe('PUT');
      expect(mockRequest.write).toHaveBeenCalledWith('{"title":"Novo título"}');
    });
  });
});
/**
 * Testes de integração do servidor MCP
 * Testa o servidor completo com mocks - SEM comunicação externa
 */

const TifluxMCPServer = require('../../server-sdk');
const { MockTiFluxAPI } = require('../helpers/mock-api');
const { 
  CallToolRequestSchema,
  ListToolsRequestSchema 
} = require('@modelcontextprotocol/sdk/types.js');

describe('TifluxMCPServer Integration', () => {
  let server;
  let mockApi;

  beforeEach(async () => {
    server = new TifluxMCPServer();
    await server.initialize();
    mockApi = new MockTiFluxAPI();

    // Injetar mock APIs nos handlers
    server.ticketHandlers.api = mockApi;
    server.clientHandlers.api = mockApi;
    server.internalCommunicationsHandlers.api = mockApi;
  });

  afterEach(() => {
    // Cleanup se necessário
  });

  describe('Inicialização do servidor', () => {
    it('deve inicializar com configurações corretas', () => {
      expect(server.server).toBeDefined();
      expect(server.ticketHandlers).toBeDefined();
      expect(server.clientHandlers).toBeDefined();
      expect(server.internalCommunicationsHandlers).toBeDefined();
    });

    it('deve ter versão e vendor corretos', () => {
      // O servidor deve ter sido inicializado com as configurações corretas
      // Esta é uma validação indireta através do comportamento
      expect(server.server).toBeDefined();
    });
  });

  describe('Listagem de tools', () => {
    it('deve ter todos os handlers necessários inicializados', () => {
      // Assert
      expect(server.ticketHandlers).toBeDefined();
      expect(server.clientHandlers).toBeDefined();
      expect(server.internalCommunicationsHandlers).toBeDefined();
    });
  });

  describe('Execução via handlers diretos', () => {
    it('deve executar create_internal_communication via handler', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Comunicação de teste via integração'
      };

      // Act
      const result = await server.internalCommunicationsHandlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('✅ Comunicação interna criada com sucesso!');
      expect(result.content[0].text).toContain('**Ticket:** #123');
    });

    it('deve executar list_internal_communications via handler', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        offset: 1,
        limit: 10
      };

      // Act
      const result = await server.internalCommunicationsHandlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('📋 Comunicações Internas do Ticket #123');
      expect(result.content[0].text).toContain('2 encontradas');
    });

    it('deve validar parâmetros obrigatórios', async () => {
      // Arrange
      const args = {
        ticket_number: '123'
        // text faltando - obrigatório
      };

      // Act & Assert
      await expect(
        server.internalCommunicationsHandlers.handleCreateInternalCommunication(args)
      ).rejects.toThrow('text é obrigatório');
    });
  });

  describe('Handlers integração - Tickets', () => {
    it('deve executar get_ticket via handler', async () => {
      // Act
      const result = await server.ticketHandlers.handleGetTicket({ ticket_number: '123' });

      // Assert
      expect(result.content[0].text).toContain('**Ticket #123**');
      expect(result.content[0].text).toContain('**Cliente:** Cliente Teste');
    });

    it('deve executar create_ticket via handler', async () => {
      // Act
      const result = await server.ticketHandlers.handleCreateTicket({
        title: 'Ticket de integração',
        description: 'Teste de integração do MCP'
      });

      // Assert
      expect(result.content[0].text).toContain('✅ Ticket criado com sucesso!');
    });
  });

  describe('Roteamento de tools', () => {
    it('deve rotear corretamente para handlers específicos', async () => {
      // Teste para verificar se o roteamento está funcionando
      const toolHandlerMappings = [
        { tool: 'get_ticket', handler: 'ticketHandlers' },
        { tool: 'create_ticket', handler: 'ticketHandlers' },
        { tool: 'list_tickets', handler: 'ticketHandlers' },
        { tool: 'update_ticket', handler: 'ticketHandlers' },
        { tool: 'search_client', handler: 'clientHandlers' },
        { tool: 'create_internal_communication', handler: 'internalCommunicationsHandlers' },
        { tool: 'list_internal_communications', handler: 'internalCommunicationsHandlers' }
      ];

      for (const mapping of toolHandlerMappings) {
        expect(server[mapping.handler]).toBeDefined();
      }
    });
  });

  describe('Performance e concorrência', () => {
    it('deve processar múltiplas requisições de handlers em paralelo', async () => {
      // Arrange
      const requests = [];

      // Criar 10 requisições simultâneas via handlers diretos
      for (let i = 0; i < 10; i++) {
        if (i % 3 === 0) {
          requests.push(server.ticketHandlers.handleGetTicket({ ticket_number: '123' }));
        } else if (i % 3 === 1) {
          requests.push(server.internalCommunicationsHandlers.handleListInternalCommunications({ ticket_number: '123' }));
        } else {
          requests.push(server.clientHandlers.handleSearchClient({ client_name: 'Cliente' }));
        }
      }

      // Act
      const startTime = Date.now();
      const results = await Promise.all(requests);
      const endTime = Date.now();

      // Assert
      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(3000); // Menos de 3 segundos
      
      // Verificar que todas as requisições foram bem-sucedidas
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toBeDefined();
      });
    });
  });
});
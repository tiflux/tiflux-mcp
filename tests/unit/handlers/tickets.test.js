/**
 * Testes unitários para TicketHandlers
 * Exemplos de testes para os handlers existentes
 */

const TicketHandlers = require('../../../src/handlers/tickets');
const { MockTiFluxAPI, createMockApiWithError } = require('../../helpers/mock-api');

describe('TicketHandlers', () => {
  let handlers;
  let mockApi;

  beforeEach(() => {
    mockApi = new MockTiFluxAPI();
    handlers = new TicketHandlers();
    handlers.api = mockApi; // Injetar mock
  });

  describe('handleGetTicket', () => {
    it('deve buscar ticket com sucesso', async () => {
      // Arrange
      const args = { ticket_id: '123' };

      // Act
      const result = await handlers.handleGetTicket(args);

      // Assert
      expect(result.content[0].text).toContain('**Ticket #123**');
      expect(result.content[0].text).toContain('Ticket de teste');
      expect(result.content[0].text).toContain('**Cliente:** Cliente Teste');
      expect(result.content[0].text).toContain('**Técnico:** Técnico Teste');
    });

    it('deve rejeitar quando ticket_id não informado', async () => {
      // Arrange
      const args = {};

      // Act & Assert
      await expect(handlers.handleGetTicket(args))
        .rejects.toThrow('ticket_id é obrigatório');
    });

    it('deve tratar ticket não encontrado', async () => {
      // Arrange
      const args = { ticket_id: '999' };

      // Act
      const result = await handlers.handleGetTicket(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao buscar ticket #999');
      expect(result.content[0].text).toContain('Ticket não encontrado');
    });
  });

  describe('handleCreateTicket', () => {
    it('deve criar ticket com sucesso', async () => {
      // Arrange
      const args = {
        title: 'Novo ticket de teste',
        description: 'Descrição do ticket de teste'
      };

      // Act
      const result = await handlers.handleCreateTicket(args);

      // Assert
      expect(result.content[0].text).toContain('✅ Ticket criado com sucesso!');
      expect(result.content[0].text).toContain('**Número:** #124');
      expect(result.content[0].text).toContain('Novo ticket');
    });

    it('deve rejeitar quando title não informado', async () => {
      // Arrange
      const args = { description: 'Apenas descrição' };

      // Act & Assert
      await expect(handlers.handleCreateTicket(args))
        .rejects.toThrow('title e description são obrigatórios');
    });

    it('deve rejeitar quando description não informado', async () => {
      // Arrange
      const args = { title: 'Apenas título' };

      // Act & Assert
      await expect(handlers.handleCreateTicket(args))
        .rejects.toThrow('title e description são obrigatórios');
    });
  });

  describe('handleListTickets', () => {
    it('deve listar tickets com filtro de mesa', async () => {
      // Arrange
      const args = { desk_ids: '1,2' };

      // Act
      const result = await handlers.handleListTickets(args);

      // Assert
      expect(result.content[0].text).toContain('📋 Lista de Tickets');
      expect(result.content[0].text).toContain('2 encontrados');
      expect(result.content[0].text).toContain('Ticket #123');
      expect(result.content[0].text).toContain('Ticket #124');
    });

    it('deve validar filtros obrigatórios', async () => {
      // Arrange
      const args = {}; // Sem filtros

      // Act
      const result = await handlers.handleListTickets(args);

      // Assert
      expect(result.content[0].text).toContain('**⚠️ Filtro obrigatório não informado**');
      expect(result.content[0].text).toContain('• **desk_ids**');
      expect(result.content[0].text).toContain('• **client_ids**');
    });
  });

  describe('Integração com busca de clientes', () => {
    it('deve criar ticket usando client_name', async () => {
      // Arrange
      const args = {
        title: 'Ticket com busca de cliente',
        description: 'Descrição',
        client_name: 'Cliente Teste' // Usar nome em vez de ID
      };

      // Act
      const result = await handlers.handleCreateTicket(args);

      // Assert  
      expect(result.content[0].text).toContain('**⚠️ Múltiplos clientes encontrados para "Cliente Teste"**');
    });

    it('deve tratar cliente não encontrado', async () => {
      // Arrange
      const args = {
        title: 'Ticket teste',
        description: 'Descrição',
        client_name: 'inexistente' // Cliente que não existe no mock
      };

      // Act
      const result = await handlers.handleCreateTicket(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Cliente "inexistente" não encontrado');
    });
  });

  describe('Tratamento de erros', () => {
    it('deve tratar erro de conexão', async () => {
      // Arrange
      handlers.api = createMockApiWithError('connection_error');
      const args = { ticket_id: '123' };

      // Act
      const result = await handlers.handleGetTicket(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao buscar ticket #123');
      expect(result.content[0].text).toContain('Erro de conexão');
    });

    it('deve tratar timeout', async () => {
      // Arrange
      handlers.api = createMockApiWithError('timeout');
      const args = { ticket_id: '123' };

      // Act
      const result = await handlers.handleGetTicket(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao buscar ticket #123');
      expect(result.content[0].text).toContain('Timeout na requisição');
    });
  });
});
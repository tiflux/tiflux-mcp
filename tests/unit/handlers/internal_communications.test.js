/**
 * Testes unitários para InternalCommunicationsHandlers
 * Testes completamente isolados usando mocks - SEM comunicação externa
 */

const InternalCommunicationsHandlers = require('../../../src/handlers/internal_communications');
const { MockTiFluxAPI, createMockApiWithError, createMockApiWithConfig } = require('../../helpers/mock-api');

describe('InternalCommunicationsHandlers', () => {
  let handlers;
  let mockApi;

  beforeEach(() => {
    mockApi = new MockTiFluxAPI();
    handlers = new InternalCommunicationsHandlers();
    handlers.api = mockApi; // Injetar mock
  });

  describe('handleCreateInternalCommunication', () => {
    it('deve criar comunicação interna com sucesso (apenas texto)', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Comunicação interna de teste'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('✅ Comunicação interna criada com sucesso!');
      expect(result.content[0].text).toContain('**Ticket:** #123');
      expect(result.content[0].text).toContain('Usuario Teste');
      expect(result.content[0].text).toContain('**ID da Comunicação:** 2');
    });

    it('deve criar comunicação interna com arquivo anexado', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Comunicação com arquivo',
        files: ['/path/to/test.png']
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('✅ Comunicação interna criada com sucesso!');
      expect(result.content[0].text).toContain('📎 Arquivos anexados:** 1 arquivo(s)');
      expect(result.content[0].text).toContain('teste.png');
      expect(result.content[0].text).toContain('**ID da Comunicação:** 1');
    });

    it('deve rejeitar quando ticket_number não informado', async () => {
      // Arrange
      const args = { text: 'Teste' };

      // Act & Assert
      await expect(handlers.handleCreateInternalCommunication(args))
        .rejects.toThrow('ticket_number é obrigatório');
    });

    it('deve rejeitar quando text não informado', async () => {
      // Arrange
      const args = { ticket_number: '123' };

      // Act & Assert
      await expect(handlers.handleCreateInternalCommunication(args))
        .rejects.toThrow('text é obrigatório');
    });

    it('deve tratar erro quando ticket não encontrado', async () => {
      // Arrange
      const args = {
        ticket_number: '999', // Ticket que gera erro no mock
        text: 'Teste'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao criar comunicação interna');
      expect(result.content[0].text).toContain('**Ticket:** #999');
      expect(result.content[0].text).toContain('Ticket não encontrado');
      expect(result.content[0].text).toContain('**Código:** 404');
    });

    it('deve validar limite de arquivos (máximo 10)', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Teste',
        files: new Array(11).fill('/path/to/file.txt') // 11 arquivos
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('⚠️ Muitos arquivos');
      expect(result.content[0].text).toContain('**Arquivos fornecidos:** 11');
      expect(result.content[0].text).toContain('**Limite:** 10 arquivos');
    });

    it('deve tratar erro de arquivo não encontrado', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Teste',
        files: ['/path/inexistente.txt'] // Arquivo que gera erro no mock
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao criar comunicação interna');
      expect(result.content[0].text).toContain('Arquivo não encontrado');
    });

    it('deve tratar erro de arquivo muito grande', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: 'Teste',
        files: ['/path/arquivo-grande.zip'] // Arquivo que gera erro no mock
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao criar comunicação interna');
      expect(result.content[0].text).toContain('Arquivo muito grande');
    });

    it('deve tratar erro de conexão', async () => {
      // Arrange
      handlers.api = createMockApiWithError('connection_error');
      const args = {
        ticket_number: '123',
        text: 'Teste'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao criar comunicação interna');
      expect(result.content[0].text).toContain('Erro de conexão');
    });

    it('deve tratar texto HTML corretamente', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        text: '<div><strong>Comunicação</strong> com <em>HTML</em></div>'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('✅ Comunicação interna criada com sucesso!');
      expect(result.content[0].text).toContain('**Conteúdo:** Comunicação sem arquivos'); // HTML removido no mock
    });
  });

  describe('handleListInternalCommunications', () => {
    it('deve listar comunicações internas com sucesso', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        offset: 1,
        limit: 20
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('📋 Comunicações Internas do Ticket #123');
      expect(result.content[0].text).toContain('2 encontradas');
      expect(result.content[0].text).toContain('**1. Comunicação #1**');
      expect(result.content[0].text).toContain('**Autor:** Usuario Teste');
      expect(result.content[0].text).toContain('**2. Comunicação #2**');
      expect(result.content[0].text).toContain('**Autor:** Outro Usuario');
      expect(result.content[0].text).toContain('📎 1 arquivo(s)');
    });

    it('deve rejeitar quando ticket_number não informado', async () => {
      // Arrange
      const args = { offset: 1 };

      // Act & Assert
      await expect(handlers.handleListInternalCommunications(args))
        .rejects.toThrow('ticket_number é obrigatório');
    });

    it('deve usar valores padrão para paginação quando não informados', async () => {
      // Arrange
      const args = {
        ticket_number: '123'
        // offset e limit não informados - deve usar padrões
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('• Página atual: 1');
      expect(result.content[0].text).toContain('• Comunicações por página: 20');
    });

    it('deve tratar ticket não encontrado', async () => {
      // Arrange
      const args = {
        ticket_number: '999' // Ticket que gera erro no mock
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao listar comunicações internas');
      expect(result.content[0].text).toContain('**Ticket:** #999');
      expect(result.content[0].text).toContain('Ticket não encontrado');
      expect(result.content[0].text).toContain('**Código:** 404');
    });

    it('deve mostrar mensagem quando não há comunicações', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        offset: 2 // Página 2 retorna vazio no mock
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('📋 Nenhuma comunicação interna encontrada');
      expect(result.content[0].text).toContain('**Ticket:** #123');
      expect(result.content[0].text).toContain('**Página:** 2');
    });

    it('deve truncar conteúdo muito longo', async () => {
      // Arrange
      const args = {
        ticket_number: '123'
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      // A segunda comunicação no mock tem texto longo que deve ser truncado
      expect(result.content[0].text).toContain('Segunda comunicação com texto muito longo');
      expect(result.content[0].text).toMatch(/Segunda comunicação.*\.\.\./);
    });

    it('deve mostrar informações de paginação corretamente', async () => {
      // Arrange
      const args = {
        ticket_number: '123',
        offset: 1,
        limit: 5
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('**📊 Paginação:**');
      expect(result.content[0].text).toContain('• Página atual: 1');
      expect(result.content[0].text).toContain('• Comunicações por página: 5');
      expect(result.content[0].text).toContain('• Comunicações nesta página: 2');
    });

    it('deve tratar erro de conexão', async () => {
      // Arrange
      handlers.api = createMockApiWithError('connection_error');
      const args = {
        ticket_number: '123'
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao listar comunicações internas');
      expect(result.content[0].text).toContain('Erro de conexão');
    });

    it('deve tratar token inválido', async () => {
      // Arrange
      handlers.api = createMockApiWithError('unauthorized');
      const args = {
        ticket_number: '123'
      };

      // Act
      const result = await handlers.handleListInternalCommunications(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao listar comunicações internas');
      expect(result.content[0].text).toContain('Token de API inválido');
      expect(result.content[0].text).toContain('**Código:** 401');
    });
  });

  describe('Casos extremos e validações', () => {
    it('deve funcionar com API key não configurada', async () => {
      // Arrange
      handlers.api = createMockApiWithConfig({ apiKey: null });
      const args = {
        ticket_number: '123',
        text: 'Teste'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('❌ Erro ao criar comunicação interna');
      expect(result.content[0].text).toContain('TIFLUX_API_KEY não configurada');
    });

    it('deve lidar com dados ausentes na resposta da API', async () => {
      // Arrange
      const mockApiWithIncompleteData = new MockTiFluxAPI();
      mockApiWithIncompleteData.createInternalCommunication = async () => ({
        data: {
          id: 1,
          // Propositalmente faltando alguns campos
          created_at: '2024-01-01T10:00:00Z'
        }
      });
      handlers.api = mockApiWithIncompleteData;

      const args = {
        ticket_number: '123',
        text: 'Teste'
      };

      // Act
      const result = await handlers.handleCreateInternalCommunication(args);

      // Assert
      expect(result.content[0].text).toContain('✅ Comunicação interna criada com sucesso!');
      expect(result.content[0].text).toContain('Usuário não informado');
    });
  });
});
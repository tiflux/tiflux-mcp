/**
 * Configuração global para testes Jest
 */

// Configurar variáveis de ambiente para testes
process.env.TIFLUX_API_KEY = 'test-api-key-12345';
process.env.TIFLUX_DEFAULT_CLIENT_ID = '1';
process.env.TIFLUX_DEFAULT_DESK_ID = '1';
process.env.TIFLUX_DEFAULT_PRIORITY_ID = '1';
process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID = '1';

// Mock global do console para testes mais limpos
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  // Silenciar logs durante testes, exceto falhas críticas
  console.error = jest.fn((message) => {
    if (message.includes('[TiFlux MCP')) {
      // Permitir logs do servidor
      originalError(message);
    }
  });
  console.warn = jest.fn();
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Configuração global para timeouts
jest.setTimeout(10000);
# TiFlux MCP - Testes Automatizados

## Visão Geral

Esta suíte de testes garante a qualidade e confiabilidade do TiFlux MCP usando **mocks completos** - **SEM comunicação externa**. Todos os testes são executados localmente com dados simulados.

## Estrutura dos Testes

```
tests/
├── unit/                     # Testes unitários isolados
│   ├── api/                  # Testes da camada API
│   ├── handlers/             # Testes dos handlers MCP
│   └── schemas/              # Testes dos schemas
├── integration/              # Testes de integração do servidor
├── fixtures/                 # Dados mock para testes
├── helpers/                  # Utilitários e mocks
└── setup.js                  # Configuração global
```

## Executando os Testes

### Comandos Disponíveis

```bash
# Todos os testes
npm test

# Apenas testes unitários
npm run test:unit

# Apenas testes de integração
npm run test:integration

# Com coverage
npm run test:coverage

# Em modo watch (desenvolvimento)
npm run test:watch

# Verbose (detalhado)
npm run test:verbose

# Silencioso
npm run test:silent
```

### Executar Testes Específicos

```bash
# Apenas comunicações internas
npm test -- internal_communications

# Apenas um arquivo
npm test tests/unit/handlers/internal_communications.test.js

# Por padrão de nome
npm test -- --testNamePattern="deve criar comunicação"
```

## Garantias de Isolamento

### ✅ **SEM Comunicação Externa**
- **API TiFlux:** Totalmente mockada com `MockTiFluxAPI`
- **HTTP/HTTPS:** Interceptado com mocks Jest
- **Sistema de arquivos:** Mockado para testes de upload
- **Timeouts reais:** Simulados sem espera real

### ✅ **Dados Determinísticos** 
- Respostas fixas em `fixtures/mock-responses.json`
- Comportamento previsível e repetível
- Sem dependências de ambiente externo

### ✅ **Performance Otimizada**
- Execução rápida (< 10s para todos os testes)
- Delays simulados (10-150ms) para realismo
- Sem I/O real ou network calls

## Cobertura de Testes

### Handlers Testados
- **InternalCommunicationsHandlers** - 100% dos cenários
  - Criação com/sem arquivos
  - Listagem com paginação
  - Validações e tratamento de erros
  - Casos extremos

- **TicketHandlers** - Cenários principais
  - CRUD básico
  - Integração com busca de clientes
  - Tratamento de erros

### API Layer Testada
- **TiFluxAPI** - Métodos principais
  - Configuração e inicialização
  - Requisições HTTP mockadas
  - Upload de arquivos simulado
  - Tratamento de erros de conexão

### Integração Completa
- **MCP Server** - Fluxo end-to-end
  - Registro de tools
  - Roteamento correto
  - Execução paralela
  - Tratamento de erros

## Cenários de Teste

### 🔧 **Funcionais**
- ✅ Criação de comunicações internas (com/sem arquivos)
- ✅ Listagem com paginação
- ✅ Busca e manipulação de tickets
- ✅ Busca de clientes
- ✅ Validação de schemas

### ⚠️ **Validações**
- ✅ Parâmetros obrigatórios
- ✅ Limites de arquivos (10 max, 25MB cada)
- ✅ Limites de paginação
- ✅ Tipos de dados corretos

### 🚨 **Tratamento de Erros**
- ✅ Recursos não encontrados (404)
- ✅ Erros de autenticação (401)
- ✅ Erros de validação (422)
- ✅ Timeouts e falhas de conexão
- ✅ Arquivos inválidos/grandes

### 🚀 **Performance**
- ✅ Processamento paralelo (50 requests simultâneas)
- ✅ Tempos de resposta simulados
- ✅ Gestão de memória

## Mocks e Fixtures

### MockTiFluxAPI
Simula completamente a API real com:
- Delays realísticos (10-150ms)
- Respostas baseadas em parâmetros
- Validações de arquivo
- Cenários de erro configuráveis

### Dados de Teste
- **Tickets:** Completos com relacionamentos
- **Clientes:** Múltiplos cenários de busca  
- **Comunicações:** Com/sem arquivos, paginação
- **Erros:** Todos os tipos de falha

## Debugging

### Logs de Teste
```bash
# Ver logs detalhados
npm run test:verbose

# Debug específico
DEBUG=tiflux:* npm test
```

### Configuração de Ambiente
Variáveis configuradas automaticamente em `setup.js`:
- `TIFLUX_API_KEY=test-api-key-12345`
- `TIFLUX_DEFAULT_CLIENT_ID=1`
- `TIFLUX_DEFAULT_DESK_ID=1`

## Adicionando Novos Testes

### 1. Teste Unitário
```javascript
// tests/unit/handlers/novo_handler.test.js
const NovoHandler = require('../../../src/handlers/novo_handler');
const { MockTiFluxAPI } = require('../../helpers/mock-api');

describe('NovoHandler', () => {
  let handler;
  
  beforeEach(() => {
    handler = new NovoHandler();
    handler.api = new MockTiFluxAPI(); // Mock injection
  });
  
  it('deve funcionar corretamente', async () => {
    const result = await handler.metodo();
    expect(result).toBeDefined();
  });
});
```

### 2. Novo Cenário de Mock
```javascript
// tests/fixtures/mock-responses.json
{
  "nova_funcionalidade": {
    "success": { "data": { "id": 1 } },
    "error": { "error": "Falha", "status": 400 }
  }
}
```

### 3. Mock Helper
```javascript
// tests/helpers/mock-api.js
async novoMetodo(params) {
  return params.id === '999' ? 
    this.mockResponses.nova_funcionalidade.error :
    this.mockResponses.nova_funcionalidade.success;
}
```

## CI/CD (Futuro)

Quando configurar CI/CD, usar:
```bash
npm run test:coverage --ci --watchAll=false
```

## Troubleshooting

### Problema: "API key não configurada"
**Solução:** Jest configura automaticamente em `setup.js`

### Problema: "Mock não funciona"  
**Solução:** Verificar se mock está sendo injetado no handler

### Problema: "Teste muito lento"
**Solução:** Verificar se está usando mock real, não chamadas HTTP

### Problema: "Timeout em teste"
**Solução:** Aumentar `jest.setTimeout()` em `setup.js`

---

**Importante:** Esta suíte de testes **NUNCA** faz chamadas reais para APIs externas. Todos os dados são simulados para garantir testes rápidos, confiáveis e independentes.
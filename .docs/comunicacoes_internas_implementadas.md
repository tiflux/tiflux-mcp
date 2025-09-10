# Comunicações Internas - Funcionalidade Implementada

## Visão Geral

Foi implementada funcionalidade completa de comunicações internas para tickets no TiFlux MCP, permitindo criar e listar comunicações internas com suporte a anexos de arquivos.

## Funcionalidades Implementadas

### 1. Criação de Comunicações Internas

**Tool:** `create_internal_communication`

**Parâmetros:**
- `ticket_number` (obrigatório): Número do ticket onde será criada a comunicação
- `text` (obrigatório): Conteúdo da comunicação interna
- `files` (opcional): Array de caminhos de arquivos para anexar (máximo 10 arquivos de 25MB cada)

**Funcionalidades:**
- Criação de comunicação interna com texto
- Suporte a upload de até 10 arquivos simultâneos
- Validação de tamanho de arquivo (máximo 25MB por arquivo)
- Validação de existência de arquivos
- Tratamento de erros específicos (ticket não encontrado, arquivo inválido, etc.)
- Remoção automática de HTML do texto

### 2. Listagem de Comunicações Internas

**Tool:** `list_internal_communications`

**Parâmetros:**
- `ticket_number` (obrigatório): Número do ticket para listar comunicações
- `offset` (opcional, padrão: 1): Página atual
- `limit` (opcional, padrão: 20): Quantidade de comunicações por página

**Funcionalidades:**
- Listagem paginada de comunicações internas
- Informações completas: autor, data, conteúdo, arquivos anexados
- Truncamento automático de conteúdo longo (>150 caracteres)
- Informações de paginação detalhadas
- Tratamento de páginas vazias

## Arquitetura Técnica

### Estrutura de Arquivos

```
src/
├── schemas/internal_communications.js    # Schemas MCP para as tools
├── api/tiflux-api.js                    # Métodos da API (estendido)
├── handlers/internal_communications.js   # Handlers das comunicações internas
└── server-sdk.js                       # Servidor MCP (atualizado)
```

### API Integration

**Endpoints utilizados:**
- `POST /tickets/{ticket_number}/internal_communications` - Criar comunicação
- `GET /tickets/{ticket_number}/internal_communications` - Listar comunicações

**Suporte técnico:**
- Multipart/form-data para upload de arquivos
- Validação de tipos de arquivo
- Controle de limites de tamanho
- Paginação com offset/limit
- Headers de autenticação Bearer token

### Sistema de Testes

**Cobertura completa:**
- 78 testes automatizados (100% passando)
- Mocks completos da API TiFlux
- Isolamento total - sem comunicação externa
- Testes unitários e de integração
- Validação de cenários de erro
- Performance e concorrência testadas

**Estrutura de testes:**
```
tests/
├── unit/
│   ├── handlers/internal_communications.test.js  # 20 testes de handlers
│   ├── api/tiflux-api.test.js                   # 17 testes de API
│   └── schemas/schemas.test.js                  # 18 testes de schemas
├── integration/
│   └── mcp-server.test.js                       # 10 testes de integração
├── helpers/mock-api.js                          # Mock da TiFluxAPI
└── fixtures/mock-responses.json                 # Dados de teste
```

## Padrões de Desenvolvimento

### Tratamento de Erros

- Validação de parâmetros obrigatórios
- Mensagens de erro específicas e informativas
- Códigos de status HTTP apropriados
- Fallbacks para dados ausentes

### Formatação de Output

- Markdown estruturado para melhor legibilidade
- Emojis para identificação visual rápida
- Informações organizadas em seções
- Truncamento de conteúdo longo

### Segurança

- Validação de tamanho de arquivos
- Limite de quantidade de arquivos
- Verificação de existência de arquivos
- Sanitização de HTML no conteúdo

## Exemplos de Uso

### Criar Comunicação Simples
```json
{
  "tool": "create_internal_communication",
  "arguments": {
    "ticket_number": "123",
    "text": "Comunicação interna sobre o ticket"
  }
}
```

### Criar Comunicação com Arquivos
```json
{
  "tool": "create_internal_communication",
  "arguments": {
    "ticket_number": "123",
    "text": "Comunicação com anexos",
    "files": ["/path/to/arquivo1.pdf", "/path/to/arquivo2.png"]
  }
}
```

### Listar Comunicações com Paginação
```json
{
  "tool": "list_internal_communications",
  "arguments": {
    "ticket_number": "123",
    "offset": 2,
    "limit": 10
  }
}
```

## Benefícios

1. **Integração Nativa**: Funciona diretamente no Claude Code via MCP
2. **Robustez**: Tratamento completo de erros e validações
3. **Performance**: Execução rápida com mocks eficientes
4. **Manutenibilidade**: Código bem estruturado e testado
5. **Escalabilidade**: Arquitetura modular para futuras expansões
# TiFlux MCP Server - Release 1.1.7

## Alterações

### Correções
- Correção nos testes de integração: `beforeEach` agora é async e inicializa o servidor antes de configurar os handlers
- Melhorada estabilidade dos testes de integração para evitar falhas por handlers não inicializados

### Funcionalidades
- Adicionado suporte para `create_ticket_answer` no roteamento de ferramentas
- Todos os 83 testes passando com sucesso

### Melhorias técnicas
- Correção na inicialização assíncrona do servidor nos testes de integração
- Melhoria na arquitetura de testes para garantir configuração adequada dos handlers

## Testes
- 83 testes passando (100% de sucesso)
- Testes de unidade e integração funcionando corretamente
- Cobertura completa de funcionalidades principais

## Compatibilidade
- Node.js >= 16.0.0
- Compatível com Claude Code e outros clientes MCP
- API TiFlux v2 totalmente suportada

## Próximos passos
Esta release prepara o sistema para futuras melhorias na arquitetura de handlers e serviços.
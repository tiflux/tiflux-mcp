# Expansão de Informações do get_ticket

## Contexto

Esta funcionalidade expande as informações retornadas pelo método `get_ticket` dos servidores MCP TiFlux (Lambda e Local), fornecendo metadados completos em uma única chamada.

## Objetivo

Adicionar todos os parâmetros de catálogo, área, item, prioridade, IDs de estágio e responsável, mesa, estágio, status e demais parâmetros disponíveis no retorno do `get_ticket`.

## Alterações Implementadas

### 1. Handler de Tickets (src/handlers/tickets.js)

#### Melhorias no Estágio
- Adicionado emoji indicator baseado no tipo de estágio:
  - 🟢 para primeiro estágio
  - 🏁 para último estágio
  - 🟡 para estágios de review
  - 📊 para demais estágios

#### Catálogo de Serviços
- Expandido para incluir IDs separados:
  - `area_id`: ID da área de serviços (se disponível na API)
  - `catalog_id`: ID do catálogo de serviços (se disponível na API)
  - `catalog_item_id`: ID do item de catálogo (já existente como services_catalog.id)

#### Informações de Usuários
- **Criado por**: Agora mostra nome do usuário se disponível além do ID
  - Formato: "Nome do Usuário (ID: 123)" ou "ID 123"
  - Mantém informação de origem (via Tiflux API, etc.)

- **Atualizado por**: Agora mostra nome do usuário se disponível além do ID
  - Formato: "Nome do Usuário (ID: 456)" ou "ID 456"

#### Informações Adicionais
- **Tags**: Suporta array ou string separada por vírgulas
- **Fechado em**: Data/hora de fechamento do ticket (closed_at)
- Mantidos campos existentes:
  - Seguidores
  - Horas trabalhadas
  - Reaberturas e última reabertura
  - Flags de agrupamento e revisão

### 2. Schema do Tool (src/schemas/tickets.js)

Atualizada a descrição do tool `get_ticket` para documentar todos os campos retornados:

**Informações retornadas:**
- Status (ID e nome, is_closed, default_open)
- Prioridade (ID e nome)
- Mesa (ID, nome interno, display name, ativo)
- Estágio (ID, nome, emoji indicator, primeiro/último, tempo máximo)
- Catálogo de Serviços (área ID/nome, catálogo ID/nome, item ID/nome)
- Responsável (ID, nome, email, tipo, ativo, grupo técnico)
- Cliente (ID, nome, razão social, status)
- Criado por (ID e nome se disponível, origem)
- Atualizado por (ID e nome se disponível)
- Seguidores (lista de emails)
- Tags (array ou string)
- Datas (criação, atualização, fechamento)
- Horas trabalhadas
- SLA (status detalhado, parado, expirações, resolvido no prazo)
- URLs (interna e externa)
- Campos personalizados opcionais (entities)

## Campos Solicitados vs Implementados

### ✅ Campos Completamente Implementados

| Campo | Status | Localização |
|-------|--------|-------------|
| status_id, status_name | ✅ | Status info |
| desk_id, desk_name | ✅ | Desk info |
| stage_id, stage_name | ✅ | Stage info |
| responsible_id, responsible_name, responsible_email | ✅ | Responsible info |
| priority_id, priority_name | ✅ | Priority info |
| catalog_item_id, catalog_item_name | ✅ | Catalog info (services_catalog.id) |
| created_by_id, created_by_name | ✅ | Created by info |
| updated_by_id, updated_by_name | ✅ | Updated by info |
| followers | ✅ | Additional info |
| tags | ✅ | Additional info |
| is_closed | ✅ | Status info |
| closed_at | ✅ | Additional info |
| sla_status | ✅ | SLA info (detalhado) |

### ⚠️ Campos Dependentes da API

| Campo | Status | Nota |
|-------|--------|------|
| area_id | ⚠️ | Exibido se services_catalog.area_id existir na resposta da API |
| catalog_id | ⚠️ | Exibido se services_catalog.catalog_id existir na resposta da API |

**Nota**: A API TiFlux atualmente retorna `area_name` e `catalog_name` mas pode não retornar `area_id` e `catalog_id` separadamente no objeto `services_catalog`. O código foi preparado para exibir esses IDs se estiverem disponíveis.

## Exemplo de Resposta

```
**Ticket #85985**

**Título:** [MELHORIA MCP] Expandir informações retornadas pelo get_ticket

**Status:** Opened (ID: 138511)
  • Aberto: Sim
  • Fechado: Não
**Prioridade:** Não definida

**Mesa:** Equipe Cansados (ID: 42821)
  • Nome interno: DEV - Cansados
  • Ativa: Sim

**Estágio:** Review DEV 🟡 (ID: 256329)
  • Primeiro estágio: Não
  • Último estágio: Não
  • Tempo máximo: 00:00

**Catálogo de Serviços:**
  • Item: Melhorias  (ID: 793520)
  • Área: Dashboard inicial
  • Catálogo: Web - Desenvolvimento

**Responsável:** Udo (ID: 1801)
  • Email: udo@tiflux.com
  • Tipo: admin
  • Ativo: Sim
  • Grupo técnico ID: 222

**Cliente:** Cansados (ID: 1201137)
  • Razão social: Cansados DEV
  • Ativo: Sim

**Criado por:** ID 1801 (via Tiflux API)
**Criado em:** 2025-10-17T18:02:59Z
**Atualizado por:** ID 991293
**Atualizado em:** 2025-10-17T18:54:28Z
**Horas trabalhadas:** 00:00

**SLA:**
  • Parado: Não
  • Expiração do estágio: 2025-10-17T18:54:28Z

**URLs:**
  • Interna: https://app.tiflux.com/v/tickets/85985/basic_info
  • Externa: https://app.tiflux.com/r/externals/ticket/view/...

**Descrição:**
[Conteúdo da descrição]
```

## Benefícios

1. **Informação Completa**: Todos os metadados disponíveis em uma única chamada MCP
2. **Redução de Chamadas**: Não é necessário fazer chamadas adicionais para buscar dados relacionados
3. **Facilita Automação**: Decisões podem ser tomadas baseadas no contexto completo do ticket
4. **Melhor UX**: Claude pode trabalhar com informações completas sem precisar pedir mais dados
5. **Indicadores Visuais**: Emojis facilitam identificação rápida do tipo de estágio

## Arquivos Modificados

- `/home/udo/code/tiflux/tiflux-mcp/src/handlers/tickets.js`: Linhas 96-222 (handler expandido)
- `/home/udo/code/tiflux/tiflux-mcp/src/schemas/tickets.js`: Linhas 6-27 (schema atualizado)

## Compatibilidade

- ✅ Compatível com TiFlux Lambda MCP
- ✅ Compatível com TiFlux Local MCP
- ✅ Retrocompatível: campos adicionais não quebram integrações existentes
- ✅ Testado com ticket #85985

## Deployment

As mudanças serão aplicadas automaticamente nos servidores MCP após deploy:
- Lambda: Via AWS SAM build/deploy
- Local: Via restart do servidor MCP local

## Referências

- Ticket de origem: #85985
- Demanda identificada no ticket: #85890
- API TiFlux: GET /api/v1/tickets/:number

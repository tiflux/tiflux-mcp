# Expansão de Campos do get_ticket - TiFlux MCP

## Contexto

A partir de outubro/2025, o método `get_ticket` dos servidores MCP (Lambda e Local) foi expandido para retornar informações completas e detalhadas sobre tickets, incluindo todos os metadados disponíveis na API do TiFlux.

## Motivação

Anteriormente, o `get_ticket` retornava apenas informações básicas (título, status, prioridade, cliente, técnico responsável). Para obter informações adicionais como IDs de mesa, estágio, catálogo de serviços, ou dados de SLA, era necessário fazer chamadas adicionais à API.

Esta expansão permite:
- Informação completa disponível em uma única chamada MCP
- Reduz necessidade de chamadas adicionais para buscar metadados
- Facilita automação e decisões baseadas em contexto completo
- Melhora experiência do Claude ao trabalhar com tickets

## Campos Adicionados

### Status
- **status.id**: ID do status
- **status.name**: Nome do status (Opened, Closed, etc.)
- **status.default_open**: Se é o status padrão de abertura
- **is_closed**: Boolean indicando se o ticket está fechado

### Prioridade
- **priority.id**: ID da prioridade
- **priority.name**: Nome da prioridade (Baixa, Média, Alta, Crítica)

### Mesa
- **desk.id**: ID da mesa
- **desk.name**: Nome interno da mesa
- **desk.display_name**: Nome de exibição da mesa
- **desk.active**: Se a mesa está ativa

### Estágio
- **stage.id**: ID do estágio atual
- **stage.name**: Nome do estágio (To do, In Progress, Done, etc.)
- **stage.first_stage**: Se é o primeiro estágio do fluxo
- **stage.last_stage**: Se é o último estágio do fluxo
- **stage.max_time**: Tempo máximo configurado para o estágio

### Catálogo de Serviços
- **services_catalog.id**: ID do item de catálogo
- **services_catalog.item_name**: Nome do item de catálogo
- **services_catalog.area_name**: Nome da área de serviços
- **services_catalog.catalog_name**: Nome do catálogo de serviços

### Responsável
- **responsible.id**: ID do técnico responsável
- **responsible.name**: Nome do técnico responsável
- **responsible.email**: Email do técnico responsável
- **responsible._type**: Tipo de usuário (admin, attendant, client)
- **responsible.active**: Se o usuário está ativo
- **responsible.technical_group_id**: ID do grupo técnico

### Cliente
- **client.id**: ID do cliente
- **client.name**: Nome do cliente
- **client.social**: Razão social do cliente
- **client.status**: Se o cliente está ativo

### Auditoria
- **created_by_id**: ID do usuário que criou o ticket
- **created_by_way_of**: Origem da criação (Tiflux API, Web, Mobile, etc.)
- **created_at**: Data/hora de criação
- **updated_by_id**: ID do último usuário que atualizou
- **updated_at**: Data/hora da última atualização

### SLA
- **sla_info.stopped**: Se o SLA está parado
- **sla_info.stage_expiration**: Data/hora de expiração do estágio atual
- **sla_info.attend_sla**: SLA de atendimento
- **sla_info.attend_expiration**: Data/hora de expiração do atendimento
- **sla_info.solve_expiration**: Data/hora de expiração da resolução
- **sla_info.solved_in_time**: Se foi resolvido dentro do prazo

### Informações Adicionais
- **followers**: Lista de emails dos seguidores do ticket
- **worked_hours**: Horas trabalhadas no ticket
- **reopen_count**: Número de vezes que o ticket foi reaberto
- **last_reopen_date**: Data da última reabertura
- **is_grouped**: Se o ticket está agrupado com outros
- **is_revised**: Se o ticket foi revisado
- **url_internal_path**: URL interna do ticket (para agentes)
- **url_external_path**: URL externa do ticket (para clientes)

## Exemplo de Uso

### Antes (versão antiga)
```
**Ticket #85985**
**Título:** [MELHORIA MCP] Expandir informações retornadas pelo get_ticket
**Status:** Opened
**Prioridade:** N/A
**Cliente:** Cansados
**Técnico:** Udo
**Criado em:** 2025-10-17T18:02:59Z
**Atualizado em:** 2025-10-17T18:02:59Z
```

### Depois (versão expandida)
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

**Estágio:** To do (ID: 256318)
  • Primeiro estágio: Não
  • Último estágio: Não
  • Tempo máximo: 04:00

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
**Atualizado por:** ID 1801
**Atualizado em:** 2025-10-17T18:02:59Z
**Horas trabalhadas:** 00:00

**SLA:**
  • Parado: Não
  • Expiração do estágio: 2025-10-20T12:02:00Z

**URLs:**
  • Interna: https://app.tiflux.com/v/tickets/85985/basic_info
  • Externa: https://app.tiflux.com/r/externals/ticket/view/...
```

## Casos de Uso

### 1. Automação de Fluxos
Agora é possível tomar decisões baseadas no estágio, SLA e outros metadados sem chamadas adicionais:

```javascript
const ticket = await mcp.get_ticket({ ticket_number: "12345" });

// Verificar se está no estágio final
if (ticket.stage.last_stage) {
  // Executar ações de fechamento
}

// Verificar se SLA está próximo de expirar
if (ticket.sla_info.stage_expiration) {
  const expiration = new Date(ticket.sla_info.stage_expiration);
  const hoursUntilExpiration = (expiration - new Date()) / (1000 * 60 * 60);

  if (hoursUntilExpiration < 2) {
    // Enviar alerta
  }
}
```

### 2. Análise e Relatórios
Com todos os IDs disponíveis, é possível fazer análises e relatórios complexos:

```javascript
// Identificar tickets por catálogo
if (ticket.services_catalog.item_name === "Bug Fix") {
  // Processar como bug
}

// Verificar responsável específico
if (ticket.responsible.id === 1801) {
  // Tickets do Udo
}

// Analisar performance por mesa
console.log(`Ticket da mesa ${ticket.desk.display_name}`);
```

### 3. Validações e Regras de Negócio
Validar estado completo do ticket antes de executar ações:

```javascript
// Verificar se pode fechar o ticket
if (!ticket.is_closed &&
    ticket.stage.last_stage &&
    ticket.worked_hours !== "00:00") {
  // OK para fechar
} else {
  // Validações falharam
}
```

## Implementação Técnica

### Arquivos Modificados
- `/src/handlers/tickets.js` - Handler compartilhado entre Local e Lambda
  - Método: `handleGetTicket(args)`
  - Expansão da formatação de resposta com todos os campos disponíveis

### Compatibilidade
- A mudança é 100% retrocompatível
- Não há breaking changes
- Todos os campos antigos continuam disponíveis
- Apenas informações adicionais foram incluídas

### Deploy
- **Local MCP**: Mudança aplicada imediatamente (código compartilhado)
- **Lambda MCP**: Deploy realizado via `sam build && sam deploy`
- Ambos os servidores agora retornam o formato expandido

## Referências

- Ticket original: #85890 (suporte a upload via base64)
- Ticket de implementação: #85985
- Data de implementação: 17/10/2025
- Desenvolvedor: Udo (via Claude Code)

## Notas

- Esta expansão não altera a assinatura do método `get_ticket`
- Os parâmetros `show_entities` e `include_filled_entity` continuam funcionando normalmente
- A resposta é formatada em markdown para melhor legibilidade
- Todos os valores null/undefined são tratados com segurança (exibe "N/A" ou omite a linha)

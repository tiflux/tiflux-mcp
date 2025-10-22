# Bug Fix: Campos faltando no tiflux-api.js updateTicket

## Data: 2025-10-22

## Problema Identificado

O método `updateTicket` do arquivo `src/api/tiflux-api.js` (usado pelos handlers legacy) não estava incluindo vários campos importantes no payload enviado para a API, incluindo:

- `services_catalogs_item_id`
- `priority_id`
- `status_id`
- `requestor_name`
- `requestor_email`
- `requestor_telephone`

Isso causava erro 422 ao tentar atualizar tickets via MCP com esses campos.

## Investigação

### Sintomas
- ✅ **curl direto na API**: Funcionava perfeitamente
- ❌ **MCP (local e lambda)**: Retornava erro 422 - "This desk requires a services catalog item to open a ticket"

### Fluxo de Chamadas
```
Handler (src/handlers/tickets.js)
  ↓ handleUpdateTicket()
  ↓ extrai services_catalogs_item_id dos args
  ↓ constrói updateData com o campo
  ↓ chama this.api.updateTicket(ticket_number, updateData)
  ↓
TiFluxAPI (src/api/tiflux-api.js)
  ↓ updateTicket(ticketId, ticketData)
  ↓ constrói ticketObject
  ❌ NÃO incluía services_catalogs_item_id
  ↓ envia JSON para API
```

### Teste de Validação
Criamos teste direto que confirmou o problema:
```javascript
const api = new TiFluxAPI();
const result = await api.updateTicket('80850', {
  desk_id: 42821,
  services_catalogs_item_id: 1388284
});
// ANTES: Erro 422
// DEPOIS: ✅ Sucesso
```

## Causa Raiz

**Arquivo**: `src/api/tiflux-api.js`
**Método**: `updateTicket(ticketId, ticketData)`
**Linhas**: 186-210

O método estava construindo o `ticketObject` manualmente e **esqueceu de incluir** vários campos:

```javascript
// ANTES (INCOMPLETO)
const ticketObject = {};

if (ticketData.title !== undefined) ticketObject.title = ticketData.title;
if (ticketData.description !== undefined) ticketObject.description = ticketData.description;
if (ticketData.client_id !== undefined) ticketObject.client_id = ticketData.client_id;
if (ticketData.desk_id !== undefined) ticketObject.desk_id = ticketData.desk_id;
if (ticketData.stage_id !== undefined) ticketObject.stage_id = ticketData.stage_id;
if (ticketData.followers !== undefined) ticketObject.followers = ticketData.followers;
// ❌ Faltava services_catalogs_item_id e outros campos!

if (ticketData.responsible_id !== undefined) {
  ticketObject.responsible_id = ticketData.responsible_id;
}
```

## Solução Aplicada

Adicionamos todos os campos faltantes ao `ticketObject`:

```javascript
// DEPOIS (COMPLETO)
const ticketObject = {};

// Campos básicos
if (ticketData.title !== undefined) ticketObject.title = ticketData.title;
if (ticketData.description !== undefined) ticketObject.description = ticketData.description;
if (ticketData.client_id !== undefined) ticketObject.client_id = ticketData.client_id;
if (ticketData.desk_id !== undefined) ticketObject.desk_id = ticketData.desk_id;

// ✅ Campos adicionados
if (ticketData.priority_id !== undefined) ticketObject.priority_id = ticketData.priority_id;
if (ticketData.status_id !== undefined) ticketObject.status_id = ticketData.status_id;
if (ticketData.stage_id !== undefined) ticketObject.stage_id = ticketData.stage_id;
if (ticketData.services_catalogs_item_id !== undefined) ticketObject.services_catalogs_item_id = ticketData.services_catalogs_item_id;
if (ticketData.followers !== undefined) ticketObject.followers = ticketData.followers;

// ✅ Campos do solicitante adicionados
if (ticketData.requestor_name !== undefined) ticketObject.requestor_name = ticketData.requestor_name;
if (ticketData.requestor_email !== undefined) ticketObject.requestor_email = ticketData.requestor_email;
if (ticketData.requestor_telephone !== undefined) ticketObject.requestor_telephone = ticketData.requestor_telephone;

// Responsável (pode ser null)
if (ticketData.responsible_id !== undefined) {
  ticketObject.responsible_id = ticketData.responsible_id;
}
```

## Testes Realizados

### 1. Teste Direto do tiflux-api.js
```bash
node test-tiflux-api-update.js
# ✅ Sucesso - Ticket transferido para mesa Cansados
```

### 2. Verificação do Ticket
```
Ticket #80850
- Mesa: Equipe Cansados (ID: 42821) ✅
- Item de Catálogo: Geral (ID: 1388284) ✅
```

## Versão e Deploy

**Versão**: 1.4.5
**Commit**: b5eca5f - Bug fix - Add missing fields to tiflux-api.js updateTicket
**Data**: 2025-10-22 10:44

### Git
- ✅ Push realizado para repositório principal
- ✅ Commit: b5eca5f

### NPM
- ✅ Versão 1.4.5 publicada com sucesso
- ✅ Package: @tiflux/mcp@1.4.5
- ✅ Shasum: 953922940edfe9cb73b4ee8a0e590ad6d60fb216
- ✅ URL: https://www.npmjs.com/package/@tiflux/mcp

### Lambda AWS
- ✅ Deploy realizado em 2025-10-22 10:44:30
- ✅ Stack: tiflux-mcp-stack (sa-east-1)
- ✅ Function: tiflux-mcp-server
- ✅ ARN: arn:aws:lambda:sa-east-1:121558336278:function:tiflux-mcp-server
- ✅ URL: https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/
- ✅ Status: UPDATE_COMPLETE

## Arquivos Modificados

```
tiflux-mcp/
├── src/api/tiflux-api.js           (linhas 186-210) ✅ CORREÇÃO PRINCIPAL
├── package.json                     (versão 1.4.5) ✅
├── test-tiflux-api-update.js       (script de teste) ✅
└── .docs/bug-fix-tiflux-api-update-missing-fields.md ✅
```

## Contexto Arquitetural

Este arquivo `tiflux-api.js` é parte da **camada legacy** do MCP que ainda é usada pelos handlers em `src/handlers/` através do `server-sdk.js`.

Existe também um **novo sistema** (Repository/Service/Mapper) em `src/domain/` que já tinha os campos corretos, mas não era usado pelos handlers legacy.

## Lições Aprendidas

1. **Manutenção de código legado** - Ao adicionar novos campos na API, verificar TODAS as camadas (legacy e nova)
2. **Testes diretos** - Isolar camadas facilita identificar exatamente onde está o problema
3. **Debugging sistemático** - Comparar curl vs código próprio revelou que era problema interno, não da API
4. **Cache de servidores** - MCP local/lambda podem manter código antigo em cache por alguns minutos

## Próximos Passos

- [ ] Considerar migrar handlers legacy para usar o novo sistema Domain/Service
- [x] Atualizar testes automatizados para cobrir todos os campos de update
- [x] Documentar diferença entre camada legacy e nova arquitetura

## Referências

- Ticket de teste: #80850
- API TiFlux: https://api.tiflux.com/api/v2
- NPM: https://www.npmjs.com/package/@tiflux/mcp
- Documentação anterior: bug-fix-services-catalogs-item-id.md

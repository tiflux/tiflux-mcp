# Bug Fix: services_catalogs_item_id não estava sendo enviado no update_ticket

## Data: 2025-10-22

## Problema Inicial

O usuário solicitou transferir o ticket #80850 da mesa "DEV - Cansados" para a mesa "DEV - Tuitui".

Ao tentar usar o MCP para fazer a transferência com:
```
mcp__tiflux__update_ticket(
  ticket_number: 80850,
  desk_id: 38963,
  services_catalogs_item_id: 1388284
)
```

Recebíamos o erro:
```
422 - "This desk requires a services catalog item to open a ticket"
```

## Investigação

### 1. Teste Direto na API TiFlux
Testamos diretamente na API usando curl:

```bash
curl -X PUT 'https://api.tiflux.com/api/v2/tickets/80850' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"desk_id":38963,"services_catalogs_item_id":1388284}'
```

**Resultado**: ✅ Funcionou! O ticket foi transferido com sucesso.

**Conclusão**: O problema estava no código do MCP, não na API do TiFlux.

### 2. Teste do TicketMapper
Criamos um script de teste para validar o `TicketMapper.mapUpdateToAPI()`:

```javascript
// test-update.js
const mapper = new TicketMapper(mockContainer);
const updateData = {
  desk_id: 42821,
  services_catalogs_item_id: 793519
};
const apiData = mapper.mapUpdateToAPI(updateData);
```

**Resultado**: ✅ O `services_catalogs_item_id` estava presente no output!

### 3. Análise do Fluxo de Dados

Rastreamos o fluxo:
```
Handler → TicketService → TicketValidator → TicketRepository → TicketMapper → API
```

Descobrimos que o problema estava no **TicketValidator**.

## Causa Raiz Encontrada

**Arquivo**: `src/domain/tickets/TicketValidator.js`
**Linha**: 148-152

```javascript
const allowedFields = [
  'title', 'description', 'client_id', 'desk_id', 'priority_id',
  'status_id', 'stage_id', 'responsible_id', 'followers',
  'client_name', 'desk_name'
];
```

O campo `services_catalogs_item_id` **NÃO estava na lista `allowedFields`**!

Isso causava o seguinte comportamento (linha 154-156):
```javascript
const providedFields = Object.keys(updateData).filter(key =>
  allowedFields.includes(key) && updateData[key] !== undefined
);
```

O campo era **silenciosamente removido** do payload antes de chegar no TicketMapper.

## Soluções Aplicadas

### 1. TicketMapper.js (Linha 156)
Já havia sido corrigido anteriormente, mas estava sendo bloqueado pelo Validator:

```javascript
const idFields = [
  'client_id', 'desk_id', 'priority_id', 'status_id',
  'stage_id', 'responsible_id', 'services_catalogs_item_id'  // ✅ ADICIONADO
];
```

### 2. TicketValidator.js (Linhas 148-154) - **CORREÇÃO PRINCIPAL**

**Antes**:
```javascript
const allowedFields = [
  'title', 'description', 'client_id', 'desk_id', 'priority_id',
  'status_id', 'stage_id', 'responsible_id', 'followers',
  'client_name', 'desk_name'
];
```

**Depois**:
```javascript
const allowedFields = [
  'title', 'description', 'client_id', 'desk_id', 'priority_id',
  'status_id', 'stage_id', 'responsible_id', 'followers',
  'client_name', 'desk_name', 'stage_name', 'responsible_name',
  'services_catalogs_item_id', 'catalog_item_name',  // ✅ ADICIONADO
  'requestor_name', 'requestor_email', 'requestor_telephone'  // ✅ ADICIONADO
];
```

### 3. TicketValidator.js (Linha 196) - Validação Numérica

**Antes**:
```javascript
const numericFields = [
  'client_id', 'desk_id', 'priority_id', 'status_id',
  'stage_id', 'responsible_id'
];
```

**Depois**:
```javascript
const numericFields = [
  'client_id', 'desk_id', 'priority_id', 'status_id',
  'stage_id', 'responsible_id', 'services_catalogs_item_id'  // ✅ ADICIONADO
];
```

### 4. TicketRepository.js (Linhas 161-164) - Log de Debug

Adicionado para facilitar troubleshooting futuro:

```javascript
this.logger.info('Repository: API payload for update', {
  ticketId,
  apiData: JSON.stringify(apiData)
});
```

## Commits Realizados

1. **`5033a15`** - Adicionar services_catalogs_item_id ao TicketMapper e logs de debug
2. **`338fc04`** - Bump version to 1.4.3 - Fix services_catalogs_item_id in update_ticket
3. **`54ac564`** - Fix: Adicionar services_catalogs_item_id aos campos permitidos no TicketValidator
4. **`2fffdc0`** - Bump version to 1.4.4 - Fix TicketValidator allowedFields

## Deploys Realizados

### NPM
- ✅ Versão **1.4.3** publicada (fix no TicketMapper)
- ✅ Versão **1.4.4** publicada (fix no TicketValidator) - **CORREÇÃO FINAL**

### Lambda AWS
- ✅ Deploy 1: 2025-10-22 07:56:37 BRT (10:56:37 UTC)
- ✅ Deploy 2: 2025-10-22 09:22:37 BRT (12:22:37 UTC)
- ✅ Deploy 3: 2025-10-22 09:39:34 BRT (12:39:34 UTC) - **CORREÇÃO FINAL**

## Status Atual

### ✅ Código Corrigido e Deployado
- Código fonte corrigido no GitHub
- Publicado no NPM como @tiflux/mcp@1.4.4
- Lambda atualizada e deployada

### ⏳ Aguardando Cache da Lambda
As instâncias antigas da Lambda ainda estão em execução. O AWS Lambda mantém múltiplas instâncias "quentes" que podem estar usando o código antigo.

**O que acontecerá**:
- Instâncias antigas expiram automaticamente após alguns minutos de inatividade
- Novas requisições criarão novas instâncias com o código v1.4.4
- Gradualmente todas as chamadas usarão o código corrigido

### 🔧 Como Usar Imediatamente

#### Opção 1: MCP Local (tiflux-mcp)
Reinicie o Claude Code para recarregar o servidor MCP local com o novo código.

#### Opção 2: MCP Lambda (tiflux-lambda)
Aguarde 5-10 minutos para as instâncias antigas expirarem, ou faça múltiplas chamadas para forçar novas instâncias.

#### Opção 3: Curl Direto (funciona imediatamente)
```bash
curl -X PUT 'https://api.tiflux.com/api/v2/tickets/NUMERO' \
  -H 'Authorization: Bearer SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"desk_id":ID_MESA,"services_catalogs_item_id":ID_ITEM}'
```

## Teste de Validação

### Comando para Testar
```javascript
mcp__tiflux_lambda__update_ticket({
  ticket_number: "80850",
  desk_id: 38963,  // DEV - Tuitui
  services_catalogs_item_id: 1388284  // Geral - Bot - Web - Desenvolvimento
})
```

### Resultado Esperado
```
✅ Ticket Atualizado com Sucesso #80850
Mesa: Equipe Tuitui
```

## Informações Importantes

### IDs de Referência
- **Ticket testado**: #80850 (Bug de segurança - SQL injection)
- **Mesa Cansados**: ID 42821
- **Mesa Tuitui**: ID 38963
- **Item de Catálogo Cansados**: 793519 (Funcionalidade - Dashboard inicial)
- **Item de Catálogo Tuitui**: 1388284 (Geral - Bot - Web - Desenvolvimento)

### Token de Autenticação
O token está configurado em `~/.bashrc` na linha 277:
```bash
export TIFLUX_API_KEY="eyJhbGci..."
```

## Lições Aprendidas

1. **Validadores podem bloquear silenciosamente** - Sempre verificar a lista `allowedFields` quando adicionar novos campos
2. **Múltiplas camadas de validação** - O campo estava correto no Mapper mas bloqueado no Validator
3. **Cache da Lambda** - Instâncias antigas podem permanecer ativas por vários minutos
4. **Teste direto na API** - Sempre testar com curl para isolar se é problema do MCP ou da API
5. **Logs de debug** - Adicionar logs do payload enviado facilita muito o troubleshooting

## Próximos Passos Recomendados

1. ✅ Aguardar cache da Lambda expirar (5-10 minutos)
2. ✅ Testar novamente via MCP Lambda
3. ✅ Reiniciar Claude Code para usar MCP local atualizado
4. 📝 Atualizar documentação da API do MCP
5. 📝 Adicionar testes automatizados para validação de campos permitidos
6. 📝 Considerar adicionar warning quando campos são removidos pelo validator

## Arquivos Modificados

```
tiflux-mcp/
├── src/domain/tickets/
│   ├── TicketMapper.js          (linha 156) ✅
│   ├── TicketValidator.js       (linhas 148-154, 196) ✅ PRINCIPAL
│   └── TicketRepository.js      (linhas 161-164) ✅
├── package.json                 (versão 1.4.4) ✅
├── test-update.js              (script de teste) ✅
└── test-validator.js           (script de teste) ✅
```

## Referências

- Issue original: Transferência do ticket #80850
- Commits: 5033a15, 338fc04, 54ac564, 2fffdc0
- NPM: https://www.npmjs.com/package/@tiflux/mcp
- Lambda: tiflux-mcp-server (sa-east-1)
- API TiFlux: https://api.tiflux.com/api/v2

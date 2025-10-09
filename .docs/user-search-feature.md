# Funcionalidade de Busca de Usuarios

## Visao Geral

A funcionalidade de busca de usuarios permite buscar usuarios por nome no TiFlux para usar como responsaveis em tickets, sem precisar saber o ID do usuario previamente.

## Componentes Implementados

### 1. API Client (src/api/tiflux-api.js)

**Metodo:** `searchUsers(filters)`

**Parametros:**
- `name` (string): Nome do usuario para busca parcial
- `active` (boolean, opcional): Filtrar usuarios ativos/inativos
- `type` (string, opcional): Tipo de usuario (client, attendant, admin)
- `limit` (number, opcional): Resultados por pagina (padrao: 20, maximo: 200)
- `offset` (number, opcional): Numero da pagina (padrao: 1)

**Endpoint:** `GET /users`

### 2. Handler (src/handlers/users.js)

**Classe:** `UserHandlers`

**Metodo:** `handleSearchUser(args)`

**Funcionalidade:**
- Busca usuarios por nome usando a API
- Retorna lista formatada com ID, nome, email, tipo e status
- Tratamento de erros robusto
- Suporte a paginacao

### 3. Schema MCP (src/schemas/users.js)

**Tool:** `search_user`

**Descricao:** Buscar usuarios no TiFlux por nome para usar como responsavel em tickets

**Parametros de entrada:**
- `name` (string, obrigatorio): Nome do usuario a ser buscado
- `type` (string, opcional): Tipo de usuario (enum: client, attendant, admin)
- `active` (boolean, opcional): Filtrar usuarios ativos/inativos
- `limit` (number, opcional): Numero de resultados por pagina
- `offset` (number, opcional): Numero da pagina

### 4. Integracao com Tickets

**Novos parametros adicionados:**

#### create_ticket
- `responsible_name` (string, opcional): Nome do responsavel para busca automatica

**Fluxo:**
1. Usuario fornece `responsible_name` em vez de `responsible_id`
2. Sistema busca usuarios ativos do tipo `attendant` com o nome fornecido
3. Se encontrar exatamente 1 usuario, usa o ID automaticamente
4. Se encontrar multiplos, retorna lista para usuario escolher
5. Se nao encontrar nenhum, retorna erro informativo

#### update_ticket
- `responsible_name` (string, opcional): Nome do responsavel para busca automatica

**Fluxo:** Identico ao create_ticket

## Exemplos de Uso

### 1. Buscar Usuario Diretamente

```json
{
  "name": "John",
  "type": "attendant",
  "active": true
}
```

**Resposta:**
```
Busca por "John"

Resultados encontrados: 3

Usuarios encontrados:
1. ID: 15 | Nome: John Smith | Email: john@company.com | Tipo: Atendente | Status: Ativo
2. ID: 42 | Nome: John Doe | Email: johndoe@company.com | Tipo: Atendente | Status: Ativo
3. ID: 87 | Nome: Johnny Walker | Email: jwalker@company.com | Tipo: Administrador | Status: Ativo

Para criar ou atualizar um ticket com responsavel, use o ID do usuario desejado no parametro `responsible_id`.
```

### 2. Criar Ticket com Responsavel por Nome

```json
{
  "title": "Novo ticket",
  "description": "Descricao do ticket",
  "responsible_name": "John Smith"
}
```

**Fluxo:**
- Sistema busca "John Smith" entre atendentes ativos
- Encontra usuario ID 15
- Cria ticket com `responsible_id: 15`

### 3. Atualizar Ticket com Responsavel por Nome

```json
{
  "ticket_number": "12345",
  "responsible_name": "Maria Silva"
}
```

**Fluxo:**
- Sistema busca "Maria Silva" entre atendentes ativos
- Encontra usuario ID 28
- Atualiza ticket com `responsible_id: 28`

## Tratamento de Erros

### Usuario Nao Encontrado
```
Usuario "inexistente" nao encontrado

Verifique se o nome esta correto ou use responsible_id diretamente.
```

### Multiplos Usuarios Encontrados
```
Multiplos usuarios encontrados para "John"

Usuarios encontrados:
1. ID: 15 | Nome: John Smith | Email: john@company.com
2. ID: 42 | Nome: John Doe | Email: johndoe@company.com

Use responsible_id especifico ou seja mais especifico no responsible_name.
```

### Erro de API
```
Erro ao buscar usuario "John"

Codigo: 401
Mensagem: Token de API invalido ou expirado

Verifique se o nome do usuario esta correto ou use responsible_id diretamente.
```

## Validacoes

### Busca de Usuarios
- `name` e obrigatorio
- `type` deve ser um dos valores: client, attendant, admin
- `limit` maximo: 200
- `offset` minimo: 1

### Busca Automatica em Tickets
- Apenas usuarios do tipo `attendant` podem ser responsaveis
- Apenas usuarios ativos sao buscados
- Limite de 10 resultados na busca automatica
- Se multiplos usuarios sao encontrados, retorna erro com lista

## Beneficios

1. **Experiencia do Usuario:** Nao precisa saber o ID do usuario previamente
2. **Flexibilidade:** Aceita tanto ID quanto nome
3. **Seguranca:** Apenas atendentes ativos podem ser responsaveis
4. **Clareza:** Mensagens de erro informativas
5. **Consistencia:** Mesmo padrao de busca usado para clientes e mesas

## Limitacoes

1. **Busca Parcial:** A API do TiFlux suporta apenas busca parcial (substring)
2. **Ambiguidade:** Se multiplos usuarios tem nomes similares, usuario deve ser mais especifico
3. **Tipo Fixo:** Na busca automatica de tickets, apenas atendentes sao considerados
4. **Performance:** Cada busca faz uma chamada a API

## Roadmap Futuro

1. Cache de usuarios frequentemente buscados
2. Suporte a busca por email alem de nome
3. Ordenacao customizada dos resultados
4. Filtros adicionais (grupo tecnico, permissoes)
5. Autocomplete inteligente baseado em historico

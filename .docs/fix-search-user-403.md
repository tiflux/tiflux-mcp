# Correcao da busca de usuarios no tiflux-mcp - Erro 403

## Ticket
- Numero: #86249
- Titulo: Corrigir busca de usuarios no tiflux-mcp - Erro 403

## Problema Identificado

A funcao `search_user` do tiflux-mcp estava retornando erro 403 (Access Denied) ao tentar buscar usuarios por nome.

### Causas Raiz

1. **Parametro invalido na API**: O codigo do MCP estava enviando o parametro `name` para o endpoint `GET /api/v2/users`, mas a API TiFlux nao aceita este parametro.

2. **Falta de permissao do usuario**: O usuario que gerou o token da API precisa ter a permissao `users_manage` para acessar o endpoint `/users`.

## Analise da Documentacao da API

Consultando a documentacao oficial em https://api.tiflux.com/api/v2/, o endpoint `GET /users` aceita apenas os seguintes parametros:

- `offset` (integer): Numero da pagina
- `limit` (integer): Quantidade de itens (max: 200)
- `active` (boolean): Filtrar usuarios ativos/inativos
- `gauth_enabled` (boolean): Filtrar por autenticacao 2FA
- `type` (string): Filtrar por tipo (client, attendant, admin)

**Nao existe parametro `name` para busca por nome.**

Endpoints disponiveis:
- `GET /users` - Lista usuarios com filtros limitados
- `GET /users/{id}` - Busca usuario por ID

## Solucao Implementada

### 1. Remocao do parametro invalido

Removido o parametro `name` que estava sendo enviado para a API:

```javascript
// ANTES (INCORRETO)
if (filters.name) {
  params.append('name', filters.name);
}

// DEPOIS (REMOVIDO)
// Parametro name nao e suportado pela API
```

### 2. Implementacao de filtro client-side

Como a API nao suporta busca por nome, implementamos filtragem client-side apos buscar os usuarios:

```javascript
// Buscar usuarios da API (sem filtro de nome)
const response = await this.makeRequest(endpoint);

// Filtrar por nome client-side se fornecido
if (response.data && filters.name) {
  const searchTerm = filters.name.toLowerCase().trim();
  response.data = response.data.filter(user => {
    const nameMatch = user.name && user.name.toLowerCase().includes(searchTerm);
    const emailMatch = user.email && user.email.toLowerCase().includes(searchTerm);
    return nameMatch || emailMatch;
  });

  // Limitar resultados ao limit solicitado
  if (filters.limit && filters.limit < response.data.length) {
    response.data = response.data.slice(0, filters.limit);
  }
}
```

### 3. Otimizacao do limite de busca

Para garantir que a filtragem client-side encontre resultados, o limite foi aumentado para 200 (maximo permitido pela API):

```javascript
const limit = 200; // Maximo permitido pela API
```

## Requisitos para Uso

Para que a busca de usuarios funcione, o usuario que gerou o token da API precisa ter a permissao `users_manage` configurada em sua role no TiFlux.

### Como verificar permissoes

1. Acessar TiFlux Web
2. Ir em Configuracoes > Usuarios
3. Editar o usuario que gerou o token
4. Verificar se a role possui a permissao `users_manage`

## Arquivos Modificados

- `/home/udo/code/tiflux/tiflux-mcp/src/api/tiflux-api.js`
  - Funcao `searchUsers()` (linhas 776-827)

## Comportamento Esperado

Apos a correcao:

1. A funcao busca todos os usuarios da API (ate 200)
2. Filtra localmente por nome ou email
3. Retorna apenas os usuarios que correspondem ao termo de busca
4. Limita os resultados ao `limit` especificado pelo usuario

## Limitacoes

- A busca retorna no maximo 200 usuarios por requisicao (limitacao da API)
- Se a organizacao tiver mais de 200 usuarios, pode ser necessario implementar paginacao
- O filtro client-side e case-insensitive e busca substring em nome e email

## Proximos Passos

1. Testar com token de usuario com permissao `users_manage`
2. Criar testes automatizados
3. Atualizar documentacao do MCP

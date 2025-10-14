# Atualização de Ticket com Item de Catálogo

## Visão Geral

Implementada funcionalidade para atualizar um ticket transferindo para outra mesa junto com um item de catálogo específico, seguindo o padrão da API TiFlux v2.

## Funcionalidade

Permite atualizar um ticket existente incluindo:
- Transferência de mesa (desk_id)
- Atribuição de item de catálogo (services_catalogs_item_id)

Esta funcionalidade é especialmente útil quando é necessário transferir um ticket para outra mesa e ao mesmo tempo definir o tipo de solicitação através do item de catálogo.

## Parâmetros Adicionados

### update_ticket

Novos parâmetros opcionais:

- services_catalogs_item_id (number): ID do item de catálogo para atualizar mesa com item específico
- catalog_item_name (string): Nome do item de catálogo para busca automática (requer desk_id ou desk_name)

## Exemplos de Uso

### Atualização com ID do Item de Catálogo

```javascript
{
  "ticket_number": "12345",
  "desk_id": 24,
  "services_catalogs_item_id": 7
}
```

### Atualização com Nome do Item de Catálogo

```javascript
{
  "ticket_number": "12345",
  "desk_name": "Suporte",
  "catalog_item_name": "Instalação"
}
```

## Lógica de Resolução

### Busca por Nome de Item de Catálogo

1. Valida se desk_id ou desk_name foi fornecido (obrigatório para busca)
2. Resolve desk_name em desk_id se necessário
3. Busca itens de catálogo na mesa (limit: 200)
4. Filtra por nome usando busca parcial case-insensitive
5. Retorna erro se:
   - Nenhum item encontrado
   - Múltiplos itens encontrados (solicita ser mais específico)
6. Usa o ID do item encontrado

## Comportamento da API

Conforme documentação da API TiFlux v2, ao enviar:

```json
{
  "desk_id": 24,
  "services_catalogs_item_id": 7
}
```

O sistema:
1. Transfere o ticket para a mesa especificada
2. Atribui o item de catálogo ao ticket
3. Pode alterar automaticamente outros campos dependendo da configuração da mesa (prioridade, estágio, etc.)

## Validações Implementadas

- desk_id ou desk_name obrigatório quando usar catalog_item_name
- Busca retorna erro se múltiplos itens com mesmo nome
- Busca case-insensitive para facilitar uso
- Validação de existência dos itens de catálogo na mesa

## Mensagens de Retorno

### Sucesso
```
Ticket #12345 atualizado com sucesso

Alterações realizadas:
- Mesa transferida: ID 24
- Item de Catálogo ID: 7

Atualizado em: 2025-01-14T10:30:00Z
```

### Erros Comuns

1. Mesa não informada:
```
Erro: desk_id ou desk_name obrigatorio para buscar item de catalogo por nome
Para usar catalog_item_name, informe tambem desk_id ou desk_name.
```

2. Item não encontrado:
```
Item de catalogo "xyz" nao encontrado
Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.
```

3. Múltiplos itens encontrados:
```
Multiplos itens de catalogo encontrados para "instalacao"

Itens de catalogo encontrados:
1. ID: 7 | Nome: Instalação de Software | Area: TI | Catalogo: Serviços
2. ID: 15 | Nome: Instalação de Hardware | Area: TI | Catalogo: Serviços

Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.
```

## Arquivos Modificados

- src/schemas/tickets.js - Adicionado parâmetros ao schema de update_ticket
- src/handlers/tickets.js - Implementada lógica de resolução e atualização
- README.md - Documentação atualizada

## Referências

- API TiFlux v2: https://api.tiflux.com/api/v2/#put-/tickets/-ticket_number-
- Exemplo da documentação: "Atualizar mesa do ticket com item de catálogo"

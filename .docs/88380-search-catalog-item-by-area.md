# Ticket #88380 - Busca de itens de catalogo por area_id e catalog_id

## Problema

A ferramenta `search_catalog_item` do MCP TiFlux exigia um nome especifico (`catalog_item_name`) para buscar itens de catalogo. Nao era possivel listar todos os itens de uma area ou catalogo especifico.

## Solucao Implementada

Tornar o parametro `catalog_item_name` opcional quando `area_id` ou `catalog_id` forem fornecidos, permitindo listar todos os itens daquela area/catalogo.

## Alteracoes

### src/schemas/catalog_items.js

- Atualizado `required` de `['catalog_item_name']` para `[]`
- Atualizada descricao da ferramenta para explicar o novo comportamento
- Atualizadas descricoes dos parametros `area_id` e `catalog_id`

### src/handlers/catalog_items.js

- Alterada validacao para aceitar `catalog_item_name` OU `area_id` OU `catalog_id`
- Adicionada logica para listar todos itens quando `catalog_item_name` nao e fornecido
- Formato de saida diferente para listagem vs busca por nome:
  - Busca por nome: retorna item unico com detalhes
  - Listagem: retorna lista formatada com todos os itens

## Exemplos de Uso

### Listar todos itens de uma area
```
search_catalog_item(desk_name="Cansados", area_id=1152)
```

### Listar todos itens de um catalogo
```
search_catalog_item(desk_id=42821, catalog_id=500)
```

### Buscar por nome (comportamento original)
```
search_catalog_item(desk_name="Cansados", catalog_item_name="Bug")
```

### Combinar nome com area/catalogo para filtrar
```
search_catalog_item(desk_name="Cansados", catalog_item_name="Task", area_id=1152)
```

## Deploy

Apos merge, fazer deploy da Lambda para aplicar as alteracoes.

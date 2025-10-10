# Como Configurar TiFlux MCP no Claude Code

## Passos para Adicionar

### 1. Abrir Configurações MCP

No Claude Code, execute o comando:
```
Cmd/Ctrl + Shift + P > MCP: Edit MCP Settings
```

Ou edite diretamente o arquivo:
```bash
code ~/.config/Claude/claude_desktop_config.json
```

### 2. Adicionar Servidor TiFlux Lambda

Adicione esta configuração:

```json
{
  "mcpServers": {
    "tiflux-lambda": {
      "url": "https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp",
      "headers": {
        "x-tiflux-api-key": "eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJiNmM1MWFkNi1jMTI4LTQwYTUtODVkZS1iMjY1N2Q1NzM2ODgiLCJzdWIiOjE4MDEsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc1OTc0NzEyNSwicmVxX2xpbWl0IjoxMjAsImV4cCI6MTgyMjg2MTAyOX0.runTOXkREzNFoU_tuLqhRXA0IQCk5vGUcUMucoovx20"
      }
    }
  }
}
```

**IMPORTANTE:** Claude Code suporta MCP via HTTP nativamente desde versão recente. Se não funcionar, você tem 2 opções:

### Opção A: Via npx mcp-remote (se HTTP não funcionar)

```json
{
  "mcpServers": {
    "tiflux-lambda": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/mcp",
        "--header",
        "x-tiflux-api-key:eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJiNmM1MWFkNi1jMTI4LTQwYTUtODVkZS1iMjY1N2Q1NzM2ODgiLCJzdWIiOjE4MDEsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc1OTc0NzEyNSwicmVxX2xpbWl0IjoxMjAsImV4cCI6MTgyMjg2MTAyOX0.runTOXkREzNFoU_tuLqhRXA0IQCk5vGUcUMucoovx20"
      ]
    }
  }
}
```

### Opção B: Via npm package local

```json
{
  "mcpServers": {
    "tiflux-local": {
      "command": "node",
      "args": ["/home/udo/code/tiflux/tiflux-mcp/server-sdk.js"],
      "env": {
        "TIFLUX_API_KEY": "eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJiNmM1MWFkNi1jMTI4LTQwYTUtODVkZS1iMjY1N2Q1NzM2ODgiLCJzdWIiOjE4MDEsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc1OTc0NzEyNSwicmVxX2xpbWl0IjoxMjAsImV4cCI6MTgyMjg2MTAyOX0.runTOXkREzNFoU_tuLqhRXA0IQCk5vGUcUMucoovx20"
      }
    }
  }
}
```

### 3. Reiniciar Claude Code

Após salvar as configurações:
1. Feche completamente o Claude Code
2. Abra novamente
3. O servidor TiFlux deve aparecer na lista de MCPs

### 4. Verificar se Funcionou

No Claude Code, pergunte:
```
Quais ferramentas você tem disponíveis do TiFlux?
```

Deve listar as 16 ferramentas:
- get_ticket
- create_ticket
- update_ticket
- cancel_ticket
- close_ticket
- list_tickets
- create_ticket_answer
- update_ticket_entities
- get_ticket_files
- search_client
- search_user
- search_stage
- search_catalog_item
- create_internal_communication
- list_internal_communications
- get_internal_communication

### 5. Testar uma Ferramenta

Pergunte ao Claude Code:
```
Busque o ticket #85532 do TiFlux
```

Deve retornar os dados do ticket.

---

## Troubleshooting

### Erro: "MCP server not found"

**Solução:**
1. Verificar se o arquivo de config está no local correto
2. Verificar sintaxe JSON (sem vírgulas extras)
3. Reiniciar Claude Code

### Erro: "Connection failed"

**Solução:**
1. Testar URL no navegador: https://yvjwf4d5u32bk6rwcxuuvghyom0fbxob.lambda-url.sa-east-1.on.aws/health
2. Verificar se API key está correta
3. Verificar se Lambda está ativo no AWS Console

### Erro: "Unauthorized"

**Solução:**
1. Verificar se header `x-tiflux-api-key` está presente
2. Gerar nova API key em https://app.tiflux.com.br/settings/api
3. Atualizar no arquivo de config

---

## Exemplos de Uso no Claude Code

### Buscar Ticket
```
Me mostre os detalhes do ticket #85532
```

### Buscar Cliente
```
Encontre clientes com nome "Tiflux"
```

### Listar Tickets
```
Liste os últimos 10 tickets da mesa de Suporte
```

### Criar Ticket
```
Crie um ticket com título "Teste" e descrição "Ticket de teste"
para o cliente "Produto Tiflux"
```

---

## Diferenças: Lambda vs Local

| Aspecto | Lambda (Opção A) | Local (Opção B) |
|---------|------------------|-----------------|
| Disponibilidade | 24/7 na nuvem | Apenas quando PC ligado |
| Latência | ~500ms | ~50ms |
| Custos | $0-5/mês | Grátis |
| Atualizações | Precisa redeploy | Instantâneo (código local) |
| Escalabilidade | Infinita (AWS) | Limitada (1 processo) |

**Recomendação:** Use Lambda (Opção A) para produção e Local (Opção B) para desenvolvimento.

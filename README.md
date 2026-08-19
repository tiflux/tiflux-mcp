# Tiflux MCP Server

Conecte **Claude**, **ChatGPT** e outros clientes de IA à sua conta Tiflux para abrir, atualizar e consultar tickets em seu nome — sem instalar nada. Servidor MCP (Model Context Protocol) hospedado em `https://mcp.tiflux.com`.

> **English:** this README is primarily in Portuguese (pt-BR). The full tool catalog ([Available Tools](#available-tools)) is in English, and local usage via `npx` is documented under [Avançado: execução local](#avançado-execução-local-sdk-via-npx).

## Pré-requisitos e modelo de uso

- **Licença API ativa** na sua conta Tiflux — é o único pré-requisito para usar o MCP.

**Como gerar sua chave de API:**

1. Acesse o Tiflux e faça login em [app.tiflux.com](https://app.tiflux.com/)
2. Clique na sua foto no canto superior direito → **Minha conta**
3. Abra a aba **Sessões**
4. Em **Sessões API**, clique em **"Gerar novo token de sessão"**
5. Copie a chave gerada — é ela que você vai usar para conectar

> [!IMPORTANT]
> Todas as ações feitas via MCP — abrir e movimentar tickets, responder, criar apontamentos etc. — são **registradas em nome do usuário dono da chave de API**. Para uso operacional no dia a dia, **cada pessoa da equipe deve ter sua própria licença API e sua própria chave**. Não compartilhe uma mesma chave entre vários usuários.

## Como conectar

O caminho recomendado é o **servidor hospedado** (`https://mcp.tiflux.com`): sempre atualizado, sem instalação e com autenticação segura via OAuth 2.0 ou chave de API.

### Claude (claude.ai — web)

1. Acesse [claude.ai](https://claude.ai) → **Configurações** → **Conectores**
2. Clique em **Adicionar conector personalizado**
3. Cole a URL do servidor:

   ```
   https://mcp.tiflux.com
   ```

   > ⚠️ Sem `/mcp` no final — o conector usa a URL raiz.

4. Clique em **Conectar** — a página de autorização do Tiflux abre automaticamente
5. Cole sua chave de API e clique em **Autorizar**

Pronto: por trás, a plataforma recebe um token OAuth 2.0 e o usa em todas as requisições seguintes — você não precisa manusear a chave novamente.

### ChatGPT (web)

1. Acesse **Configurações** → **Conectores** (ou, ao criar um GPT, **Adicionar** um conector)
2. Adicione um conector personalizado apontando para:

   ```
   https://mcp.tiflux.com
   ```

3. Conclua a autorização colando sua chave de API na página do Tiflux

> A disponibilidade de conectores MCP no ChatGPT depende do plano e do modo da sua conta.

### Claude Desktop

Mesmo fluxo do claude.ai: **Configurações** → **Conectores** → **Adicionar conector personalizado** → colar `https://mcp.tiflux.com` → **Conectar** → autorizar com a chave de API. Veja o passo a passo em [Claude (claude.ai — web)](#claude-claudeai--web).

### Claude Code

Adicione o servidor remoto com um único comando:

```bash
claude mcp add tiflux --transport http https://mcp.tiflux.com/mcp --header "x-tiflux-api-key:SUA_CHAVE" -s project
```

Ou configure manualmente em `.claude/settings.json` ou `~/.claude.json`:

```json
{
  "mcpServers": {
    "tiflux": {
      "type": "url",
      "url": "https://mcp.tiflux.com/mcp",
      "headers": {
        "x-tiflux-api-key": "SUA_CHAVE"
      }
    }
  }
}
```

> ⚠️ Aqui a URL **tem** `/mcp` no final (`https://mcp.tiflux.com/mcp`) — diferente do conector web, que usa a URL raiz.

Alternativa para cenários específicos: execução local via `npx` — veja [Avançado: execução local (SDK via npx)](#avançado-execução-local-sdk-via-npx).

### n8n

Use o node **MCP Client Tool** apontando para o servidor hospedado:

1. Adicione o node **MCP Client Tool** ao seu workflow
2. **Endpoint:** `https://mcp.tiflux.com/mcp` (transporte HTTP Streamable)
3. **Autenticação:** credencial do tipo **Header Auth** com nome `x-tiflux-api-key` e valor igual à sua chave de API

### Manus AI

1. Nas configurações do Manus, adicione um novo conector MCP — abre a tela **Configuração do MCP**
2. Preencha os campos:
   - **Nome do servidor:** `Tiflux`
   - **Tipo de transporte:** `HTTP`
   - **URL do servidor:**

     ```
     https://mcp.tiflux.com
     ```

3. Em **Cabeçalhos personalizados**, clique em **Adicionar cabeçalho personalizado** e preencha:
   - **Nome do cabeçalho:** `x-tiflux-api-key`
   - **Valor do cabeçalho:** sua chave de API
4. Clique em **Salvar** — use **Experimente** para testar a conexão

### Outros clientes MCP

Qualquer cliente MCP funciona com o servidor hospedado:

- **Cliente com transporte HTTP + headers:** URL `https://mcp.tiflux.com/mcp` + header `x-tiflux-api-key: SUA_CHAVE`
- **Cliente com suporte a OAuth 2.0 (conectores):** URL raiz `https://mcp.tiflux.com`

**Endpoints:**

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `/mcp` | GET | Não | Informações do servidor |
| `/mcp` | POST | Sim | Operações MCP |
| `/health` | GET | Não | Health check |

**Métodos de autenticação:**

| Método | Header | Quando usar |
|--------|--------|-------------|
| Chave de API (direta) | `x-tiflux-api-key: SUA_CHAVE` | Claude Code, n8n, Manus AI, scripts, SDK local |
| Bearer token (OAuth) | `Authorization: Bearer <token>` | Claude.ai, ChatGPT, conectores web |

## Funcionalidades

- **Tickets**: criar, consultar, atualizar, fechar, cancelar, reabrir e listar tickets com filtros avançados — incluindo transferência de mesa, histórico de estágios e SLA; relatório de avaliações de atendimento (CSAT) com comparação de período (`get_tickets_feedback_report`)
- **Comunicações internas e respostas**: criar, listar, editar e excluir comunicações internas e respostas de tickets, com anexos (até 10 arquivos de 25MB cada)
- **Apontamentos de horas**: criar e listar apontamentos de trabalho em tickets; listagem global por período com filtros server-side (`list_appointments_global`); relatório agregado de apoio N2 por técnico e mesa com totalizadores (`list_appointments_report`)
- **Chats (WhatsApp)**: listar caixa de entrada/meus/em atendimento/arquivados, ler o conteúdo/mensagens de um chat (`list_chat_messages`), transferir e vincular chats, enviar mensagens e finalizar atendimentos; relatório de avaliações de atendimento (CSAT) com comparação de período (`get_chats_feedback_report`)
- **Clientes**: CRUD completo — dados cadastrais, mesas e grupos técnicos vinculados, usuários do portal e permissões de e-mail
- **Usuários/Agentes** (admin): criar, consultar e atualizar agentes/atendentes — incluindo licenças, grupo técnico por nome e ativar/inativar (requer chave de administrador)
- **Solicitantes**: buscar, criar, atualizar e gerenciar solicitantes, com resolução automática de nome/e-mail ao abrir tickets
- **Mesas e catálogo**: explorar mesas, estágios, prioridades e itens de catálogo sem sair do chat
- **Campos personalizados**: descobrir entidades, campos e opções para preencher campos customizados corretamente
- **Base de conhecimento**: listar e criar artigos, com busca por título/tags e filtro por pasta
- **Contratos**: listar contratos da organização (somente leitura) com filtros por cliente, tipo e status
- **Recursos (Equipamentos)**: listar, criar e atualizar equipamentos/ativos de clientes; exibir detalhes completos de hardware e inventário de um recurso individual (processador, memória, discos, rede, SO, fabricante, campos personalizados) via `get_equipment`; consultar softwares instalados (inventário via agente); explorar grupos e tipos de recursos para montar fluxos de inventário de TI via IA
- **Pré-Tickets**: listar e criar pré-tickets (solicitações em estágio pré-triagem, ainda não convertidas em tickets), com suporte a anexos (até 10 arquivos de 25MB cada)
- **Templates de Mensagem**: listar templates HSM aprovados para WhatsApp via Gupshup (`list_gupshup_templates`) e WhatsApp Cloud/Meta (`list_whatsapp_cloud_templates`), para alimentar o fluxo de `send_message` com `template_id`
- **Faturamentos**: consultar o histórico de faturamentos da organização com filtros por período de emissão, vencimento, cliente (por ID ou nome), NFe, ticket e situação (`get_billings_history`); exige permissão "Faturar serviços avulsos e contratos" e licença Tickets
- **Catálogo de serviços (CRUD)**: criar, listar, atualizar e remover catálogos, áreas e itens de catálogo nos três níveis da hierarquia (catálogo → área → item); remoção em cascata com contagem pre-flight informativa (não é gate: não há confirmação nem dry-run); resolução automática de nome em todos os níveis (`services_catalog_name`, `area_name`); requer role `service_catalogs_manage`

O catálogo completo, com parâmetros e exemplos de cada ferramenta, está em [Available Tools](#available-tools) (em inglês).

## Configuração avançada

### Verbosidade das respostas

O servidor suporta dois modos de verbosidade para controlar o consumo de tokens:

| Modo | Descrição |
|------|-----------|
| `rich` | Saída completa em Markdown com emojis, rodapés e blocos de paginação detalhados (padrão) |
| `compact` | Saída enxuta — sem rodapé decorativo, resumo de paginação em uma linha, `get_ticket` omite flags de baixo valor e trunca descrições longas, `list_tickets` usa linhas ultracompactas por ticket |

**SDK (stdio) — variável de ambiente:**

```bash
TIFLUX_MCP_VERBOSITY=compact npx @tiflux/mcp@latest
```

**Server (HTTP/Lambda) — header por requisição:**

```
x-tiflux-verbosity: compact
```

> O padrão é `rich` nos dois modos. Integrações existentes não são afetadas a menos que a variável de ambiente ou o header seja definido.

### Dicas para reduzir consumo de tokens

Ao construir aplicações que chamam este servidor MCP programaticamente, o custo de tokens importa. Siga estas orientações:

- **Passe IDs quando já os tiver.** Toda ferramenta que aceita um parâmetro `_name` para auto-resolução (ex.: `desk_name`, `stage_name`, `entity_field_name`) fará uma ou mais chamadas extras à API para resolver o nome. Se você guardou o ID de uma chamada anterior, passe-o diretamente (ex.: `desk_id`, `stage_id`, `entity_field_id`) — é sempre mais rápido e barato.
- **Use verbosidade `compact`** via `TIFLUX_MCP_VERBOSITY=compact` (SDK) ou header `x-tiflux-verbosity: compact` (Server). O modo compact corta a saída de `get_ticket` e `list_tickets` em ~50%.
- **Pagine deliberadamente.** `list_tickets` com um intervalo de datas amplo em uma mesa movimentada pode retornar centenas de itens. Passe `limit` e `offset` intencionalmente — quando uma página cheia retorna, o modo compact acrescenta uma dica de próxima página (`→ offset: N`) para o modelo saber que pode haver mais a buscar.
- **Para análise comparativa, use `get_tickets_comparison`.** Em vez de chamar `list_tickets` paginada duas vezes para dois períodos (o que pode ultrapassar 100k tokens e o teto de 6 iterações do orquestrador), use `get_tickets_comparison`: uma chamada MCP, 2 requests à API, resposta de centenas de tokens com totais, Δ e buckets pareados prontos para gráfico.

## Available Tools

### get_ticket
Retrieve a specific ticket by ID with comprehensive information including status, priority, desk, stage, catalog, responsible, client, audit data, SLA and URLs.

**Parameters:**
- `ticket_number` (string, required): Number of the ticket to retrieve
- `show_entities` (boolean, optional): Include ALL custom fields linked to the ticket
- `include_filled_entity` (boolean, optional): Include only custom fields with filled values

**Returns:**
Comprehensive ticket information including:
- Status (ID, name, open/closed flags)
- Priority (ID, name)
- Desk (ID, internal name, display name, active status)
- Stage (ID, name, first/last stage flags, max time)
- Service Catalog (item ID, item name, area, catalog)
- Responsible (ID, name, email, type, technical group)
- Client (ID, name, social reason, active status)
- Audit (created by ID, origin, created/updated dates)
- SLA (status, expirations, deadlines)
- Additional info (followers, worked hours, reopens, internal/external URLs)
- Custom fields: when present, includes field type, current value, `required` flag (shown as `(obrigatório)` suffix), and options already set for `single_select`/`checkbox` fields (with IDs for `list_entity_field_options`)

**New in v1.4.0:** Expanded fields for complete ticket metadata in a single call.

### create_ticket
Create a new ticket in Tiflux.

**Parameters:**
- `title` (string, required): Ticket title
- `description` (string, required): Ticket description. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.
- `client_id` (number, optional): Client (company) ID
- `client_name` (string, optional): Client (company) name for automatic search (alternative to client_id). Use only when the user says "client" or "company" explicitly.
- `desk_id` (number, optional): Desk ID
- `desk_name` (string, optional): Desk/team name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution). **Prefer this when the user references a name without qualifying the entity.**
- `priority_id` (number, optional): Priority ID
- `services_catalogs_item_id` (number, optional): Service catalog item ID
- `catalog_item_name` (string, optional): Catalog item name for automatic search (alternative to services_catalogs_item_id, requires desk_id or desk_name)
- `status_id` (number, optional): Status ID
- `requestor_id` (number, optional): Requestor ID (person who opens the ticket, must belong to the selected client). This is the **canonical link** — prefer it when you know the ID. Highest precedence: if provided, it is used directly with no resolution.
- `requestor_name` (string, optional): Requestor name. Used **only** when neither `requestor_id` nor `requestor_email` is provided. The MCP attempts to resolve it to an existing `requestor_id` (avoids creating a "ghost" requestor) via `GET /requestors`, falling back to the client-scoped `GET /clients/{id}/requestors` on 403. Multiple matches → returns a list to disambiguate; no match → sends the name as-is (the API resolves/creates the requestor).
- `requestor_email` (string, optional): Requestor email. The MCP automatically attempts to resolve it to an existing `requestor_id` by searching the client's requestors (the canonical link). **One match → uses the `requestor_id` and drops the raw email; zero matches → keeps the raw email as a fallback; multiple matches → returns a list to disambiguate.** Has precedence over `requestor_name`.
- `requestor_telephone` (string, optional): Requestor phone

> **Requestor precedence (v2.18.0):** the canonical link is `requestor_id`. The MCP resolves email and name to `requestor_id` automatically when a matching registration exists, in the order **`requestor_id` > `requestor_email` > `requestor_name`**. When email or name resolves to an ID, the individual fields (name/email/telephone) are dropped from the payload so the registered requestor is linked instead of a loose/ghost entry. A raw email is only sent when no registration matches.
- `responsible_id` (number, optional): Responsible user ID
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `followers` (string, optional): Comma-separated follower emails
- `parent_ticket_number` (number, optional): Parent ticket number — the created ticket will be linked as a child of this ticket
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.png"}]` (max 10 files, 25MB each)

**New in v2.4.0:** Support for base64 file upload via `files_base64`. The ticket is sent as `multipart/form-data`. **Note for Server mode (Lambda):** `files_base64` payloads are subject to the 6MB API Gateway limit.

> **Breaking change (v2.8.0):** O parametro `files` (caminhos locais) foi removido. Use a nova tool `upload_ticket_files` para enviar arquivos via base64, ou passe os arquivos diretamente via `files_base64`.

### update_ticket
Update an existing ticket in Tiflux. Supports transferring a ticket to another desk — when `desk_id`/`desk_name` is provided without an explicit `stage_id`/`stage_name`, the MCP automatically resolves the first stage of the destination desk (the stage with `first_stage: true`, or the one with the lowest index as a fallback), preventing invalid-stage errors.

**Parameters:**
- `ticket_number` (string, required): Number of the ticket to update (e.g. "123", "456")
- `title` (string, optional): New ticket title
- `description` (string, optional): New ticket description. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.
- `client_id` (number, optional): New client ID
- `desk_id` (number, optional): New desk ID. Transfers the ticket to the specified desk. Stages and priorities are scoped per desk — if no stage is provided, the MCP auto-resolves the first stage of the destination desk.
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution). **Prefer this when the user references a name without qualifying the entity.**
- `stage_id` (number, optional): Stage/phase ID. Always takes precedence over auto-resolution.
- `stage_name` (string, optional): Stage name for automatic search (alternative to stage_id, requires desk_id or desk_name). Always takes precedence over auto-resolution.
- `priority_id` (number, optional): Priority ID. Priorities are scoped per desk — use `list_desk_priorities` to discover valid IDs for the destination desk. When transferring desks, provide this field (or `priority_name`) to preserve the ticket's priority (priorities are not automatically preserved across desk transfers).
- `priority_name` (string, optional): Priority name for automatic search (requires `desk_id` or `desk_name` to resolve). **Because it requires a desk, the API treats it as a transfer — so `priority_name` only works when transferring to another desk.** To change priority on the ticket's **current** desk, use `priority_id` directly (no desk).
- `priority_change_reason` (string, optional): Reason for the priority change (free text). **Required** when changing priority (`priority_id`) **outside** of a desk transfer — the API rejects `priority_id` without it (`42201`). **Not allowed** during a desk transfer — the API rejects it (`42202`); in that case it is dropped automatically and a warning is shown.
- `status_id` (number, optional): Status ID. There is no status listing endpoint in the API v2 — provide the ID directly (no `status_name`).
- `responsible_id` (number, optional): Responsible user ID (use null to unassign)
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `requestor_id` (number, optional): New requestor (ticket opener) ID. The requestor must belong to the same client linked to the ticket. When provided together with `requestor_name`, `requestor_id` takes precedence.
- `requestor_name` (string, optional): Requestor name for automatic resolution (alternative to `requestor_id`). The MCP tries `GET /requestors` (global) and falls back to `GET /clients/{id}/requestors` on 403. Single match → uses the ID; multiple matches → lists candidates to disambiguate; no match → error suggesting `search_requestor`. If both endpoints return 403, returns a clear message suggesting `requestor_id` directly.
- `followers` (string, optional): Comma-separated follower emails. **⚠️ REPLACES the full followers list** — to add without removing, fetch current followers via `get_ticket` first and send the complete list (existing + new). Empty string `""` removes all followers.
- `services_catalogs_item_id` (number, optional): Catalog item ID for updating desk with specific item
- `catalog_item_name` (string, optional): Catalog item name for automatic search (alternative to services_catalogs_item_id, requires desk_id or desk_name)

**Note:** At least one optional field must be provided along with the `ticket_number`.

**Desk Transfer Prerequisites:**
1. **Desk relationship** — origin and destination desks must be **linked** in Tiflux settings. Without this the API rejects the transfer with a `42202` error.
2. **Catalog item for destination desk** — desks that require a service catalog reject the transfer without `services_catalogs_item_id`/`catalog_item_name` of the destination desk.
3. **Priority is not preserved** — priority is scoped per desk and is **lost** on transfer (becomes `null`). Provide `priority_name`/`priority_id` to preserve it. Status is automatically reallocated by the API.

**Priority change rules** (enforced by the API v2):
- **Same desk (no transfer):** use `priority_id` directly (no `desk_id`/`desk_name`). `priority_change_reason` is **required** (`42201` otherwise). `priority_name` does **not** work here — it requires a desk, which the API interprets as a transfer.
- **During a desk transfer:** provide `priority_id` or `priority_name` to preserve priority; do **not** send `priority_change_reason` (`42202` otherwise — it is dropped automatically with a warning).

**Error messages:** Common `42202` transfer errors (missing desk relationship, required catalog) are returned as actionable messages instead of raw API text.

### update_ticket_entities
Update custom fields (entities) of a ticket in Tiflux. Supports up to 50 fields per request. For checkbox fields with multiple named options, send one item per option with `entity_field_option_id`. Use `list_entity_field_options` to discover option IDs.

> **Tip:** Prefer `entity_field_id` (numeric) when available — it avoids extra API calls. Use the `_name` params only when you don't have the ID yet.

**Parameters:**
- `ticket_number` (string, required): Ticket number to update
- `entities` (array, required): List of custom fields to update. For multiple-choice checkbox fields, send one item per option.

**Entity Object Structure:**
- `entity_field_id` (number): Custom field ID (obtained via `get_ticket` or `list_entity_fields`). Prefer this when available.
- `entity_name` (string, optional): Entity group name for automatic `entity_field_id` resolution — alternative when the ID is unknown.
- `entity_field_name` (string, optional): Field name within the entity group for automatic `entity_field_id` resolution — use together with `entity_name`.
- `entity_field_option_name` (string, optional): Option name for automatic `entity_field_option_id` resolution (for `single_select`/`checkbox` fields).
- `value` (string, required): Field value. Accepted types:
  - `text`: string
  - `text_area`: string
  - `currency`: float as string (e.g., "150.55")
  - `phone`: numbers only (e.g., "47999999999")
  - `email`: string
  - `link`: URL starting with http/https/ftp
  - `date`: format YYYY-MM-DD
  - `single_select`: option ID as string
  - `checkbox`: boolean as string `"true"`/`"false"`
  - Use `null` to clear non-required fields
- `entity_field_option_id` (number, optional): Option ID for checkbox multiple-choice fields. Use `list_entity_field_options` to get IDs. For multiple-choice checkboxes, send one item per option with the same `entity_field_id` and different `entity_field_option_id`.
- `country_code` (string, optional): Country code (for phone fields outside Brazil)

**Example — simple text/date fields (with IDs, most efficient):**
```json
{
  "ticket_number": "123",
  "entities": [
    { "entity_field_id": 72, "value": "New value" },
    { "entity_field_id": 73, "value": "2025-01-15" }
  ]
}
```

**Example — resolving by name (when IDs are unknown):**
```json
{
  "ticket_number": "123",
  "entities": [
    {
      "entity_name": "Contrato",
      "entity_field_name": "Tipo de contrato",
      "entity_field_option_name": "Suporte Premium",
      "value": "true"
    }
  ]
}
```

**Example — checkbox with multiple named options:**
```json
{
  "ticket_number": "12345",
  "entities": [
    { "entity_field_id": 81, "entity_field_option_id": 11, "value": "true" },
    { "entity_field_id": 81, "entity_field_option_id": 12, "value": "false" },
    { "entity_field_id": 81, "entity_field_option_id": 13, "value": "true" }
  ]
}
```

### cancel_ticket
Cancel a specific ticket in Tiflux.

**Parameters:**
- `ticket_number` (string, required): Ticket number to be cancelled (e.g., "37", "123")

**Example:**
```json
{
  "ticket_number": "84429"
}
```

### list_tickets
List tickets with filtering options. Catalog and priority are automatically shown in every ticket card — no extra API calls needed (already included in `GET /tickets` response).

**Parameters:**
- `desk_ids` (string, optional): Comma-separated desk IDs (e.g., "1,2,3")
- `desk_name` (string, optional): Desk/team name for automatic ID resolution. Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution). **Prefer this field when the user references a name without qualifying the entity.**
- `client_ids` (string, optional): Comma-separated client (company) IDs (e.g., "1,2,3")
- `client_name` (string, optional): Client (company) name for automatic search. Use **only** when the user explicitly says "client", "company", or gives a known corporate name. For a person, prefer `requestor_email`.
- `stage_ids` (string, optional): Comma-separated stage IDs (e.g., "1,2,3")
- `stage_name` (string, optional): Stage name — use with `desk_name` or `desk_ids` (either works)
- `responsible_ids` (string, optional): Comma-separated responsible (assigned attendant) user IDs (use when you already have the ID)
- `responsible_name` (string, optional): Responsible user name for automatic resolution. Works for both admin (via `GET /users`) and non-admin users (via attendant groups fallback). Use when the user says "assigned to" / "responsible" and gives a name.
- `requestor_ids` (string, optional): Comma-separated requestor (person who opened the ticket) IDs (e.g., "1,2,3"). Use for filtering by **person** (not company). Resolve the ID via `search_requestor`.
- `requestor_email` (string, optional): Email of the requestor (person who opened the ticket). Use when the user references a **person** or provides an email directly. Avoids a round-trip to resolve the ID.
- `services_catalogs_item_ids` (string, optional): Comma-separated service catalog item IDs (e.g., "11,12,13"). Passthrough directly to the API — **max 15 IDs** (the `GET /tickets` limit; beyond that only the first 15 are applied, with a warning). Duplicates are removed. Use when you already know the IDs (via `search_catalog_item`). For name/area/catalog text search, use `catalog_query`.
- `catalog_query` (string, optional): Free-text search term to filter by service catalog. Matches partially against catalog name, area name, and item name server-side — a single term like `"security"` returns items from all areas/catalogs whose name contains that term. **Requires a desk** (`desk_id` or `desk_name`). For precise IDs, use `services_catalogs_item_ids`.
- `priority_ids` (string, optional): Comma-separated priority IDs (e.g., "17,18"). Passthrough directly to the API — **max 15 IDs** (the `GET /tickets` limit; duplicates removed). Use when you already know the IDs (via `list_desk_priorities`). For name-based search, use `priority_name`.
- `priority_name` (string, optional): Priority name for automatic fuzzy resolution (e.g., "high", "baixa"). **Requires a desk** (`desk_id` or `desk_name`). For direct IDs, use `priority_ids`.
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 200)
- `is_closed` (boolean, optional): Legacy status flag. Prefer `filter_by` for more granular control. `is_closed: true` = only closed; `is_closed: false` = only open.
- `filter_by` (string, optional): Status filter with precedence over `is_closed`: "open" (open tickets only), "closed" (resolved/closed, excludes cancelled), "canceled" (cancelled only — robust with custom status names), or "all" (all statuses). Under `date_type="solved_in_time"`, "all" returns closed + cancelled together. **If omitted with `date_type="solved_in_time"`, the MCP assumes `"closed"` and announces this in the response** — use `"all"` to include cancelled too.
- `date_type` (string, optional): Date axis for filtering: "created_at" (creation date, default) or "solved_in_time" (closing/resolution date). Accepts timezone offsets beyond Z (e.g., `-03:00`). **`date_type="solved_in_time"` + `filter_by="open"` is contradictory — the MCP returns an error immediately, without calling the API.**
- `group_by` (string, optional): Aggregates the ticket COUNT instead of returning the list. "day"/"week"/"month" group by period (combine with `date_type` + date range); "desk" groups by desk. Returns `{ group_by, date_type, total, buckets: [{period, count}] }`. Use for comparison/trend (e.g., "opened per day this week") or per-desk breakdowns. **When `start_datetime`/`end_datetime` are provided and at least 1 bucket is returned, missing periods in the window are zero-filled (e.g., "2026-02" between "2026-01" and "2026-03" appears with count 0).**
- `sla_expiring_before` (string, optional): Filters OPEN (and non-stopped) tickets whose RESOLUTION SLA (`solve_expiration`) is due before the given ISO 8601 datetime, including already overdue. Use for "SLA at risk" (e.g., pass end-of-today). Combine with `group_by=desk` for "desks with SLA at risk".
- `start_datetime` (string, optional): Start date/time filter in ISO 8601 format (e.g., "2024-05-15T00:00:00Z"). Filters tickets with date >= start_datetime
- `end_datetime` (string, optional): End date/time filter in ISO 8601 format (e.g., "2024-05-15T23:59:59Z"). Filters tickets with date <= end_datetime

**Note:** At least one filter is required (desk, client, requestor, responsible, stage, date range, SLA, catalog, or priority).

**Guard-rails for `date_type="solved_in_time"`:**
- If `filter_by` is **not** provided, the MCP assumes `filter_by="closed"` and announces it in the response (e.g., "Status: Fechados — assumido; use 'all' para incluir cancelados"). Use `filter_by="all"` to include cancelled tickets too.
- If `filter_by="open"` is explicitly passed with `solved_in_time`, the MCP returns an error immediately — this is a contradictory combination (a ticket can't be both "resolved" and "open").

**Common recipes:**

| User question | Recommended call |
|---|---|
| "closed per month in desk X" | `desk_name` + `date_type="solved_in_time"` + `filter_by="closed"` + `group_by="month"` |
| "opened today in desk X" | `desk_name` + `date_type="created_at"` + `filter_by="all"` + period |
| "cancelled in the period" | `filter_by="canceled"` + `date_type="solved_in_time"` |
| "this semester vs last" | `get_tickets_comparison` |

**Zero-result diagnostics:** When the response is empty (no tickets), the MCP automatically runs up to 2 sonda API calls to tell the AI *why* — whether it's the status filter, the date range, or a genuine zero for this scope.

**Volume guard:** When the total (`X-Total-Items`) exceeds 500 tickets in a regular listing (without `group_by`), the response appends an instruction not to paginate for analysis — use `group_by` or `get_tickets_comparison` instead. This threshold is set at 500 in `LIST_TOTAL_WARN_THRESHOLD`.

**Catalog filter note:** `catalog_query` uses server-side partial matching against catalog, area, and item names simultaneously — one term matches items from multiple areas. The MCP paginates all results and resolves to item IDs before calling `GET /tickets`. Because `GET /tickets` accepts **at most 15** `services_catalogs_item_ids` (Swagger error `42201` otherwise), if the query resolves to more than 15 items only the first 15 are applied and a warning is returned (the result may be incomplete). For surgical precision, discover IDs via `search_catalog_item` and pass a narrow set via `services_catalogs_item_ids`.

**Example — filter by catalog query:**
```json
{
  "desk_name": "Support",
  "catalog_query": "security"
}
```

**Example — filter by priority and catalog (IDs):**
```json
{
  "desk_ids": "1",
  "priority_ids": "17",
  "services_catalogs_item_ids": "11,12"
}
```

**Example — filter by requestor email:**
```json
{
  "requestor_email": "joao@empresa.com",
  "is_closed": false
}
```

**Date Filtering Examples:**
```json
// List tickets created in a specific date range (including closed ones)
{
  "desk_name": "Support",
  "date_type": "created_at",
  "start_datetime": "2024-01-01T00:00:00Z",
  "end_datetime": "2024-01-31T23:59:59Z",
  "is_closed": true
}

// List tickets resolved in a specific period
// (filter_by="closed" assumed automatically; use "all" to include cancelled)
{
  "desk_name": "Support",
  "date_type": "solved_in_time",
  "start_datetime": "2024-01-01T00:00:00Z",
  "end_datetime": "2024-01-31T23:59:59Z"
}
```

### get_tickets_comparison
Compare ticket COUNTS between two time periods in a single call. Returns totals, absolute delta (Δ), and percentage change (Δ%) for each bucket (day/week/month/desk).

**When to use vs `list_tickets`:**
- **To COUNT/COMPARE/TREND** → use `get_tickets_comparison`. One MCP call, 2 API requests, answer in hundreds of tokens.
- **To VIEW individual items** → use `list_tickets` without `group_by`.

**Default comparison period:** If `compare_start_datetime`/`compare_end_datetime` are not provided, the comparison period is the immediately preceding period of the same duration (`compare_end = start_datetime − 1s`; same duration in ms). Provide only `start_datetime` and `end_datetime` and the comparison window is calculated automatically.

**Default `filter_by` by `date_type`:**
- `created_at` (default): `filter_by="all"` — historical comparisons count all statuses (open, closed, cancelled).
- `solved_in_time`: `filter_by="closed"` — comparisons by closing date assume resolved tickets; use `filter_by="all"` to include cancelled too (e.g., 358 closed + 31 cancelled = 389). This aligns with `list_tickets` so both tools return the same number for the same query.

**Parameters:**
- `start_datetime` (string, required): Start of the main period (ISO 8601, e.g., "2026-01-01T00:00:00Z" or "2026-01-01T00:00:00-03:00")
- `end_datetime` (string, required): End of the main period (ISO 8601, e.g., "2026-06-30T23:59:59Z")
- `compare_start_datetime` (string, optional): Start of comparison period (ISO 8601). Must be provided with `compare_end_datetime` (complete pair). If omitted, the immediately preceding period of the same duration is used automatically.
- `compare_end_datetime` (string, optional): End of comparison period (ISO 8601). Pair with `compare_start_datetime`.
- `group_by` (string, optional): Granularity — "day", "week", "month" (temporal buckets) or "desk" (per-desk breakdown, useful for "which desk grew"). Default: "month".
- `date_type` (string, optional): Time axis applied to both periods — "created_at" (creation date, default) or "solved_in_time" (closing/resolution date). Consistent across both calls automatically. Accepts timezone offsets beyond Z (e.g., `-03:00`).
- `filter_by` (string, optional): Status filter — "open", "closed", "canceled", or "all". Default depends on `date_type`: "all" for `created_at`; "closed" for `solved_in_time`. Use "all" with `solved_in_time` to include cancelled tickets in the count.
- `desk_ids` (string, optional): Comma-separated desk IDs (max 15). Alternative to `desk_name`.
- `desk_name` (string, optional): Desk/team name for automatic ID resolution. Accepts partial names.
- `client_ids` (string, optional): Comma-separated client (company) IDs (max 15).
- `client_name` (string, optional): Client (company) name for automatic resolution.
- `responsible_ids` (string, optional): Comma-separated responsible user IDs (max 15). Passthrough.
- `requestor_email` (string, optional): Requestor email filter. Passthrough.
- `priority_ids` (string, optional): Comma-separated priority IDs (max 15). Passthrough.
- `services_catalogs_item_ids` (string, optional): Comma-separated catalog item IDs (max 15). Passthrough.

**Example — compare last 6 months vs the 6 before (automatic adjacent period):**
```json
{
  "start_datetime": "2026-01-01T00:00:00Z",
  "end_datetime": "2026-06-30T23:59:59Z",
  "group_by": "month"
}
```

**Example — compare two explicit periods for a specific desk:**
```json
{
  "start_datetime": "2026-01-01T00:00:00Z",
  "end_datetime": "2026-06-30T23:59:59Z",
  "compare_start_datetime": "2025-07-01T00:00:00Z",
  "compare_end_datetime": "2025-12-31T23:59:59Z",
  "group_by": "month",
  "desk_name": "Support"
}
```

**Example — which desk grew the most (group_by=desk):**
```json
{
  "start_datetime": "2026-01-01T00:00:00Z",
  "end_datetime": "2026-06-30T23:59:59Z",
  "group_by": "desk",
  "filter_by": "all"
}
```

**Rich response example:**
```markdown
**📊 Comparação de tickets por mês** — por data de criação

| | Período atual | Período anterior | Δ |
|---|---|---|---|
| **Total** | **15** | **12** | **+3 (+25%)** |

| Período | Atual | Anterior | Δ | Δ% |
|---|---|---|---|---|
| 2026-01 | 10 | 8 | +2 | +25% |
| 2026-02 | 5 | 4 | +1 | +25% |

*✅ Dados obtidos da API TiFlux em tempo real*
```

**Compact response example:**
```
Comparação por mês — por data de criação: atual 15 vs anterior 12 → Δ +3 (+25%)
Buckets (atual/anterior): 2026-01:10/8 · 2026-02:5/4
```

### get_tickets_feedback_report
Relatório de avaliações de atendimento (CSAT) de tickets com comparação automática de período. Retorna métricas de satisfação (média, avaliados, finalizados, taxa de resposta) com deltas entre dois períodos, e opcionalmente a lista de tickets avaliados com comentários.

**When to use vs other tools:**
- **CSAT / satisfaction ratings for TICKETS** → `get_tickets_feedback_report` (this tool)
- **CSAT / satisfaction ratings for CHATS** → `get_chats_feedback_report`
- **Ticket count / trend comparison** → `get_tickets_comparison`

**Default comparison period:** if `compare_start_date`/`compare_end_date` are not provided, the comparison period is the immediately preceding period of the same duration. Provide only `start_date` and `end_date` and the comparison window is calculated automatically.

**No filter by rating in the API** — to filter by rating, use `include_list=true` and filter the returned list by `rating` client-side.

**Enrichment workflow:**
1. Run with `include_list=true` to get the list of evaluated tickets (with `rating`, `revised_in_time`, client, responsible, desk, and `comments`).
2. For full ticket details (history, SLA, replies) → use `get_ticket` or `list_ticket_answers` with the ticket ID.
3. The `comments` field (evaluation comment) is already in the list — no further enrichment needed for comments.

**Note:** The `comments` field is plural and may be an empty string `""` when the client did not leave a comment.

**Note:** This report requires **administrator/reports permission** — non-admin API keys receive 403.

**Parameters:**
- `start_date` (string, required): Start of the main period (YYYY-MM-DD, e.g., "2026-07-01")
- `end_date` (string, required): End of the main period (YYYY-MM-DD, e.g., "2026-07-31")
- `compare_start_date` (string, optional): Start of comparison period (YYYY-MM-DD). Must be provided with `compare_end_date`. If omitted, the immediately preceding period of the same duration is used.
- `compare_end_date` (string, optional): End of comparison period (YYYY-MM-DD). Pair with `compare_start_date`.
- `include_list` (boolean, optional): If true, includes the paginated list of evaluated tickets in the main period. Default: false.
- `offset` (integer, optional): Page number for the list (default: 1). Only relevant with `include_list=true`.
- `limit` (integer, optional): Items per page (default: 20, max: 200). Only relevant with `include_list=true`.
- `responsible_ids` (string, optional): Comma-separated responsible user IDs (max 15). Applied to both calls (main + comparison).
- `department_ids` (string, optional): Comma-separated department IDs (max 15). Applied to both calls.
- `technical_group_ids` (string, optional): Comma-separated technical group IDs (max 15). Applied to both calls.

**Example — compare this month vs last month:**
```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-31"
}
```

**Example — get list of evaluated tickets with comments:**
```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-31",
  "include_list": true,
  "limit": 50
}
```

**Rich response example:**
```markdown
**📊 Relatório de avaliações de atendimento — Tickets**

**Período principal:** 2026-07-01 a 2026-07-31
**Período de comparação:** 2026-05-31 a 2026-06-30

| Métrica | Período atual | Período anterior | Δ |
|---------|--------------|-----------------|---|
| Média de avaliação | **4.5** | 4.0 | +0.5 (+12.5%) |
| Tickets avaliados | **20** | 15 | +5 (+33.3%) |
| Tickets finalizados | **100** | 80 | +20 (+25%) |
| Clientes avaliadores | **15** | 12 | +3 (+25%) |
| Taxa de resposta (%) | **80.0** | 75.0 | +5 (+6.7%) |

*✅ Dados obtidos da API TiFlux em tempo real*
```

### close_ticket
Close a specific ticket in Tiflux.

**Parameters:**
- `ticket_number` (string, required): Ticket number to be closed (e.g., "37", "123")

**Example:**
```json
{
  "ticket_number": "84429"
}
```

**Success Response:**
```markdown
**Ticket #84429 fechado com sucesso!**

**Mensagem:** Ticket 84429 closed successfully

*Ticket fechado via API Tiflux*
```

### create_ticket_answer
Create a new answer (client communication) in a specific ticket.

**Parameters:**
- `ticket_number` (string, required): Ticket number where answer will be created
- `text` (string, required): Answer content that will be sent to the client. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.
- `with_signature` (boolean, optional): Include user signature in the answer (default: false)
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.pdf"}]` (max 10 files, 40MB each)

**New in v1.3.0:** Support for base64 file upload via `files_base64` parameter.

> **Breaking change (v2.8.0):** O parametro `files` (caminhos locais) foi removido. Use a nova tool `upload_ticket_files` para enviar arquivos via base64, ou passe os arquivos diretamente via `files_base64`.

**Example:**
```json
{
  "ticket_number": "123",
  "text": "Hello, your issue has been resolved.",
  "with_signature": true,
  "files_base64": [{"content": "JVBERi0x...", "filename": "attachment.pdf"}]
}
```

### search_client
Search for clients by name (shortcut — name-only). Use `list_clients` for full filters and pagination.

**Parameters:**
- `client_name` (string, required): Client name to search (partial match supported)

### list_clients
List clients with filters and pagination. Full version of `search_client` — accepts status, name, and CPF/CNPJ filters.

**Parameters:**
- `active` (boolean, optional): Filter by status: true = active only, false = inactive only. Omit for all.
- `name` (string, optional): Filter by name (partial match)
- `social_revenue` (string, optional): Filter by CPF/CNPJ
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

**Example:**
```json
{
  "active": true,
  "name": "Acme",
  "limit": 10
}
```

### get_client
Get full details of a client by ID.

**Parameters:**
- `client_id` (number, required): Client ID (obtained via `search_client` or `list_clients`)
- `show_entities` (boolean, optional): Include custom fields (entities) in the response (default: false)

**Example:**
```json
{
  "client_id": 42,
  "show_entities": true
}
```

### create_client
Create a new client in Tiflux. Only `name` and `social` are required; all other fields are optional and only sent if provided.

**Parameters:**
- `name` (string, required): Client trade name (nome fantasia)
- `social` (string, required): Client legal name (razão social)
- `social_revenue` (string, optional): CPF or CNPJ
- `desk_ids` (array of numbers, optional): Desk IDs to associate
- `add_all_desks` (boolean, optional): Associate all desks
- `technical_group_ids` (array of numbers, optional): Technical group IDs to associate
- `status` (boolean, optional): Active (true) or inactive (false) — default: true
- `max_agents` (number, optional): Maximum agents allowed
- `email_financial` (string, optional): Financial contact email
- `anotations` (string, optional): Internal notes
- `billing_report_type` (string, optional): `detailed_with_appointment`, `detailed`, `synthetic`, or `""` (empty)

**Example:**
```json
{
  "name": "Acme Corp",
  "social": "Acme Corporação Ltda",
  "social_revenue": "12.345.678/0001-99",
  "desk_ids": [1, 2]
}
```

### update_client
Update an existing client (partial update — only provided fields are sent).

**Parameters:**
- `client_id` (number, required): Client ID to update
- All fields from `create_client` (all optional)

**Example:**
```json
{
  "client_id": 42,
  "status": false,
  "email_financial": "novo@empresa.com"
}
```

### update_client_entities
Update custom fields (entities) for a client. Supports up to 50 fields per request. For checkbox fields with multiple options, send one item per option with `entity_field_id + entity_field_option_id + value: "true"/"false"`.

> **Tip:** Prefer `entity_field_id` (numeric) when available — it avoids extra API calls. Use the `_name` params only when you don't have the ID yet.

**Parameters:**
- `client_id` (number, required): Client ID to update
- `entities` (array, required): List of custom fields. Each item:
  - `entity_field_id` (number): Custom field ID. Prefer this when available.
  - `entity_name` (string, optional): Entity group name for automatic `entity_field_id` resolution.
  - `entity_field_name` (string, optional): Field name for automatic `entity_field_id` resolution (use with `entity_name`).
  - `entity_field_option_name` (string, optional): Option name for automatic `entity_field_option_id` resolution.
  - `value` (string, required): Field value (or null to clear)
  - `entity_field_option_id` (number, optional): Option ID for checkbox/single_select
  - `country_code` (string, optional): Country code for phone fields

**Example — with IDs (most efficient):**
```json
{
  "client_id": 42,
  "entities": [
    { "entity_field_id": 72, "value": "TI" },
    { "entity_field_id": 80, "entity_field_option_id": 12, "value": "true" }
  ]
}
```

**Example — resolving by name:**
```json
{
  "client_id": 42,
  "entities": [
    {
      "entity_name": "Dados comerciais",
      "entity_field_name": "Segmento",
      "entity_field_option_name": "Tecnologia",
      "value": "true"
    }
  ]
}
```

### get_client_desks
List desks associated with a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

### get_client_technical_groups
List technical groups associated with a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

### create_client_user
Create a portal user for a client. Allows the user to access the client portal.

**Parameters:**
- `client_id` (number, required): Client ID to associate the user with
- `name` (string, required): Full name of the user
- `email` (string, required): User email — used for portal login
- `extension` (string, optional): Phone extension
- `authorization_flow` (boolean, optional): Require authorization for portal access
- `telephone` (string, optional): Phone number
- `country_code` (string, optional): Country code for the phone number

**Example:**
```json
{
  "client_id": 42,
  "name": "João Silva",
  "email": "joao@empresa.com",
  "telephone": "11999999999"
}
```

### add_client_email_permission
Add an authorized domain or email to open tickets on behalf of a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `address` (string, required): Domain (e.g. `@empresa.com.br`) or specific email authorized to open tickets for this client

**Example:**
```json
{
  "client_id": 42,
  "address": "@empresa.com.br"
}
```

### list_client_addresses
List the addresses registered for a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

### get_client_address
Get details of a specific address of a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Address ID

### create_client_address
Create a new address for a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `cep` (string, required): ZIP code (e.g. `"89201-305"`)
- `city` (string, required): City
- `neighborhood` (string, required): Neighborhood/district
- `number` (number, required): Street number (integer)
- `state` (string, required): State — 2-letter code (e.g. `"SC"`)
- `street` (string, required): Street name
- `complement` (string, optional): Address complement (e.g. `"Sala 3"`)

**Example:**
```json
{
  "client_id": 42,
  "cep": "89201-305",
  "city": "Joinville",
  "neighborhood": "Centro",
  "number": 100,
  "state": "SC",
  "street": "Rua das Flores",
  "complement": "Sala 3"
}
```

### update_client_address
Partially update an address of a client. Only the provided fields are sent.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Address ID to update
- `cep` (string, optional): ZIP code
- `city` (string, optional): City
- `neighborhood` (string, optional): Neighborhood
- `number` (number, optional): Street number
- `state` (string, optional): State code
- `street` (string, optional): Street name
- `complement` (string, optional): Complement

### delete_client_address
Remove an address from a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Address ID to remove

### list_client_contacts
List the contacts (phone/email) registered for a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

### get_client_contact
Get details of a specific contact of a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Contact ID

### create_client_contact
Create a new contact (phone/email) for a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `use` (string, required): Contact usage type (e.g. `"Personal"`, `"Commercial"`)
- `number` (string, required): Phone number (accepts BR and international formats)
- `owner` (string, required): Name of the contact owner
- `email` (string, required): Contact email
- `country` (string, optional): Country code (e.g. `"BR"`, `"US"`)

**Example:**
```json
{
  "client_id": 42,
  "use": "Commercial",
  "number": "47999990000",
  "owner": "João Silva",
  "email": "joao@empresa.com",
  "country": "BR"
}
```

### update_client_contact
Partially update a contact of a client. Only the provided fields are sent.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Contact ID to update
- `use` (string, optional): Contact usage type
- `number` (string, optional): Phone number
- `owner` (string, optional): Contact owner name
- `email` (string, optional): Contact email
- `country` (string, optional): Country code

### delete_client_contact
Remove a contact from a client.

**Parameters:**
- `client_id` (number, required): Client ID
- `id` (number, required): Contact ID to remove

### search_user
Search for users by name to use as responsible in tickets.

**Parameters:**
- `name` (string, required): User name to search (partial match supported, searches in name and email)
- `type` (string, optional): User type filter (client, attendant, admin)
- `active` (boolean, optional): Filter active (true) or inactive (false) users
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Non-admin support (fallback via attendant groups):**
If the API key belongs to a non-admin user, `GET /users` returns 403. In this case, the tool automatically falls back to enumerating attendant groups (`GET /technical-groups`) and their members (`GET /technical-groups/{id}/users`), then applies fuzzy matching by name. The result is identical to the admin path — no parameter change needed. A note is added to the output when the fallback was used.

**Implementation Note:**
For admin users, the Tiflux API does not support name-based filtering in the `/users` endpoint — the tool fetches up to 200 users and filters client-side. For non-admin users, the tool uses the technical-groups chain and deduplicates users that appear in multiple groups.

**Example:**
```json
{
  "name": "John",
  "type": "attendant",
  "active": true
}
```

### search_technical_user
Search for technical attendants (users who can be assigned as responsible) in Tiflux by name, email, desk, or client. Uses the `GET /technical-users` endpoint — **does not require user management permission** (works for both admin and non-admin attendants). Use the returned `id` as `responsible_id` when creating or updating a ticket.

**Note on `responsible_name` auto-resolve:** When `responsible_name` is passed to `create_ticket`, `update_ticket`, or `list_tickets`, the MCP now uses `GET /technical-users` as the **primary** resolution path (fast, 1 round-trip, works for all profiles). The old fallback via `GET /technical-groups` is only triggered if the primary path returns an unexpected error (404/403), preserving compatibility with orgs where the endpoint may not be available.

**Parameters:**
- `name` (string, optional): Attendant name to search (partial match, case-insensitive, server-side)
- `email` (string, optional): Attendant email (partial match, case-insensitive, server-side)
- `desk_id` (number, optional): Filter attendants who serve this desk
- `client_id` (number, optional): Filter attendants who serve this client
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Example:**
```json
{
  "name": "Ana",
  "desk_id": 123
}
```

**Returns:** List of attendants with `id`, `name`, and `email`. Use the `id` in `responsible_id`.

### create_user
Create a new user/agent in Tiflux (**requires administrator permission** — returns 403 for non-admin keys). Required fields: `name`, `email`, and either `technical_group_id` or `technical_group_name`. License fields are optional and only sent if provided.

> **Admin-only:** This tool uses `POST /users`, which the API restricts to admin keys. Non-admin API keys will receive a clear error message indicating administrator permission is required.

**Parameters:**
- `name` (string, required): User name
- `email` (string, required): User email
- `technical_group_id` (number, optional): ID of the technical group to assign the user to (required if `technical_group_name` not provided)
- `technical_group_name` (string, optional): Name of the technical group — fuzzy match; if ambiguous, lists available groups and asks for clarification
- `whatsapp_license` (boolean, optional): WhatsApp license
- `tickets_license` (boolean, optional): Tickets license
- `remote_access_license` (boolean, optional): Remote access license
- `api_license` (boolean, optional): API license
- `splashtop_license` (boolean, optional): Splashtop license

**`technical_group_name` semantics:** If the name resolves to exactly 1 group, it proceeds. If 0 or N groups match (or no name is provided), the tool lists all available groups (`id — name`) and asks you to specify — no silent failure.

**Example:**
```json
{
  "name": "Ana Silva",
  "email": "ana.silva@empresa.com",
  "technical_group_name": "Suporte",
  "tickets_license": true
}
```

**Returns:** Confirmation with the created user's ID and name. Use the ID as `responsible_id` in tickets.

### get_user
Retrieve full details of a user/agent by ID (**requires administrator permission**).

> **Admin-only:** This tool uses `GET /users/{id}`, which the API restricts to admin keys.

**Parameters:**
- `id` (number, required): User ID

**Example:**
```json
{
  "id": 42
}
```

**Returns:** User details including: `id`, `name`, `email`, type (`_type`), active status, `technical_group_id`, `telephone`, `extension`, `client_ids`, `last_login_at`, Google Auth status (`gauth_enabled`), and `signature`.

### update_user
Update an existing user/agent (partial update — **requires administrator permission**). The `id` field is required; at least one data field must be provided.

> **Admin-only:** This tool uses `PUT /users/{id}`, which the API restricts to admin keys.

**Parameters:**
- `id` (number, required): User ID
- `name` (string, optional): New user name
- `email` (string, optional): New user email
- `technical_group_id` (number, optional): New technical group ID
- `technical_group_name` (string, optional): New technical group name — fuzzy match (see `create_user` semantics above)
- `active` (boolean, optional): Activate (`true`) or deactivate (`false`) the user
- `extension` (string, optional): User extension
- `telephone` (string, optional): User telephone
- `client_ids` (array of numbers, optional): Client IDs linked to this user
- `country_code` (string, optional): Country code
- `whatsapp_license` (boolean, optional): WhatsApp license
- `tickets_license` (boolean, optional): Tickets license
- `remote_access_license` (boolean, optional): Remote access license
- `api_license` (boolean, optional): API license
- `splashtop_license` (boolean, optional): Splashtop license

**Example:**
```json
{
  "id": 42,
  "active": false,
  "technical_group_name": "Dev"
}
```

**Returns:** Confirmation with user ID, updated name, and list of updated fields.

### search_requestor
Search for requestors (ticket openers) in Tiflux by name, email, or telephone. Uses the dedicated `GET /requestors` endpoint with server-side filtering — no client-side limit.

**Automatic fallback chain (triggers on `403` OR on zero results — no questions asked):** the tool tries each source in order and returns the first that finds someone, so it also works for non-admin attendants and for searches where the term exists only as a user (not as a registered requestor):

1. `GET /requestors` — global requestors (admin/global permission). → use the `id` as `requestor_id`.
2. `GET /clients/{client_id}/requestors` — client-scoped requestors (only if `client_id` is provided; clients are already filtered by the attendant's permission). → `requestor_id`.
3. `GET /users` — users matching the name/email. Users are **not** requestors, but their **email** can be used as `requestor_email` when creating the ticket.
4. `GET /users/me` — the current user. Suggests opening the ticket as yourself, using your own **email** as `requestor_email`.

A non-`403` hard error (e.g. 5xx) on the primary endpoint is surfaced instead of being masked by the chain. The calling LLM decides the next step from the suggestion.

**Parameters:**
- `name` (string, optional): Requestor name to search (partial match, server-side)
- `email` (string, optional): Requestor email to search
- `telephone` (string, optional): Requestor phone number (no country code, no symbols)
- `can_open_ticket` (boolean, optional): Filter requestors who can (true) or cannot (false) open tickets by email
- `client_id` (number, optional): Client ID to scope the search. Enables the automatic `GET /clients/{id}/requestors` fallback when the global endpoint returns 403.
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Note:** At least one filter parameter must be provided.

**Returns:** When found via levels 1–2, a list of requestors with id, name, email, telephone, client.name, and can_open_ticket (use the `id` as `requestor_id`). When found only via level 3 (users) or level 4 (yourself), a suggestion to use the matched **email** as `requestor_email`.

**Example:**
```json
{
  "name": "João Silva"
}
```

**Example (by email):**
```json
{
  "email": "joao@empresa.com"
}
```

### list_requestors
List the requestors of a specific client (canonical per-client listing — `GET /clients/{id}/requestors`, aligned with `list_clients`). Use `search_requestor` when you need a cross-client search with the fallback chain; use `list_requestors` for the requestor catalog of a known client.

**Parameters:**
- `client_id` (number, required): Client whose requestors will be listed
- `name` (string, optional): Filter by name (partial match)
- `email` (string, optional): Filter by email
- `telephone` (string, optional): Filter by phone (digits only, no country code)
- `extension` (string, optional): Filter by extension
- `can_open_ticket` (boolean, optional): Filter requestors who can (true) or cannot (false) open tickets by email
- `include_entity_fields` (boolean, optional): Include each requestor's custom fields in the response (default: false). When true, each field shows type, `required` flag, and — for `single_select`/`checkbox` types — the marked options with title and IDs for `list_entity_field_options`.
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Requestors per page (default: 20, max: 200)

**Returns:** A paginated list of requestors with id, name, email, telephone, extension, can_open_ticket, and (when `include_entity_fields=true`) custom field details including marked option titles and IDs.

**Example:**
```json
{
  "client_id": 123,
  "include_entity_fields": true
}
```

### get_requestor
Get full details of a requestor of a client by ID (`GET /clients/{id}/requestors/{requestor_id}`). Returns registration data and optional custom fields (entities, `applied_in: "solicitant"`).

**Parameters:**
- `client_id` (number, required): Client the requestor belongs to
- `requestor_id` (number, required): Requestor ID (obtained via `list_requestors` or `search_requestor`)
- `show_entities` (boolean, optional): Include custom fields (entities) in the response (default: false). When true, each field shows type, `required` flag (suffix `(obrigatório)`), `entity_field_id`, and — for `single_select`/`checkbox` types — the marked options with IDs and a hint to call `list_entity_field_options` for all available options.

**Example:**
```json
{
  "client_id": 123,
  "requestor_id": 555,
  "show_entities": true
}
```

### create_requestor
Create a new requestor in a client (`POST /clients/{id}/requestors`). Required fields: `client_id`, `name`, `email`. Other fields are optional and only sent if provided.

> **Note:** `telephone` is optional here. When it comes to ticket creation, field requirements may differ — they depend on the desk's `required_fields` (see `GET /desks/{id}`), not on the requestor registration endpoint.

**Parameters:**
- `client_id` (number, required): Client to link the requestor to
- `name` (string, required): Requestor name
- `email` (string, required): Requestor email
- `telephone` (string, optional): Requestor phone. If provided, must be a valid number — do not send an empty string (causes 422)
- `can_open_ticket` (boolean, optional): Whether the requestor can open tickets by email
- `extension` (string, optional): Requestor extension
- `country` (string, optional): Requestor country

**Returns:** The created requestor's id, name, email, and telephone (if provided).

**Example:**
```json
{
  "client_id": 123,
  "name": "João Silva",
  "email": "joao@empresa.com"
}
```

### update_requestor
Update an existing requestor (`PUT /clients/{id}/requestors/{requestor_id}`). Partial update — only the provided fields are sent. Use `get_requestor` to see the current state before updating.

**Parameters:**
- `client_id` (number, required): Client the requestor belongs to
- `requestor_id` (number, required): Requestor ID to update
- `name` (string, optional): Requestor name
- `telephone` (string, optional): Requestor phone (digits only)
- `email` (string, optional): Requestor email
- `can_open_ticket` (boolean, optional): Whether the requestor can open tickets by email
- `extension` (string, optional): Requestor extension

If no updatable field is provided, returns a friendly error.

**Example:**
```json
{
  "client_id": 123,
  "requestor_id": 555,
  "can_open_ticket": true
}
```

### update_requestor_entities
Update a requestor's custom fields (entities) (`PUT /clients/{id}/requestors/{requestor_id}/entities`). Supports up to 50 fields per request. For checkbox fields with multiple options, send one item per option with `entity_field_id` + `entity_field_option_id` + `value: "true"/"false"`.

**Prefer IDs when known** to avoid resolution round-trips. Use `entity_name`/`entity_field_name`/`entity_field_option_name` for automatic resolution when you don't have the IDs — resolution is scoped to requestor entities (`applied_in: "solicitant"`).

**Parameters:**
- `client_id` (number, required): Client the requestor belongs to
- `requestor_id` (number, required): Requestor ID to update
- `entities` (array, required): List of custom fields (see `update_client_entities` for the item shape)

**Example:**
```json
{
  "client_id": 123,
  "requestor_id": 555,
  "entities": [
    { "entity_field_id": 88, "value": "Premium" }
  ]
}
```

### search_stage
Search for stages of a specific desk to use in ticket updates.

**Parameters:**
- `desk_id` (number, optional): Desk ID to search stages
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Note:** At least one parameter (desk_id or desk_name) must be provided.

**Example:**
```json
{
  "desk_name": "Suporte",
  "limit": 20
}
```

### search_catalog_item
Search for service catalog items by free-text term or by name/filter within a specific desk. Use `search` to explore items by keyword (server-side, matches catalog name, area name, or item name). Use `catalog_item_name` to locate a specific item by name (client-side, collapses to single detail when exactly 1 match).

> **Disambiguation:** this tool is desk-scoped (items selectable in tickets of a specific desk). To list items for a specific catalog **area** across the whole organization (CRUD management), use `list_services_catalog_items`. To list catalogs org-wide, use `list_services_catalogs`.

**Parameters:**
- `desk_id` (number, optional): Desk ID to search catalog items
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `search` (string, optional): Free-text term for server-side search across catalog name, area name, and item name. Partial match, case-insensitive, accent-insensitive. Returns a listing with full hierarchy (catalog → area → item). Combinable with `area_id`/`catalog_id` to narrow scope.
- `catalog_item_name` (string, optional): Catalog item name to search (client-side partial match on item name only). 1 match → detailed view; multiple → error with list. Use `search` for broader exploration.
- `area_id` (number, optional): Service area ID to filter results
- `catalog_id` (number, optional): Service catalog ID to filter results
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Note:** At least one of `desk_id` or `desk_name` must be provided, along with at least one of `search`, `catalog_item_name`, `area_id`, or `catalog_id`.

**Example — free-text search (recommended for exploration):**
```json
{
  "desk_name": "Support",
  "search": "infra",
  "limit": 10
}
```

**Example — locate a specific item by name:**
```json
{
  "desk_name": "Support",
  "catalog_item_name": "Installation",
  "limit": 10
}
```

## Internal Communications

### create_internal_communication
Create a new internal communication in a ticket.

**Parameters:**
- `ticket_number` (string, required): Ticket number where communication will be created
- `text` (string, required): Communication content. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.pdf"}]` (max 10 files, 25MB each)

**New in v1.3.0:** Support for base64 file upload via `files_base64` parameter.

> **Breaking change (v2.8.0):** O parametro `files` (caminhos locais) foi removido. Use a nova tool `upload_ticket_files` para enviar arquivos via base64, ou passe os arquivos diretamente via `files_base64`.

**Example:**
```json
{
  "ticket_number": "123",
  "text": "Internal communication content",
  "files_base64": [{"content": "base64...", "filename": "relatorio.pdf"}]
}
```

### list_internal_communications
List internal communications for a ticket.

**Parameters:**
- `ticket_number` (string, required): Ticket number to list communications
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Communications per page (default: 20, max: 200)

### get_ticket_files
Get all files attached to a specific ticket.

**Parameters:**
- `ticket_number` (string, required): Ticket number to retrieve files from

**Returns:**
List of files with details including:
- File ID, name, content type
- File size (formatted as KB/MB/GB)
- URL for download
- Created date and creator information

**Example:**
```json
{
  "ticket_number": "123"
}
```

### upload_ticket_files
Upload files to an existing ticket in Tiflux. Files must be provided as base64-encoded content.

**Parameters:**
- `ticket_number` (string, required): Ticket number where files will be attached (e.g., "123", "456")
- `files_base64` (array, required): Array of base64 encoded files `[{content: "base64...", filename: "file.pdf"}]` (max 10 files, 25MB each)

**Example:**
```json
{
  "ticket_number": "123",
  "files_base64": [
    {"content": "base64encodedcontent...", "filename": "relatorio.md"},
    {"content": "base64encodedcontent...", "filename": "screenshot.png"}
  ]
}
```

**Returns:** Confirmation with list of uploaded files.

**Note:** Uploaded text files (`.md`, `.txt`, `.csv`, `.json`) are sent with the appropriate `charset=utf-8` content type, which prevents character encoding issues (mojibake) in the Tiflux portal.

### delete_ticket_file
Remove a file attached to a ticket in Tiflux.

**Parameters:**
- `ticket_number` (string, required): Ticket number from which the file will be removed (e.g., "123", "456")
- `file_id` (string, required): ID of the file to remove (obtained via `get_ticket_files`)

**Example:**
```json
{
  "ticket_number": "123",
  "file_id": "456"
}
```

**Returns:** Confirmation that the file was removed.

### get_ticket_stages_slas
List the full history of a ticket as it moved through the desk's stages, with the SLA outcome for each stage. Useful for SLA audits, escalation reviews, and bottleneck analysis.

**Parameters:**
- `ticket_number` (string, required): Ticket number (e.g., "123", "456")
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Records per page (default: 20, max: 200)

**Returns:**
For each stage transition, the formatted output includes:
- Stage name and desk
- Time spent in expedient (`HH:MM`)
- Whether the SLA was met (`✅ Sim` / `❌ Não`)
- SLA expiration timestamp
- When the ticket entered the stage and who moved it
- When (if) the ticket was attended in this stage and by whom

**Empty result:** Tickets on desks **without an active SLA** return an empty list with an explanatory message — this is expected behavior, not an error.

**Example:**
```json
{
  "ticket_number": "32",
  "offset": 1,
  "limit": 20
}
```

### get_ticket_service_types
List the service types available for billing/valorization of an appointment on a ticket. Returns the active contract riders (with add-on number, validity, and ID) and the loose services (with ID and name) applicable on the given date. Useful for discovering which services or contracts can be referenced when creating a valued appointment.

**Parameters:**
- `ticket_number` (string, required): Ticket number (e.g., "123", "456")
- `date` (string, optional): Reference date in ISO format `YYYY-MM-DD` (default: today). Cannot be a future date.

**Returns:**
Two sections in the formatted output:
- **📄 Contratos / Adendos vigentes** — for each `contract_rider`: contract name, add-on number (`rider_number`), validity period (`start_date` → `cancel_date`), and the add-on ID.
- **🔧 Serviços avulsos** — for each `loose_service`: `id` + `name`.

Each list can be independently empty (shows "none found" for that section); **both empty** returns an explanatory message (no contracts/services applicable for that ticket on the given date).

**Example:**
```json
{
  "ticket_number": "123",
  "date": "2026-08-04"
}
```

### get_ticket_shifts
List the displacements (travel/visit) available for valorization of an appointment on a ticket. Displacement is a valorization component representing the travel cost to the client. Useful for discovering which displacements can be referenced when creating a valued appointment. Sister tool of `get_ticket_service_types`.

**Parameters:**
- `ticket_number` (string, required): Ticket number (e.g., "98875", "123")
- `contract_id` (number, optional): Contract ID (positive integer) to filter displacements linked to a specific contract. Omit to return all displacements applicable to the ticket. A non-integer value fails locally with a clear message, without calling the API.

**Returns:**
List of available displacements. Each displacement includes:
- `name` and `id`
- `reference` scope label (All = generic for all clients/contracts; Client = exclusive to the client; Contract = exclusive to the contract; Shared = group of contracts)
- Linked `contract` or `client` when present (not shown for generic "All" items)

Empty result returns a friendly explanatory message.

**Example:**
```json
{
  "ticket_number": "98875",
  "contract_id": 88558
}
```

### get_ticket_checklists
List the checklists (forms) of a ticket, with all fields and their fill state. Useful for understanding which fields are pending and **why a ticket cannot be closed** — a checklist with `pending: true` means there is a required unfilled field blocking closure. Each field shows its `index` (the only way to reference it for writing), type, whether it is required, fill state, and the value or options depending on the field type. **Option ids for `checkbox` and `radio` fields are exposed in the output** so they can be used directly in `update_ticket_checklist_item`.

**Parameters:**
- `ticket_number` (string, required): Ticket number (e.g., "98875", "123")
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Checklists per page (default: 20, max: 200)

**Returns:**
Per checklist:
- Name, description, `required` (informational — whether the checklist is required for the client/catalog item), `pending` (whether a required field is missing — this blocks closure), creation and update dates.

Per field (`fields[]`):
- `index`: the positional reference for the field (the only identifier — not persistent across changes)
- `title`, `type` (`text`, `textarea`, `value`, `radio`, `checkbox`)
- Whether it is required and whether it is filled
- Visual marker for required-but-unfilled fields (blocks ticket closure)
- Value/options by type:
  - `text` / `textarea` / `value`: shows the filled value or "— vazio —"
  - `radio`: shows the chosen option and lists all available options with their ids (e.g., `[id: 2] Média`) for use in `update_ticket_checklist_item`
  - `checkbox`: lists all options with their ids and marks which are checked (☑ `[id: a] E-mail`) and which are not (☐ `[id: b] VPN`); `id: null` is also displayed (it is addressable via the API)

**Example:**
```json
{
  "ticket_number": "98875",
  "offset": 1,
  "limit": 20
}
```

Empty result (no checklists) returns a friendly explanatory message. A ticket without checklists can be closed normally.

### update_ticket_checklist_item
Fill or clear a single checklist field for a ticket. One field per call (1:1 with the API). Use `get_ticket_checklists` first to obtain `checklist_id`, `index`, and the option ids for `checkbox`/`radio` fields.

**Important constraints:**
- Checklists without an `id` (not originated from a template) cannot be updated.
- Fields of a closed ticket cannot be updated.
- The payload is mutually exclusive: send either `value` OR `options`, never both.

**Parameters:**
- `ticket_number` (string, required): Ticket number (e.g., "98875")
- `checklist_id` (number, required): Checklist id as returned by `get_ticket_checklists`
- `index` (number, required): Field position within the checklist (from `get_ticket_checklists`)
- `value` (string | number | null, optional): Value to fill. Use for `text`, `textarea`, `value` fields (any string/number) and `radio` (the option id). Send `null` to clear any field type. Mutually exclusive with `options`.
- `options` (array, optional): For `checkbox` fields only. Array of `{ id, checked }` — send only the options you want to change; others remain unchanged. Use the ids from `get_ticket_checklists`. Mutually exclusive with `value`.

**Payload by field type:**

| Field type | Payload |
|------------|---------|
| `text` / `textarea` / `value` | `{ "value": "text content" }` |
| `radio` | `{ "value": "<option_id>" }` (id from `get_ticket_checklists`) |
| `checkbox` | `{ "options": [{ "id": "<option_id>", "checked": true }] }` |
| Clear any field | `{ "value": null }` |

**Examples:**
```json
// Fill a text field
{ "ticket_number": "98875", "checklist_id": 2, "index": 0, "value": "Client notified" }

// Select a radio option
{ "ticket_number": "98875", "checklist_id": 2, "index": 3, "value": "2" }

// Mark checkbox options
{ "ticket_number": "98875", "checklist_id": 2, "index": 4, "options": [{ "id": "a", "checked": true }, { "id": "b", "checked": false }] }

// Clear any field
{ "ticket_number": "98875", "checklist_id": 2, "index": 1, "value": null }
```

**Returns:** The updated checklist with all fields and their new state, plus the `pending` status of the checklist (whether it still blocks ticket closure).

**Errors:**
- `404`: Ticket or checklist not found
- `422`: Attribute incompatible with field type (e.g., `value` sent to a `checkbox` field — use `options` instead)
- `403`: No permission or no Tickets license

### list_ticket_answers
List answers (communications with the client) of a specific ticket, paginated.

**Parameters:**
- `ticket_number` (integer, required): Ticket number to list answers from
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Answers per page (default: 20, max: 200)

**Returns:**
Each answer includes:
- Author name, date/time, origin (`agent`, `client`, etc.)
- File count indicator
- Preview of the content (first 200 characters)
- Pagination info with hint for next page

**Example:**
```json
{
  "ticket_number": 123,
  "offset": 1,
  "limit": 20
}
```

### get_ticket_answer
Get the full detail of a specific answer from a ticket, including attached files.

**Parameters:**
- `ticket_number` (integer, required): Ticket number
- `answer_id` (integer, required): ID of the answer to retrieve

**Returns:**
- Full answer content (untruncated), author, date, origin
- Complete list of attached files with name, type, size and download URL

**Example:**
```json
{
  "ticket_number": 123,
  "answer_id": 501
}
```

### delete_ticket_answer
Remove an answer (client communication) from a ticket in Tiflux.

**Parameters:**
- `ticket_number` (string, required): Ticket number from which the answer will be removed (e.g., "123", "456")
- `answer_id` (string, required): ID of the answer to remove (obtained via `list_ticket_answers` or `get_ticket_answer`)

**Example:**
```json
{
  "ticket_number": "123",
  "answer_id": "501"
}
```

**Returns:** Confirmation that the answer was removed.

### delete_ticket_answer_file
Remove a file attached to a specific ticket answer in Tiflux.

**Parameters:**
- `answer_id` (string, required): ID of the answer from which the file will be removed (obtained via `list_ticket_answers` or `get_ticket_answer`)
- `file_id` (string, required): ID of the file to remove (obtained via `get_ticket_answer`, field `files[].id`)

**Example:**
```json
{
  "answer_id": "501",
  "file_id": "1"
}
```

**Returns:** Confirmation that the file was removed.

### get_ticket_histories
List the event history (timeline) of a ticket, showing field changes, stage transitions, and other events. Paginated.

**Parameters:**
- `ticket_number` (integer, required): Ticket number to retrieve history for
- `history_of` (integer, required): History area to query — `0` = stage history, `1` = appointment history
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Events per page (default: 20, max: 200)
- `type_id_attr` (integer, optional): Filter by attribute type
- `operation` (string, optional): Filter by operation type (`"created"`, `"updated"`, `"deleted"`) — only considered when `history_of=1`

**Returns:**
For each event:
- Action description, user, date/time, event type and operation
- Diff of changed fields with old → new values

**Example:**
```json
{
  "ticket_number": 123,
  "history_of": 0
}
```

### reopen_ticket
Reopen a closed or canceled ticket. Tickets that have been billed cannot be reopened.

**Parameters:**
- `ticket_number` (integer, required): Ticket number to reopen
- `disapproval_reason` (string, optional): Required when reopening a ticket pending review (disapproval-based reopening)

**Business Rules:**
- Tickets that have been **billed** cannot be reopened (API returns 422)
- `disapproval_reason` is mandatory when reopening a ticket that is pending review/approval

**Example:**
```json
{
  "ticket_number": 123,
  "disapproval_reason": "The solution did not resolve the issue"
}
```

### get_internal_communication
Get a specific internal communication with full content.

**Parameters:**
- `ticket_number` (string, required): Ticket number containing the communication
- `communication_id` (string, required): ID of the internal communication to retrieve

### update_internal_communication
Update the text of an existing internal communication in a ticket. Only the author of the communication can edit it.

**Parameters:**
- `ticket_number` (string, required): Ticket number where the communication exists (e.g., "123", "456")
- `communication_id` (string, required): ID of the internal communication to update (obtained via `list_internal_communications` or `get_internal_communication`)
- `text` (string, required): New content of the internal communication. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.

**Example:**
```json
{
  "ticket_number": "123",
  "communication_id": "101",
  "text": "Updated communication content with **important** details."
}
```

**Returns:** Confirmation with updated communication content.

**Note:** The Tiflux API only allows the author of the communication to edit it. A 403 error will be returned if the authenticated user did not create the communication.

### delete_internal_communication
Remove an internal communication from a ticket in Tiflux.

**Parameters:**
- `ticket_number` (string, required): Ticket number from which the communication will be removed (e.g., "123", "456")
- `communication_id` (string, required): ID of the internal communication to remove (obtained via `list_internal_communications`)

**Example:**
```json
{
  "ticket_number": "123",
  "communication_id": "101"
}
```

**Returns:** Confirmation that the internal communication was removed.

## Appointments (Time Tracking)

### create_appointment
Create a new appointment (work-hour record) on a specific ticket. Supports both non-valued (simple) and valued appointments (attended externally/remotely/internally, with contract or loose service billing, optional travel shift, guarantee flag, and manual value).

**Parameters (required):**
- `ticket_number` (string, required): Ticket number where the appointment will be created
- `date` (string, required): Appointment date in `YYYY-MM-DD` format. Future dates are not allowed.
- `init_time` (string, required): Start time in `HH:MM` format (e.g. `"09:00"`, `"14:30"`)
- `end_time` (string, required): End time in `HH:MM` format. Must be greater than or equal to `init_time`.
- `description` (string, required): Description of the work performed

**Parameters (valorization — required for desks with valorization enabled):**
- `attendance` (integer, optional): Attendance type: `1` = External (presencial), `2` = Remote, `3` = Internal. Required on desks with valorization.
- `attendance_kind` (integer, optional): Service type: `1` = Loose (avulso), `2` = Contract. Required on desks with valorization.
- `contract_rider_id` (integer, optional): Contract add-on ID. Required when `attendance_kind=2`. Use `contract_name` to resolve by name.
- `loose_service_id` (integer, optional): Loose service ID. Required when `attendance_kind=1`. Use `loose_service_name` to resolve by name.
- `shift_id` (integer, optional): Travel/displacement ID (visit cost). Only with `attendance=1`. Exclusive with `shift_owner_ticket_number`. Use `shift_name` to resolve by name.
- `shift_owner_ticket_number` (integer, optional): Ticket number of another open ticket from the same client that already has the travel cost charged (carona). Only with `attendance=1`. Exclusive with `shift_id`.
- `guarantee` (boolean, optional): Guarantee appointment — value forced to zero, does not bill. Cannot be used together with `value`.
- `value` (number, optional): Manual value (0–9999999.99). Only with `attendance_kind=1`. If omitted, calculated automatically. Cannot be used with `attendance_kind=2` or `guarantee=true`.
- `external_user_name` (string, optional): Name of the executor in an external tool (max 255 chars, no `<` or `>`). Valid on any desk type.

**Name resolution parameters (Smart Name Resolution):**
- `shift_name` (string, optional): Partial shift/displacement name — resolves to `shift_id`. Preference: `shift_id` wins if both given.
- `loose_service_name` (string, optional): Partial loose service name — resolves to `loose_service_id`. Preference: `loose_service_id` wins if both given.
- `contract_name` (string, optional): Partial contract name — resolves to `contract_rider_id`. Preference: `contract_rider_id` wins if both given.

**Cross-field rules (validated locally before API call):**
- `attendance_kind=1` (Loose) requires `loose_service_id`; rejects `contract_rider_id`
- `attendance_kind=2` (Contract) requires `contract_rider_id`; rejects `loose_service_id` and `value`
- `shift_id` and `shift_owner_ticket_number` are mutually exclusive (never both)
- `shift_id` or `shift_owner_ticket_number` requires `attendance=1` (External)
- `value` requires an explicit `attendance_kind=1` (rejected when `attendance_kind` is omitted)
- `guarantee=true` rejects `value`
- `external_user_name` max 255 chars, no `<` or `>`

> **Desks with valorization enabled:** When the ticket's desk requires valorization, calling `create_appointment` without `attendance` and `attendance_kind` results in a `422` from the API. The tool catches this and returns a guided error message:
>
> ```
> ❌ Esta mesa exige informações de valorização
>
> A mesa do ticket #X está configurada com valorização de apontamentos, então
> `attendance` e `attendance_kind` são obrigatórios.
>
> • `attendance`: 1 = Externo (presencial), 2 = Remoto, 3 = Interno
> • `attendance_kind`: 1 = Avulso (exige `loose_service_id`), 2 = Contrato (exige `contract_rider_id`)
> ```
>
> Note: `attendance` and `attendance_kind` remain optional in the schema because desks _without_ valorization reject them at the API level — the tool cannot know the desk's configuration before the API call.

**Example (valued appointment — loose service):**
```json
{
  "ticket_number": "258",
  "date": "2026-08-17",
  "init_time": "09:00",
  "end_time": "11:00",
  "description": "On-site support — network configuration",
  "attendance": 1,
  "attendance_kind": 1,
  "loose_service_name": "Suporte TI Basico",
  "shift_name": "Deslocamento Joinville"
}
```

### list_appointments
List appointments (work-hour records) of a specific ticket with optional filters. When available, each appointment card includes valorization details (attendance type, contract or loose service, travel shift, value) and geolocation entries.

**Parameters:**
- `ticket_number` (string, required): Ticket number to list appointments from
- `user_id` (number, optional): Filter by the ID of the user who made the appointment
- `start_date` (string, optional): Return appointments from this date (`YYYY-MM-DD`)
- `end_date` (string, optional): Return appointments up to this date (`YYYY-MM-DD`)
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Appointments per page (default: 20, max: 200)

**Returns:**
Each appointment card shows date, time range, attendant, client (when available), and description. When `external_user_name` is present it is shown as a separate line outside the valorization block (valid on any desk type). When the desk has valorization enabled, the card also includes:
- Attendance type: External (Externo), Remote (Remoto), or Internal (Interno)
- Service type: Loose (Avulso) with loose service name, or Contract with contract name
- Travel shift name and value (`shift`) when applicable — or "Deslocamento de: #N — Title" when `shift_owner_ticket` is set (carona)
- Guarantee and manual-value flags (shown only when `true`)
- Monetary value formatted as `R$ X,XX`

When `valorization` is `null` (desks configured without valorization), none of the above fields are shown.

Geolocation lines (`📍 Localização: lat, lon`) are rendered when the API returns `locations` for the appointment.

**Example:**
```json
{
  "ticket_number": "123",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "limit": 50
}
```

### list_appointments_global
List all appointments across all tickets for a date range with optional filters by technician and desk. Requires permission to access the global appointments endpoint. Use `list_appointments_report` for an aggregated summary by technician (N2 support report).

> **Permission note:** Requires access to the `GET /appointments` endpoint. Users without the "Visualizar relatórios dos técnicos" (view_users_manage) permission may have their `user_ids` filter silently ignored by the API, receiving only their own appointments. When `user_ids` or `user_names` is provided and the API returns data, the tool emits an advisory note about this behavior. Non-admin users may receive `403` if the route itself is blocked at the permission level.

**Parameters:**
- `start_date` (string, required): Start date of the period (`YYYY-MM-DD`)
- `end_date` (string, required): End date of the period (`YYYY-MM-DD`)
- `user_ids` (string, optional): Comma-separated technician IDs (max 15). Use `user_names` for name-based resolution.
- `user_names` (string, optional): Comma-separated technician names for automatic resolution (alternative to `user_ids`). Ambiguity returns a disambiguation list.
- `desk_ids` (string, optional): Comma-separated desk IDs (max 15). Use `desk_names` for name-based resolution.
- `desk_names` (string, optional): Comma-separated desk names for automatic resolution (alternative to `desk_ids`).
- `include_valorization` (boolean, optional): Include valorization data (attendance type, value). Default: `false`.
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 200)

**Returns:**
Paginated list of appointments. Each item shows: appointment ID, date, time range, technician name, client, desk, ticket number and title, description (truncated at 120 chars). When present, `external_user_name` is shown as a separate line. Valorization summary appears when `include_valorization=true`: attendance type, monetary value, `🛡️ Garantia` (when `guarantee=true`), `✋ Valor manual` (when `manual_value=true`), and `shift_owner_ticket` when set. The `✋ Valor manual` flag indicates the value was entered manually by the user (bypassing the contract rate), as opposed to being calculated from the contract tariff — critical signal for billing analysis.

**Example:**
```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-31",
  "user_ids": "123,456",
  "desk_ids": "85",
  "limit": 50
}
```

### list_appointments_report
Generate an aggregated N2 support report: count and total hours per technician for a date range, with optional desk sub-breakdown and grand totals. Ideal for recurring N2 support metrics (how many times and how many hours each N2 technician assisted others in a period).

> **Permission note:** Same as `list_appointments_global`. Non-admin users without route-level permission receive a `403` error.

**Parameters:**
- `start_date` (string, required): Start date of the period (`YYYY-MM-DD`)
- `end_date` (string, required): End date of the period (`YYYY-MM-DD`)
- `user_ids` (string, optional): Comma-separated N2 technician IDs (max 15). Use `user_names` for name-based resolution.
- `user_names` (string, optional): Comma-separated N2 technician names for automatic resolution.
- `desk_ids` (string, optional): Comma-separated desk IDs (max 15) to enable desk sub-breakdown in the report. Use `desk_names` for name-based resolution.
- `desk_names` (string, optional): Comma-separated desk names for automatic resolution (enables desk sub-breakdown).
- `include_valorization` (boolean, optional): Include total value per technician (and per desk when breakdown enabled). Default: `false`.

**Returns:**
Markdown report with:
- Global totals: total appointments count, total hours, total value with manual sub-total in parentheses when applicable (e.g. `**Valor total:** R$ 1.200,00 (R$ 400,00 em valor manual)`)
- Per-technician section (sorted by appointment count desc): appointment count, total hours, total value — with `(R$ X manual)` suffix when any manual-value appointment exists for that technician
- Desk sub-breakdown per technician (shown only when `desk_ids`/`desk_names` provided): count + hours + value per desk, with manual suffix when applicable
- Footer with real-time data notice

The `manual_value` breakdown (when `include_valorization=true`) makes it immediately clear how much of the billed total came from manually-entered values vs. contract-calculated rates — important for billing audits.

The report paginates through all available data automatically (no `offset`/`limit` needed — all pages are fetched internally before aggregating).

**Example:**
```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-31",
  "user_names": "Fernando N2, Peterson N2",
  "desk_names": "Suporte - Dúvidas"
}
```

## Chats

### get_chat
Exibir detalhes de um chat específico pelo id. Retorna card com status, cliente, responsável, departamento, origem, avaliação e datas.

**Parameters:**
- `id` (number, required): Numeric ID of the chat (also accepts numeric string — the handler calls parseInt)

**Returns:**
Card with all relevant chat fields including:
- Status (archived, canceled, online, waiting for answer)
- Client and requestor names
- Department and responsible attendant
- Origin channel and room
- Linked ticket (number + title, e.g. `#127 — Erro no login`); title is normalized to a single line and truncated at 150 chars; shows `Sem ticket vinculado` when no ticket is linked
- Assessment rating (1–5) if available
- Last client message (truncated at 150 chars)
- Timestamps (created, updated, assumed)

**Example:**
```json
{
  "id": 42
}
```

### list_inbox_chats
Listar chats na caixa de entrada (chats não assumidos) com filtros opcionais de departamento, cliente, origem, data e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID. To discover the ID from a name, use `list_departments` (e.g. `list_departments name:"financeiro"`)
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels: `chat`, `site_widget`, `campaign`, `whatsapp`, `whatsapp_web`, `gupshup`, `whatsapp_cloud`
- `started_by` (string, optional): Chat initiator type: `Client`, `Attendant`, `Campaign`, `API`
- `created_at_start` (string, optional): Filter chats created on or after this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`
- `created_at_end` (string, optional): Filter chats created on or before this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Must be >= `created_at_start`

**Returns:**
Paginated list of chats. Each item includes origin, online/waiting status, client, requestor, department, last client message (truncated at 150 chars), creation date, and — when the chat has a linked ticket — `Ticket: #<number> — <title>` (title normalized to a single line and truncated at 150 chars; the whole line is omitted when no ticket is linked).

**Example:**
```json
{
  "origins": "whatsapp",
  "created_at_start": "2026-06-01T00:00:00Z",
  "created_at_end": "2026-06-30T23:59:59Z",
  "limit": 10
}
```

### list_my_chats
Listar chats assumidos pelo usuário autenticado (dono da API key) com filtros opcionais e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID. To discover the ID from a name, use `list_departments` (e.g. `list_departments name:"financeiro"`)
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)
- `created_at_start` (string, optional): Filter chats created on or after this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`
- `created_at_end` (string, optional): Filter chats created on or before this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Must be >= `created_at_start`

**Returns:**
Paginated list of chats assumed by the authenticated user. Each item includes origin, online/waiting status, client, requestor, department, last client message (truncated at 150 chars), creation date, and — when the chat has a linked ticket — `Ticket: #<number> — <title>` (title normalized to a single line and truncated at 150 chars; the whole line is omitted when no ticket is linked).

**Example:**
```json
{
  "department_id": 3,
  "created_at_start": "2026-06-01T00:00:00Z",
  "limit": 20
}
```

### list_in_attendance_chats
Listar todos os chats em atendimento da organização com filtros opcionais de responsável, status, data e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID. To discover the ID from a name, use `list_departments` (e.g. `list_departments name:"financeiro"`)
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)
- `user_id` (number, optional): Filter by responsible attendant ID
- `status` (string, optional): Filter by attendance status: `waiting_client`, `waiting_attendance`, `triage`
- `created_at_start` (string, optional): Filter chats created on or after this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`
- `created_at_end` (string, optional): Filter chats created on or before this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Must be >= `created_at_start`

**Returns:**
Paginated list of all chats currently in attendance in the organization. Each item includes origin, online/waiting status, client, requestor, department, last client message (truncated at 150 chars), creation date, and — when the chat has a linked ticket — `Ticket: #<number> — <title>` (title normalized to a single line and truncated at 150 chars; the whole line is omitted when no ticket is linked).

**Example:**
```json
{
  "user_id": 7,
  "status": "triage",
  "created_at_start": "2026-06-15T00:00:00Z"
}
```

### list_archived_chats
Listar chats arquivados (finalizados ou cancelados) com filtros opcionais de data de criação e finalização. Exibe avaliação do atendimento e status de cancelamento.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID. To discover the ID from a name, use `list_departments` (e.g. `list_departments name:"financeiro"`)
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)
- `canceled` (boolean, optional): `true` = only canceled chats, `false` = only normally finished, omitted = all archived chats
- `created_at_start` (string, optional): Filter chats created on or after this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`
- `created_at_end` (string, optional): Filter chats created on or before this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Must be >= `created_at_start`
- `finished_at_start` (string, optional): Filter chats finished on or after this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Only applicable to archived chats
- `finished_at_end` (string, optional): Filter chats finished on or before this datetime. Recommended format: ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`. Must be >= `finished_at_start`. Only applicable to archived chats

**Returns:**
Paginated list of archived chats. Each item includes origin, canceled/assessment status, client, requestor, department, last client message (truncated at 150 chars), creation date, and — when the chat has a linked ticket — `Ticket: #<number> — <title>` (title normalized to a single line and truncated at 150 chars; the whole line is omitted when no ticket is linked).

**Example:**
```json
{
  "canceled": false,
  "created_at_start": "2026-06-01T00:00:00Z",
  "created_at_end": "2026-06-30T23:59:59Z",
  "finished_at_start": "2026-06-15T00:00:00Z",
  "limit": 50
}
```

### list_chat_messages
Listar as mensagens de um chat em ordem cronológica (transcrição da conversa). Retorna autor, horário, texto ou referência de anexo, reply citado e status de entrega quando disponível. Suporta paginação offset/limit.

**Parameters:**
- `id` (number, required): Numeric ID of the chat (also accepts numeric string — the handler calls parseInt)
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Messages per page (default: 20, max: 200)

**Returns:**
Conversation transcript in Markdown. Each message includes:
- Author + role in Portuguese (client → Cliente, attendant → Atendente, system → Sistema, ai → IA), including the name when available
- Timestamp (`created_at`)
- Message text (truncated at 150 chars) **or** attachment reference `[anexo: <caption> (<content_type>)]` when `media ≠ null`
- `↩ resposta a: "<excerpt>"` when `quoted_message` is present (excerpt truncated at 80 chars)
- Delivery status when relevant (lido / entregue / ⚠ falhou)

Errors: 404 when the chat does not exist, 403 when the account lacks permission or WhatsApp license.

**Example:**
```json
{
  "id": 42,
  "offset": 1,
  "limit": 50
}
```

### update_chat
Atualizar um chat existente: transferir o atendente (`user_id`), transferir o departamento (`department_id`) e/ou vincular o chat a um ticket (`ticket_number`). Só é possível atualizar um chat que **não esteja cancelado ou encerrado**.

**Parameters:**
- `id` (number, required): Chat ID (accepts numeric string — handler runs `parseInt`)
- `user_id` (number, optional): Attendant the chat will be transferred to
- `user_name` (string, optional): Attendant name for automatic lookup (alternative to `user_id`; `user_id` takes precedence). **Caveat (BL-007):** requires an admin API key — `GET /users` returns 403 for non-admin accounts; in that case use `user_id` directly.
- `department_id` (number, optional): Department the chat will be transferred to. **No `department_name`** — to find the ID from a name, use `list_departments` first (e.g. `list_departments name:"financeiro"`).
- `ticket_number` (number, optional): Ticket number to link to the chat

**Note:** At least one of `user_id` / `user_name` / `department_id` / `ticket_number` is required. If none is provided, the tool returns a friendly warning without calling the API.

**Example:**
```json
{
  "id": 37,
  "user_id": 1,
  "ticket_number": 127
}
```

**Returns:** Markdown confirmation with the list of applied changes.

### send_message
Enviar uma mensagem por WhatsApp, **criando o chat no envio**. Use mensagem livre (`message`) **ou** modelo HSM / modelo de chat (`template_id`), nunca os dois juntos.

> **`message` é texto plano (NÃO Markdown/HTML).** O WhatsApp usa marcação própria (asterisco para negrito, underscore para itálico); HTML apareceria literal. Por isso, diferentemente de `description`/`answer` de ticket, o conteúdo **não é convertido** para HTML.

**Parameters:**
- `number` (number, required): Destination phone number. Validated as Brazilian by default; for another country also pass `country_code`.
- `integration_id` (number, required): WhatsApp integration ID. Accepted types: `gupshup`, `whatsapp_cloud`.
- `message` (string, optional): Free-text message (plain text). Use `message` OR `template_id`.
- `template_id` (number, optional): HSM / chat template ID. Use `parameters`/`header_parameters` for variables.
- `country_code` (string, optional): ISO 3166-1 alpha-2 country code (e.g. `US`). Default `BR`.
- `name` (string, optional): Requester name.
- `department_id` (number, optional): Link the created chat to a department.
- `ticket_number` (number, optional): Link the created chat to a ticket.
- `client_id` (number, optional): Link the created chat to a client.
- `parameters` (string[], optional): Values for the HSM body variables (`template_id`).
- `header_parameters` (string[], optional): Values for the HSM header variables — `whatsapp_cloud` only.
- `archive` (boolean, optional): Default `false`. `true` = create and send straight to the finished/archived box.

**Note:** Besides `number` + `integration_id`, at least one of `message` / `template_id` is required (validated locally). Success status from the API: **201**.

**Example (free message):**
```json
{
  "number": 5568976728276,
  "integration_id": 1,
  "message": "Olá, tudo bem?"
}
```

**Example (HSM template with parameters):**
```json
{
  "number": 5519993017428,
  "integration_id": 1,
  "template_id": 1,
  "parameters": ["Valor 1", "Valor 2"]
}
```

**Returns:** Markdown confirmation with the send details (type, number, integration, links).

### archive_chat
Finalizar (encerrar) um chat. A API responde **202 (Accepted)** — o encerramento pode ser processado de forma assíncrona; o tool trata 202 como sucesso.

**Parameters:**
- `id` (number, required): Chat ID to finish (accepts numeric string — handler runs `parseInt`)
- `services_catalogs_item_id` (number, optional): Service catalog item ID. **Conditional:** required **only** when the organization is configured to "Usar catálogo de serviços no chat" — otherwise the API returns 422. **No `catalog_item_name`**: catalog item search requires a `desk_id`, which the chat does not provide; pass the ID directly when needed.

**Example:**
```json
{
  "id": 37,
  "services_catalogs_item_id": 1
}
```

**Returns:** Markdown confirmation that the chat was finished (202 Accepted).

### get_chats_feedback_report
Relatório de avaliações de atendimento (CSAT) de chats com comparação automática de período. Retorna métricas de satisfação (média, avaliados, finalizados, taxa de resposta) com deltas entre dois períodos, e opcionalmente a lista de chats avaliados.

**When to use vs other tools:**
- **CSAT / satisfaction ratings for CHATS** → `get_chats_feedback_report` (this tool)
- **CSAT / satisfaction ratings for TICKETS** → `get_tickets_feedback_report`
- **Ticket count / trend comparison** → `get_tickets_comparison`

**Default comparison period:** if `compare_start_date`/`compare_end_date` are not provided, the comparison period is the immediately preceding period of the same duration. Provide only `start_date` and `end_date` and the comparison window is calculated automatically.

**No filter by rating in the API** — to filter by rating, use `include_list=true` and filter the returned list by `rating` client-side (e.g., "show only chats with rating < 3").

**Note:** The `comments` field (evaluation comment) is **not available** in the chats report — only in the tickets report.

**Enrichment workflow:**
1. Run with `include_list=true` to get the list of evaluated chats (with `rating`, `rating_time`, client, responsible, linked ticket number).
2. For full chat details (requestor, department, service catalog, origin, timestamps) → use `get_chat` with the `id` returned.

**Note:** This report requires **administrator/reports permission** — non-admin API keys receive 403.

**Parameters:**
- `start_date` (string, required): Start of the main period (YYYY-MM-DD, e.g., "2026-07-01")
- `end_date` (string, required): End of the main period (YYYY-MM-DD, e.g., "2026-07-31")
- `compare_start_date` (string, optional): Start of comparison period (YYYY-MM-DD). Must be provided with `compare_end_date`. If omitted, the immediately preceding period of the same duration is used.
- `compare_end_date` (string, optional): End of comparison period (YYYY-MM-DD). Pair with `compare_start_date`.
- `include_list` (boolean, optional): If true, includes the paginated list of evaluated chats in the main period. Default: false.
- `offset` (integer, optional): Page number for the list (default: 1). Only relevant with `include_list=true`.
- `limit` (integer, optional): Items per page (default: 20, max: 200). Only relevant with `include_list=true`.
- `responsible_ids` (string, optional): Comma-separated responsible user IDs (max 15). Applied to both calls (main + comparison).
- `department_ids` (string, optional): Comma-separated department IDs (max 15). Applied to both calls.
- `technical_group_ids` (string, optional): Comma-separated technical group IDs (max 15). Applied to both calls.

**Example — compare this week vs last week:**
```json
{
  "start_date": "2026-07-07",
  "end_date": "2026-07-13"
}
```

**Example — get list of evaluated chats to filter by rating client-side:**
```json
{
  "start_date": "2026-07-01",
  "end_date": "2026-07-31",
  "include_list": true,
  "limit": 100
}
```

**Rich response example:**
```markdown
**📊 Relatório de avaliações de atendimento — Chats**

**Período principal:** 2026-07-01 a 2026-07-31
**Período de comparação:** 2026-05-31 a 2026-06-30

| Métrica | Período atual | Período anterior | Δ |
|---------|--------------|-----------------|---|
| Média de avaliação | **4.5** | 4.0 | +0.5 (+12.5%) |
| Chats avaliados | **20** | 15 | +5 (+33.3%) |
| Chats finalizados | **100** | 80 | +20 (+25%) |
| Clientes avaliadores | **15** | 12 | +3 (+25%) |
| Taxa de resposta (%) | **80.0** | 75.0 | +5 (+6.7%) |

*✅ Dados obtidos da API TiFlux em tempo real*
```

## Desk Tools

Explore and inspect desks (service queues) without leaving the chat. Use `list_desks` to discover available desks, `get_desk` to inspect full configuration, `list_desk_priorities` to discover priority IDs before creating tickets, and `list_desk_services_catalogs` to list service catalog containers linked to a desk.

### list_desks
Listar mesas (desks) disponiveis no tenant para descoberta e exploracao. Retorna tabela com id, nome, display name, status ativo e tipo de atendimento. Use antes de criar tickets ou para explorar quais mesas existem. Para localizar uma mesa por nome (parcial/fuzzy), use `get_desk` com `desk_name`.

**Parameters:**
- `active` (boolean, optional): Filter active (`true`) or inactive (`false`) desks. Default: `true` (active only)
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Returns:** Markdown table with `id`, `name`, `display_name`, active status and `appointment_type`.

**Example:**
```json
{
  "active": true,
  "limit": 50
}
```

### get_desk
Retornar configuracoes completas de uma mesa (30+ campos) agrupadas em secoes: Identificacao, Atendimento, SLA, Comportamento de tickets e Campos obrigatorios no formulario. Campos vazios ou falsy sao omitidos automaticamente.

Accepts `desk_id` (direct) **or** `desk_name` (fuzzy, uses the same Smart Name Resolution mechanism). If both are provided, `desk_id` takes precedence.

**Parameters:**
- `desk_id` (number, optional): Numeric desk ID. If provided, used directly without name resolution
- `desk_name` (string, optional): Partial, full or multi-word desk name (tokens in any order) — e.g. `"cansados"` or `"dev cansados"` resolve to `"Dev - Cansados"`; `"dev experimentos"` resolves to `"DEV - Experimentos"` (see Smart Name Resolution). Alternative to desk_id

**Note:** At least one of `desk_id` or `desk_name` is required.

**Returns:** Markdown with sections covering:
- **Identificacao**: name, display name, description, active status, internal desk flag, receiving new tickets
- **Atendimento**: appointment type, attendance type, permissions, cancelable tickets, feedback, e-mail settings, desk exchange
- **SLA**: SLA active flag, SLA goal, can stop SLA, SLA time tracking
- **Comportamento de tickets**: ticket review settings, reopening rules, time limits, billing behavior
- **Campos obrigatorios no formulario**: required fields, service catalog requirements

**Example:**
```json
{
  "desk_id": 3
}
```

Or using fuzzy name resolution:
```json
{
  "desk_name": "cansados"
}
```

### list_desk_priorities
Listar prioridades configuradas em uma mesa do Tiflux. Use para descobrir os IDs de prioridade antes de criar ou atualizar tickets (ex: "alta prioridade" → `priority_id`). O filtro `priority_name` e feito client-side com fuzzy match apos buscar os registros da API.

Accepts `desk_id` (direct) **or** `desk_name` (fuzzy). If both are provided, `desk_id` takes precedence.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `desk_id` | number | one of | — | Numeric desk ID. Used directly, no name lookup |
| `desk_name` | string | one of | — | Partial or exact desk name (fuzzy resolved). Alternative to `desk_id` |
| `priority_name` | string | no | — | Optional fuzzy filter on priority name (client-side). E.g. `"alta"` |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table with `id`, `name`, `order`, `start_time`, `end_time`.

**Example — list all priorities by desk_id:**
```json
{
  "desk_id": 3
}
```

**Example — filter by priority name using desk_name:**
```json
{
  "desk_name": "suporte",
  "priority_name": "alta"
}
```

**Example response:**
```
| ID | Nome | Ordem | Inicio | Fim |
|---|---|---|---|---|
| 17 | High | 1 | 04:00 | 24:00 |
| 18 | Low | 2 | 10:00 | 48:00 |
```

### list_desk_services_catalogs
Listar catalogos de servicos vinculados a uma mesa do Tiflux. Catalogos sao os containers pai — diferentes dos itens de catalogo (use `search_catalog_item` para itens selecionaveis em tickets). O filtro `catalog_name` e feito client-side com fuzzy match.

> **Disambiguation:** this tool is **desk-scoped** (catalogs linked to a specific desk, operations view). To list, create, update or delete catalogs org-wide (configuration/management view), use `list_services_catalogs` and the other `*_services_catalog*` tools.

Accepts `desk_id` (direct) **or** `desk_name` (fuzzy). If both are provided, `desk_id` takes precedence.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `desk_id` | number | one of | — | Numeric desk ID. Used directly, no name lookup |
| `desk_name` | string | one of | — | Partial or exact desk name (fuzzy resolved). Alternative to `desk_id` |
| `catalog_name` | string | no | — | Optional fuzzy filter on catalog name (client-side). E.g. `"infra"` |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table with `id`, `name`.

**Example — list all catalogs:**
```json
{
  "desk_name": "suporte"
}
```

**Example — filter by catalog name:**
```json
{
  "desk_id": 3,
  "catalog_name": "infra"
}
```

**Example response:**
```
| ID | Nome |
|---|---|
| 6 | Catalogo 1 |
| 7 | Catalogo 2 |
```

## Department Tools

Discover department IDs by name — required for filtering chats by department. The two-step flow: `list_departments(name:"financeiro")` → get `id` → `list_my_chats(department_id:...)`.

### list_departments
Listar departamentos da organização com filtro opcional de busca parcial por nome. Use para descobrir o `department_id` a partir de um nome antes de filtrar chats. Retorna tabela `ID | Nome`.

**Permissions:** Admin API keys return all active departments. Technical (non-admin) keys return only departments linked to their attendant group.

**Parameters:**
- `name` (string, optional): Partial name search, case-insensitive (e.g. `"financeiro"`, `"suporte"`). Max 255 characters.
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Returns:** Markdown table with `ID` and `Nome` columns.

**Example:**
```json
{
  "name": "financeiro"
}
```

**Example response:**
```
| ID | Nome |
|---|---|
| 3 | Financeiro |
```

Use the `id` as `department_id` in `list_inbox_chats`, `list_my_chats`, `list_in_attendance_chats`, or `list_archived_chats`.

## Knowledge Base Tools

Search and manage the organization's knowledge base articles. Without the "Gerenciar base de conhecimento" permission, only public articles and those from the user's attendant group are returned.

### list_knowledges
List knowledge base articles with optional search and folder filters. Returns a Markdown table with ID, title, visibility, folders, tags, and last updated date.

**Permissions:** Without "Gerenciar base de conhecimento" — only public articles and those from the user's attendant group. With the permission — all articles.

**Note:** The `description` field returned by the API is truncated at 300 characters (preview only — partial content).

**Parameters:**
- `search` (string, optional): Search by title, tags, or beginning of the description (case-insensitive).
- `knowledge_folder_ids` (array of numbers, optional): Filter by folder IDs. Example: `[1, 2]`.
- `limit` (number, optional): Results per page (default: 20, max: 200).
- `offset` (number, optional): Page number (default: 1).

**Returns:** Markdown table with columns `ID | Titulo | Privado | Pastas | Tags | Atualizado`.

**Example:**
```json
{
  "search": "VPN",
  "knowledge_folder_ids": [1],
  "limit": 10
}
```

**Example response:**
```
| ID | Titulo | Privado | Pastas | Tags | Atualizado |
|---|---|---|---|---|---|
| 101 | Como configurar VPN | Sim | 1, 2 | VPN, acesso remoto | 01/06/2026 |
```

*A descricao e exibida truncada em ate 300 caracteres pela API (preview parcial).*

### create_knowledge
Create a new knowledge base article. Requires the "Gerenciar conhecimento" permission.

**Required fields:**
- `title` (string): Article title.
- `description` (string): Article body in HTML (e.g. `"<p>Content here.</p>"`).
- `knowledge_folder_ids` (array of numbers, min 1): IDs of the folders where the article will be published. Example: `[12, 34]`.

**Optional fields:**
- `tags` (array of strings): Tags for the article. Tags must not contain commas. Example: `["VPN", "remote access"]`.
- `private` (boolean): Whether the article is private (default: `true`). If `false`, the article is public.
- `client_ids` (array of numbers): Client IDs with access — only relevant when `private: true`. Example: `[100, 200]`.
- `technical_group_ids` (array of numbers): Technical group IDs with access — only relevant when `private: true`. Example: `[5, 10]`.
- `services_catalogs_item_ids` (array of numbers): Related service catalog item IDs. Example: `[301, 302]`.

**Returns:** Confirmation with the created article's ID, title, visibility, folders, tags, and related IDs.

**Example:**
```json
{
  "title": "How to configure VPN",
  "description": "<p>Step-by-step VPN setup guide for remote access.</p>",
  "knowledge_folder_ids": [1, 2],
  "tags": ["VPN", "remote access"],
  "private": true,
  "technical_group_ids": [5]
}
```

**Example response:**
```
Conhecimento criado com sucesso!

**ID:** 201
**Titulo:** How to configure VPN
**Visibilidade:** Privado
**Pastas:** 1, 2
**Tags:** VPN, remote access
**Grupos tecnicos vinculados:** 5
```

### list_contracts
List the organization's contracts (read-only). Returns a Markdown table with 9 columns: ID, name, client, contract type, modality, status (with `(cancelado)` suffix when applicable), expiration date, readjustment date, and total value.

**Note:** Only `GET /contracts` exists in the API v2 — there is no `GET /contracts/{id}` and no endpoint to list contract types. This means `contract_type_ids` filter IDs can only be discovered via `include_details: true`, which surfaces `contract_type.id` for each contract.

**Permissions:** The monetary fields (`rider_tax`, `rider_value`) are only available in the details block when using `include_details: true`, and only for users with the "Visualizar valores dos tickets" permission. Without it, the API returns `"--"` for those fields (rendered as-is). `total_value` is shown in the default table column.

**Parameters (all optional):**
- `include_details` (boolean, default `false`): When `true`, appends a detail block after the table with one line per contract showing `client.id` (useful in `client_ids`), `contract_type.id` (useful in `contract_type_ids`), `duration`, `readjust_duration`, and `rider_value`/`rider_tax`. **Not sent to the API — rendering-only.**
- `client_ids` (string, CSV): Filter by clients, IDs separated by commas (e.g. `"982,2,1024"`).
- `contract_type_ids` (string, CSV): Filter by contract types, IDs separated by commas (e.g. `"3,27"`).
- `status` (string, CSV): Filter by status — `actives`, `readjust`, `expired`, separated by commas (e.g. `"actives,expired"`). **By default the API lists only `actives`.**
- `limit` (number, optional): Results per page (default: 20, max: 200).
- `offset` (number, optional): Page number (default: 1).

**Returns:** Markdown table with columns `ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Reajuste | Valor total`. Modality and status are translated to PT-BR (unknown enum values fall back to the raw API value). Dates are rendered as ISO `YYYY-MM-DD`. Monetary values are formatted as `R$ 1.234,56` (with thousand separator). Status `expired` + `cancelled: true` renders as `Inativo (cancelado)`. Total contract count from `X-Total-Items` header is shown in the pagination footer when available. With `include_details: true`, a `**Detalhes**` section follows the table.

**Example:**
```json
{
  "client_ids": "44",
  "status": "actives,expired",
  "include_details": true,
  "limit": 10
}
```

**Example response:**
```
| ID | Nome | Cliente | Tipo | Modalidade | Situação | Expiração | Reajuste | Valor total |
|---|---|---|---|---|---|---|---|---|
| 87508 | Contrato de licença de uso | 2V Sistemas | Contrato Tiflux | SaaS/Produto | Ativo | — | 2027-05-25 | R$ 974,30 |
| 103 | Contrato Expirado | Initech | Suporte | Horas | Inativo (cancelado) | 2024-12-31 | 2024-01-01 | R$ 28.963,20 |

**Detalhes**
- **#87508** · cliente ID 2274047 · tipo ID 178 · duracao: — · reajuste a cada 12 meses · adicional: R$ 974,30 (taxa R$ 0,00)
```

### list_equipments
List equipments/resources of the organization. Returns a Markdown table with ID, name, client, type, group, online status, and IP address for each resource. Optional blocks for manufacturer (`manufacturer`) and OS (`system`) info can be requested via flags — only populated for machines with the TiFlux agent installed.

**Note:** Agent-specific fields (`online`, `ipv4`, `last_seen`, `agent`) are only present for machines with the TiFlux agent. Manual resources (no agent) show `—` in those columns.

**Permissions:** Requires "Visualizar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `client_id` | number | no | — | Filter resources of a specific client (client ID) |
| `include_manufacturer` | boolean | no | false | Include manufacturer info (make, model, serial/asset tag). Only populated for agent-machines |
| `include_system` | boolean | no | false | Include OS info (name, version, kernel, timezone). Only populated for agent-machines |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table `ID | Nome | Cliente | Tipo | Grupo | Online | IP`. When `include_manufacturer`/`include_system` are requested and present, additional sections are appended below the table. Pagination footer with total count when available.

**Example:**
```json
{ "client_id": 724, "include_manufacturer": true, "limit": 50 }
```

**Typical flows:**
- "Machines of client X online?" → `list_equipments` with `client_id` → filter `online`.
- "Manufacturer/asset tag of a machine?" → `list_equipments` with `include_manufacturer: true`.

---

### get_equipment
Get full details of a single equipment/resource by ID. Returns a comprehensive Markdown report including hardware inventory (processor, memory, disks, network adapters, sound, video, OS, manufacturer, antivirus, etc.), client, type, group, last contact date, acquisition/warranty dates (when set), and optional custom fields.

**Note:** The detail endpoint always includes hardware inventory when the TiFlux agent is installed — no extra flags needed. Fields like `agent_email`/`agent_user` may be `null` on some machines and populated on others. The `network` adapter `ipv4` field is a comma-separated string that may contain multiple IPv4 and IPv6 addresses.

**Inventory fields returned by the API** (verified against real payloads on 2026-08-07): `processor.name`; `memory.total_gb` (number, GB); `motherboard.{manufacturer,model,bios}`; `disks[].{name,size_gb,use_percent}`; `disksmart[].{model,status}`; `network[].{name,ipv4,mac}`; `printer[].{name,port,default}`; `sound[].name`; `vga[].{name,vram_mb}`; `operating_system.{name,version,kernel,service_pack}` (`kernel` carries the architecture, e.g. `"64 bits"`); `windows_update.{pending_count,has_critical_pending}`; `manufacturer.{name,model,serial}`; `antivirus[].{name,active,up_to_date}`; plus `current_user`.

**Permissions:** Requires "Visualizar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `equipment_id` | number | yes | Resource ID — use `list_equipments` to discover |
| `show_entities` | boolean | no | Include custom fields (entities) linked to the resource (default: false) |

**Returns:** Full Markdown report with all available inventory sections. Sections for empty/null inventory blocks are omitted automatically.

**Example:**
```json
{ "equipment_id": 385053 }
```

```json
{ "equipment_id": 385053, "show_entities": true }
```

---

### create_equipment
Create a new equipment/resource in TiFlux.

**Permissions:** Requires "Gerenciar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Resource name (max 255 chars) |
| `client_id` | number | yes | Client ID the resource belongs to |
| `equipment_type_id` | number | yes | Resource type ID — use `list_equipment_types` to discover |
| `equipment_group_id` | number | no | Resource group ID — use `list_equipment_groups` with `client_id` to discover. If omitted, API auto-assigns to the first group of the client |
| `acquisition_date` | string | no | Acquisition date (YYYY-MM-DD) |
| `warranty_date` | string | no | Warranty end date (YYYY-MM-DD; must be >= `acquisition_date`) |

**Returns:** Confirmation text with resource ID, name, client, type, and group.

**Example:**
```json
{
  "name": "Notebook do João",
  "client_id": 724,
  "equipment_type_id": 1,
  "equipment_group_id": 5,
  "acquisition_date": "2024-03-15",
  "warranty_date": "2027-03-15"
}
```

**Tip:** Types and groups are organization-specific — run `list_equipment_types` and `list_equipment_groups` (with `client_id`) before creating to get the correct IDs.

---

### update_equipment
Update an existing equipment/resource in TiFlux. Only provided fields are sent in the update.

**Note:** `client_id` cannot be changed via update — to change the client, create a new resource.

**Permissions:** Requires "Gerenciar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `equipment_id` | number | yes | Resource ID to update |
| `name` | string | no | New name (max 255 chars) |
| `equipment_type_id` | number | no | New type ID |
| `equipment_group_id` | number | no | New group ID — must belong to the same client as the resource |
| `acquisition_date` | string | no | New acquisition date (YYYY-MM-DD) |
| `warranty_date` | string | no | New warranty end date (YYYY-MM-DD; must be >= `acquisition_date`) |

**Returns:** Confirmation text with resource ID, name, and updated fields.

---

### list_equipment_softwares
List software installed on a resource (collected by the TiFlux agent). Returns a Markdown table with name, version, and vendor of each software.

**Note:** Only resources with the TiFlux agent installed have a software inventory. Manual resources (no agent) return an empty list — the response message clarifies this.

**Permissions:** Requires "Visualizar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `equipment_id` | number | yes | Resource ID — use `list_equipments` to discover |

**Returns:** Markdown table `Nome | Versao | Fabricante`. Empty list message explains that inventory is only available for agent-machines.

**Example:**
```json
{ "equipment_id": 11 }
```

---

### list_equipment_groups
List equipment/resource groups. Returns a Markdown table with ID, name, and client for each group.

**Note:** Groups are client-scoped — each client can have different groups. Use `client_id` to filter groups before creating a resource.

**Permissions:** Requires "Visualizar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `client_id` | number | no | — | Filter groups of a specific client — recommended when creating resources |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table `ID | Nome | Cliente` with pagination footer.

**Example:**
```json
{ "client_id": 724, "limit": 50 }
```

---

### list_equipment_types
List equipment/resource types of the organization. Returns a Markdown table with ID and name.

**Note:** Types are organization-specific. Common defaults: "Estação", "Hardware", "Software". Use this to get the correct `equipment_type_id` before creating a resource.

**Permissions:** Requires "Visualizar recursos" permission + Tickets License.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no | — | Filter by name (partial, case-insensitive, max 255 chars). E.g. `"esta"` matches "Estação" |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table `ID | Nome` with pagination footer.

**Example:**
```json
{ "name": "esta" }
```

---

## Pre-Ticket Tools

### list_pre_tickets
List pre-tickets of the organization. Pre-tickets are service requests in a pre-triage stage — they carry requestor data, title, description, and optional client/equipment links, but have not yet been converted into tickets.

**Permissions:** Requires Tickets license + "Gerenciar pré-tickets" permission.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `archived` | boolean | no | false | If `true`, returns only archived pre-tickets; if `false`, returns only active ones |
| `client_id` | number | no | — | Filter by client ID. Example: `724` |
| `created_after` | string | no | — | Return pre-tickets created on or after this date (YYYY-MM-DD). Example: `"2026-07-01"` |
| `created_before` | string | no | — | Return pre-tickets created on or before this date (YYYY-MM-DD). Example: `"2026-07-31"` |
| `include_description` | boolean | no | false | If `true`, includes the `description` field in the response (omitted by default to reduce payload) |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table `ID | Título | Cliente | Solicitante | Criado em` with pagination footer. Empty list returns a message with guidance.

**Example:**
```json
{ "client_id": 724, "created_after": "2026-07-01", "limit": 50 }
```

---

### create_pre_ticket
Create a new pre-ticket in TiFlux. Pre-tickets represent incoming service requests before they are assigned and triaged into formal tickets. Supports file attachments.

**Permissions:** Requires Tickets license + "Gerenciar pré-tickets" permission.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Pre-ticket title |
| `description` | string | yes | Description/details of the request |
| `requestor_name` | string | yes | Requestor full name |
| `requestor_email` | string | yes | Requestor e-mail address |
| `requestor_telephone` | string | yes | Requestor telephone number |
| `requestor_ramal` | number | no | Requestor extension (ramal) |
| `requestor_country` | string | no | Requestor country (ISO 2-letter code). Example: `"BR"`, `"US"` |
| `client_id` | number | no | Client ID to associate with the pre-ticket. Example: `724` |
| `files` | array | no | Attachments. Each item: `{ "content": "<base64>", "filename": "file.pdf" }`. Max 10 files, 25MB each |

**Returns:** Confirmation text with pre-ticket ID, title, client, and requestor info.

**Example (minimal):**
```json
{
  "title": "Sistema fora do ar",
  "description": "Não consigo acessar o sistema desde as 8h.",
  "requestor_name": "João Silva",
  "requestor_email": "joao.silva@empresa.com",
  "requestor_telephone": "11999990001"
}
```

**Example (with client and attachment):**
```json
{
  "title": "Erro na impressão",
  "description": "A impressora da recepção não imprime documentos PDF.",
  "requestor_name": "Maria Souza",
  "requestor_email": "maria.souza@empresa.com",
  "requestor_telephone": "11999990002",
  "client_id": 724,
  "files": [{ "content": "<base64>", "filename": "screenshot.png" }]
}
```

---

### list_gupshup_templates
List HSM templates from the Gupshup WhatsApp integration available in the organization. Returns the name, approval status, category, content (with variables like `{{1}}`), description, and integration ID of each template. Use to discover the approved template IDs and names that feed `send_message` (origin: `gupshup`).

**Permissions:** Requires "Gerenciar Modelos" permission.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `integration_id` | number | no | — | Filter by Gupshup integration ID. Example: `2` |
| `offset` | number | no | 1 | Page number |
| `limit` | number | no | 20 | Results per page (max 200) |

**Returns:** Compact list — one line per template with name, status, category, integration ID, and a short preview (~70 chars) of the HSM content (variables like `{{1}}` preserved). The one-line format keeps the payload bounded even on a full 200-item page. To read a template's full content, narrow the list (e.g. by `integration_id`) and use a small page.

```
**Templates Gupshup (200)**

- **first_contact_with_org** (ID 15174) · APPROVED · UTILITY · int 1867 — _Olá, tudo bem? aqui é o {{1}} da {{2}}. Podemos conversar sobre o seu…_
- **hsm_template** (ID 1) · APPROVED · ALERT_UPDATE · int 1 — _You are in department {{1}}_
```

**Example:**
```json
{
  "integration_id": 2,
  "limit": 20
}
```

---

### list_whatsapp_cloud_templates
List templates from the WhatsApp Cloud (Meta) integration available in the organization. Returns name, approval status, language, category, Meta template ID, and a short preview of the body text. Use to discover templates that feed `send_message` (origin: `whatsapp_cloud`). Filter by `status: "APPROVED"` to see only templates ready to use.

**Permissions:** Requires "Gerenciar Modelos" permission.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `integration_id` | number | no | — | Filter by WhatsApp Cloud integration ID. Example: `4` |
| `status` | string | no | — | Filter by template status: `APPROVED`, `MISSING_VARS`, `REJECTED`, or `PENDING` |
| `offset` | number | no | 1 | Page number |
| `limit` | number | no | 20 | Results per page (max 200) |

**Returns:** Compact list — one line per template with name, status, language, category, Meta template ID, and a short preview (~70 chars) of the body text. `header`/`footer` are omitted from the list row to keep it scannable and the payload bounded on full pages.

```
**Templates WhatsApp Cloud (2)**

- **integracao_teste** (ID 1) · APPROVED · pt_BR · CATEGORY · tpl `bvwzyawdpyrtibavxvnrzcvswxqbltst` — _teste idioma_
```

**Example:**
```json
{
  "status": "APPROVED",
  "limit": 50
}
```

---

### list_entities
List custom field groups (entities) available in the Tiflux organization. Use to discover which custom field groups exist, which applications they apply to (`ticket`, `client`, etc.), and their IDs — required for `list_entity_fields`.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `active` | boolean | no | — | Filter active (`true`) or inactive (`false`) entities |
| `applied_in` | string | no | — | Filter by application: `"ticket"`, `"client"`, `"solicitant"`, `"services_catalog"`, `"services_catalogs_area"`, `"services_catalogs_item"`, `"equipment"` |
| `name` | string | no | — | Filter by entity name (partial match) |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table with `id`, `name`, `applied_in`, `active`.

**Example:**
```json
{
  "applied_in": "ticket"
}
```

**Example response:**
```
| ID | Nome | Applied In | Ativa |
|---|---|---|---|
| 10 | Classificação do Chamado | ticket | Sim |
| 11 | Dados do Atendimento | ticket | Sim |
```

### list_entity_fields
List subfields (entity_fields) of a custom field group in Tiflux. Returns name, type, required status, and indicates which fields have selectable options (single_select/checkbox) — use `list_entity_field_options` in those cases.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `entity_id` | number | yes | — | ID of the custom field group (entity). Obtain via `list_entities` |
| `field_type` | string | no | — | Filter by type: `"text"`, `"text_area"`, `"currency"`, `"phone"`, `"email"`, `"link"`, `"date"`, `"single_select"`, `"checkbox"` |
| `required` | boolean | no | — | Filter required (`true`) or optional (`false`) fields |
| `name` | string | no | — | Filter by field name |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table with `id`, `name`, `field_type`, `required`, and `options` hint for single_select/checkbox fields.

**Example:**
```json
{
  "entity_id": 10,
  "field_type": "checkbox"
}
```

**Example response:**
```
| ID | Nome | Tipo | Obrigatorio | Opcoes |
|---|---|---|---|---|
| 81 | Categoria do Impacto | checkbox | Nao | Sim (use list_entity_field_options) |
```

### list_entity_field_options
List options of a custom subfield (entity_field) of type `single_select` or `checkbox`. Use to get option IDs (`entity_field_option_id`) required when filling multiple-choice fields via `update_ticket_entities`.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `entity_field_id` | number | yes | — | ID of the subfield (entity_field). Obtain via `list_entity_fields` |
| `value` | string | no | — | Filter options by value/text (partial match) |
| `limit` | number | no | 20 | Results per page (max: 200) |
| `offset` | number | no | 1 | Page number |

**Returns:** Markdown table with option `id`, `value`, `null_option`.

**Example:**
```json
{
  "entity_field_id": 81
}
```

**Example response:**
```
| ID | Valor | Opcao nula |
|---|---|---|
| 11 | Hardware | Nao |
| 12 | Software | Nao |
| 13 | Rede | Nao |
| 14 | (nenhuma) | Sim |
```

## Search Heuristics — Mesa-First

When a user references a name without explicitly qualifying the entity type, the following priority applies:

| User input | Filter to use | Reason |
|---|---|---|
| "tickets do tuitui" (unqualified name) | `desk_name="tuitui"` | Unqualified term = desk/team in most cases |
| "tickets da mesa X" / "equipe Y" | `desk_name` | "mesa" / "equipe" = desk |
| "tickets do cliente Z" / "empresa ACME" | `client_name` | "cliente" / "empresa" = company |
| "tickets do João" (person name) | `requestor_email` or `requestor_ids` | Person = requestor |
| "tickets atribuídos ao João" | `responsible_name="João"` (or `responsible_ids` if you have the ID) | "atribuído a" = responsible — `responsible_name` resolves automatically for both admin and non-admin |
| "tickets aberto por joao@empresa.com" | `requestor_email` | Email = requestor |
| Ambiguous / uncertain | Ask the user | Visible failure > filtering by wrong entity |
| (create_ticket) "solicitante Fulano" | `requestor_name="Fulano"` — MCP auto-resolves to `requestor_id` | Avoids ghost requestor duplicate |

This heuristic is embedded in the `description` fields of `list_tickets`, `create_ticket`, and `update_ticket` schemas. The LLM reads these on every tool call decision.

## Smart Name Resolution

When using `desk_name` in any tool, the MCP server performs a two-step lookup:

1. **Direct search:** `GET /desks?active=true&name={desk_name}` — fast, uses the API's built-in filter.
2. **Fuzzy fallback (automatic):** If the direct search returns no results, the server fetches **all** active desks (paginated, up to 200 per page) and applies client-side fuzzy matching with tokenization and normalization (trim, lowercase, accent-insensitive). Works correctly regardless of how many desks the organization has. This handles common patterns like:
   - **Partial name:** `"cansados"` resolves to `"Dev - Cansados"`
   - **Accent-insensitive:** `"comunicacao"` resolves to `"Comunicação"`
   - **Token match:** `"premium"` resolves to `"Dev - Premium"`
   - **Multi-word (tokens in any order, separator-insensitive):** `"dev experimentos"` resolves to `"DEV - Experimentos"`

The fallback returns only the **highest-scoring group** of matches — so single-match terms resolve immediately, while ambiguous terms (multiple desks at equal score) return a disambiguation list.

**Behavior:**
- If exactly **1 desk** matches → auto-resolved, request proceeds normally.
- If **multiple desks** match at the same score → returns a list so you can be more specific or use `desk_id` directly.
- If **no match** → returns a clear error message.

This applies to: `create_ticket`, `update_ticket`, `list_tickets`, `search_stage`, `search_catalog_item`, `get_desk`, `list_desk_priorities`, and `list_desk_services_catalogs`.

**Appointment valorization resolution** (`create_appointment`): three additional name parameters resolve valorization IDs scoped to the ticket itself — no cross-organization ambiguity:
- `shift_name` → resolves to `shift_id` (fuzzy match over available travel shifts for the ticket)
- `loose_service_name` → resolves to `loose_service_id` (fuzzy match over available loose services)
- `contract_name` → resolves to `contract_rider_id` (fuzzy match over `contract_riders[].contract.name` — returns the **rider ID**, not the contract ID)

All three apply the same 0/1/N behavior: 0 matches → error with suggestion to use the corresponding `get_ticket_*` tool; 1 match → resolved; N matches → disambiguation list with IDs. When both the ID field and the name field are given, the ID takes precedence.

**Services catalog resolution** (all `*_services_catalog*` and `*_services_catalog_item*` tools): two additional name parameters resolve catalog and area IDs server-side using the API's built-in `ilike` filter (no client-side fuzzy):
- `services_catalog_name` → resolves to `services_catalog_id` via `GET /services-catalogs?name={value}&limit=50`
- `area_name` → resolves to `services_catalogs_area_id` via `GET /services-catalogs/{catalog_id}/areas?name={value}&limit=50`

Both apply the same 0/1/N behavior: 0 matches → error; 1 match → resolved; N matches → disambiguation list with IDs. When both the ID field and the name field are given, the ID takes precedence.

---

### get_billings_history
Returns the organization's billing history. Filters are all optional: billing period (`billing_start_date` + `billing_end_date`, mandatory in pair), due date period (`due_start_date` + `due_end_date`, mandatory in pair), client by ID (`client_id`) or name with fuzzy resolver (`client_name`), NFe number (`nfe_number`), ticket number (`ticket_number`), and billing status (`type`). The response is a 7-column table plus a page sum.

**Permissions:** Requires "Faturar serviços avulsos e contratos" + Tickets license. Returns **403** for users without billing permission.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `billing_start_date` | string | no (pair) | — | Start of billing period (`YYYY-MM-DD`). Must be used with `billing_end_date`. |
| `billing_end_date` | string | no (pair) | — | End of billing period (`YYYY-MM-DD`). Must be used with `billing_start_date`. |
| `due_start_date` | string | no (pair) | — | Start of due date period (`YYYY-MM-DD`). Must be used with `due_end_date`. |
| `due_end_date` | string | no (pair) | — | End of due date period (`YYYY-MM-DD`). Must be used with `due_start_date`. |
| `client_id` | number | no | — | Filter by client ID. Takes precedence over `client_name`. |
| `client_name` | string | no | — | Client name (partial or exact) for fuzzy auto-resolution. Ignored when `client_id` is provided. |
| `nfe_number` | number | no | — | Filter by NFe number. |
| `ticket_number` | number | no | — | Filter by ticket number associated with the billing. |
| `type` | string | no | — | Billing status: `billed`, `reversed`, or `paid`. Omit for all statuses. |
| `offset` | number | no | 1 | Page number. |
| `limit` | number | no | 20 | Results per page (max 200). |

**Returns:** Markdown table with 7 columns — ID, Cliente, Data faturamento, Vencimento, NFe, Situação, Valor — plus a page sum row (`Soma desta página (sem estornos)`) and pagination footer. Situação is derived: `reversal=true` → Estornado; `paid=true` → Pago; both false → Faturado. Monetary values formatted as `R$ X.XXX,XX`.

> **Page sum semantics:** `Soma desta página (sem estornos)` adds up `real_value` for the rows on the current page **excluding reversed billings** (`reversal=true`). A reversal is an in-place `UPDATE` on the billing record — the API returns its `real_value` as a **positive** number and there is no offsetting entry, so summing it would inflate the total and subtracting it would double-count (the reversed work can later be re-billed under a new `billing_id`). The product convention (internal report and native screen) is to **filter, not subtract**. When the page contains reversals, a note lists how many were excluded and their summed value. Note: `type: "paid"` does **not** exclude reversals (it filters by financial-integration status only) — use `type: "billed"` for a set with no reversals. The endpoint returns no monetary total for the filter, only the record count via the `X-Total-Items` header.

**Example:**
```json
{
  "billing_start_date": "2024-10-01",
  "billing_end_date": "2024-10-31",
  "type": "billed"
}
```

**Example response:**
```
**Faturamentos (1)**

| ID | Cliente | Data faturamento | Vencimento | NFe | Situação | Valor |
|---|---|---|---|---|---|---|
| 2 | Zemlak-Cremin | 2024-10-10 | 2024-10-15 | 4310034 | Faturado | R$ 755,90 |

**Soma desta página (sem estornos):** R$ 755,90
```

## Services Catalogs Tools

Manage the three-level catalog hierarchy: **catalog → area → item**. Catalogs and areas are containers; items are the SLA-bearing leaves that can be selected when creating tickets. All write operations require the **`service_catalogs_manage`** role ("Gerenciar catálogos de serviço").

> **No `get_*` shortcut exists.** The API does not expose `GET /services-catalogs/{id}`, `GET /services-catalogs-areas/{id}`, or `GET /services-catalogs-areas/{id}/items/{id}`. To retrieve details of a specific catalog, area, or item, use the corresponding `list_*` tool with the `name` filter.

> **Smart name resolution:** `services_catalog_name` and `area_name` are resolved server-side (API `ilike` filter, no fuzzy fallback). See [Smart Name Resolution](#smart-name-resolution).

### list_services_catalogs
List all service catalogs in the organization (org-wide configuration view). Use the `name` filter to locate a specific catalog.

**Different from** `list_desk_services_catalogs` (catalogs linked to one desk) and `search_catalog_item` (items selectable in tickets of a desk).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no | — | Filter by name (partial, case/accent-insensitive, server-side) |
| `offset` | number | no | 1 | Page number |
| `limit` | number | no | 20 | Results per page (max 200) |

**Returns:** List of catalogs with `id` and `name`. Header `X-Total-Items` for total count.

**Example:**
```json
{ "name": "Infra" }
```

### create_services_catalog
Create a new service catalog. The name must be unique across the organization (uniqueness validated only on create).

**Permissions:** Requires `service_catalogs_manage`.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | — | Catalog name (unique org-wide) |

**Returns:** Created catalog with `id` and `name`.

**Example:**
```json
{ "name": "Infraestrutura" }
```

### update_services_catalog
Update the name of an existing service catalog.

**Permissions:** Requires `service_catalogs_manage`. Note: uniqueness is validated only on create — the update accepts duplicate names without error (API v2 behavior).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | number | yes | — | Catalog ID |
| `name` | string | yes | — | New catalog name |

**Example:**
```json
{ "id": 5, "name": "Infraestrutura TI" }
```

### delete_services_catalog
Remove (soft delete) a service catalog and **all** its areas and items in cascade.

**Permissions:** Requires `service_catalogs_manage`.

**Warning:** The deletion cascade silently deactivates all areas, items, and recurring activities that reference those items — including items currently in use by tickets. The pre-flight count is **informational only, not a gate**: it runs before the DELETE (afterwards the records are already inactive and no longer countable) and its result is only appended to the success message. There is no `confirm` / `dry_run` parameter — the DELETE always proceeds, even if the pre-flight fails.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | number | yes | — | Catalog ID to delete |

**Example:**
```json
{ "id": 5 }
```

### list_services_catalog_areas
List active areas belonging to a service catalog. Use `services_catalog_id` (direct) or `services_catalog_name` (auto-resolved). Use the `name` filter to locate a specific area.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalog_id` | number | one of | — | Catalog ID (takes precedence over `services_catalog_name`) |
| `services_catalog_name` | string | one of | — | Catalog name for auto-resolution |
| `name` | string | no | — | Filter areas by name (partial, server-side) |
| `offset` | number | no | 1 | Page number |
| `limit` | number | no | 20 | Results per page (max 200) |

**Returns:** List of areas with `id`, `name`, and parent catalog name.

**Example:**
```json
{ "services_catalog_name": "Infraestrutura", "name": "Redes" }
```

### create_services_catalog_area
Create a new area inside a service catalog.

**Permissions:** Requires `service_catalogs_manage`.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalog_id` | number | one of | — | Catalog ID (takes precedence over `services_catalog_name`) |
| `services_catalog_name` | string | one of | — | Catalog name for auto-resolution |
| `name` | string | yes | — | Area name (unique per catalog) |

**Example:**
```json
{ "services_catalog_name": "Infraestrutura", "name": "Servidores" }
```

### update_services_catalog_area
Update the name of an area inside a service catalog.

**Permissions:** Requires `service_catalogs_manage`.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalog_id` | number | one of | — | Catalog ID (takes precedence over `services_catalog_name`) |
| `services_catalog_name` | string | one of | — | Catalog name for auto-resolution |
| `id` | number | yes | — | Area ID |
| `name` | string | yes | — | New area name |

**Example:**
```json
{ "services_catalog_id": 1, "id": 10, "name": "Servidores Linux" }
```

### delete_services_catalog_area
Remove (soft delete) an area and **all** its items in cascade.

**Permissions:** Requires `service_catalogs_manage`.

**Warning:** All items in the area are deactivated. The pre-flight count is **informational only, not a gate** — it runs before the DELETE just to report the number of affected items; there is no confirmation step and the DELETE always proceeds.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalog_id` | number | one of | — | Catalog ID (takes precedence over `services_catalog_name`) |
| `services_catalog_name` | string | one of | — | Catalog name for auto-resolution |
| `id` | number | yes | — | Area ID to delete |

**Example:**
```json
{ "services_catalog_id": 1, "id": 10 }
```

### list_services_catalog_items
List active items in a service catalog area. Use `services_catalogs_area_id` (direct) or the combination `area_name` + `services_catalog_id`/`services_catalog_name`.

**Different from** `search_catalog_item` which is desk-scoped (items selectable in tickets of a specific desk).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalogs_area_id` | number | one of | — | Area ID (takes precedence over `area_name`) |
| `area_name` | string | one of | — | Area name for auto-resolution (requires catalog id or name) |
| `services_catalog_id` | number | — | — | Catalog ID (used in area resolution; takes precedence over `services_catalog_name`) |
| `services_catalog_name` | string | — | — | Catalog name for auto-resolution |
| `name` | string | no | — | Filter items by name (partial, server-side) |
| `offset` | number | no | 1 | Page number |
| `limit` | number | no | 20 | Results per page (max 200) |

**Returns:** List of items with `id`, `name`, parent area/catalog names, `start_time` (SLA atendimento), `end_time` (SLA solução).

**Example:**
```json
{ "area_name": "Redes", "services_catalog_name": "Infraestrutura" }
```

### create_services_catalog_item
Create a new item in a service catalog area.

**Permissions:** Requires `service_catalogs_manage`.

**SLA fields:** `start_time` = attendance deadline (SLA de atendimento); `end_time` = solution deadline (SLA de solução). Format `"HH:MM"` with hours 0–999 (e.g. `"120:30"` = 120 h 30 min). `end_time` must be >= `start_time`. Both fields are required by the API (the Swagger declares `required: []` but the model enforces them).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalogs_area_id` | number | one of | — | Area ID (takes precedence over `area_name`) |
| `area_name` | string | one of | — | Area name for auto-resolution |
| `services_catalog_id` | number | — | — | Catalog ID (used in area resolution) |
| `services_catalog_name` | string | — | — | Catalog name for auto-resolution |
| `name` | string | yes | — | Item name |
| `start_time` | string | yes | — | SLA de atendimento (`HH:MM`, hours 0-999) |
| `end_time` | string | yes | — | SLA de solução (`HH:MM`, hours 0-999, >= `start_time`) |

**Example:**
```json
{
  "services_catalogs_area_id": 10,
  "name": "Troca de Switch",
  "start_time": "08:00",
  "end_time": "24:00"
}
```

### update_services_catalog_item
Update an item in a service catalog area (partial update — only provided fields are sent).

**Permissions:** Requires `service_catalogs_manage`.

At least one of `name`, `start_time`, or `end_time` must be provided. SLA format and `end_time >= start_time` constraint apply when both time fields are supplied.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalogs_area_id` | number | one of | — | Area ID (takes precedence over `area_name`) |
| `area_name` | string | one of | — | Area name for auto-resolution |
| `services_catalog_id` | number | — | — | Catalog ID (used in area resolution) |
| `services_catalog_name` | string | — | — | Catalog name for auto-resolution |
| `id` | number | yes | — | Item ID |
| `name` | string | no | — | New item name |
| `start_time` | string | no | — | New SLA de atendimento (`HH:MM`) |
| `end_time` | string | no | — | New SLA de solução (`HH:MM`, >= `start_time`) |

**Example:**
```json
{ "services_catalogs_area_id": 10, "id": 50, "end_time": "48:00" }
```

### delete_services_catalog_item
Remove (soft delete) a service catalog item. No cascade — items are leaf nodes.

**Permissions:** Requires `service_catalogs_manage`.

**Warning:** An item in use by tickets is silently deactivated (no blocking, no confirmation prompt). There is no pre-flight count for items.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `services_catalogs_area_id` | number | one of | — | Area ID (takes precedence over `area_name`) |
| `area_name` | string | one of | — | Area name for auto-resolution |
| `services_catalog_id` | number | — | — | Catalog ID (used in area resolution) |
| `services_catalog_name` | string | — | — | Catalog name for auto-resolution |
| `id` | number | yes | — | Item ID to delete |

**Example:**
```json
{ "services_catalogs_area_id": 10, "id": 50 }
```

## API Endpoints Used

The MCP server integrates with the following Tiflux API v2 endpoints:

- `GET /tickets/{id}` - Retrieve ticket details
- `POST /tickets` - Create new tickets (supports multipart with file attachments via `files_base64`; `requestor_id` body field links existing requestor)
- `PUT /tickets/{id}` - Update existing tickets (supports `requestor_id` to change the ticket's requestor; `followers` replaces the full list)
- `PUT /tickets/{id}/entities` - Update ticket custom fields
- `PUT /tickets/{ticket_number}/cancel` - Cancel specific ticket
- `PUT /tickets/{ticket_number}/close` - Close specific ticket
- `PUT /tickets/{ticket_number}/reopen` - Reopen closed or canceled ticket (supports optional `disapproval_reason`)
- `POST /tickets/{ticket_number}/answers` - Create ticket answer (client communication)
- `GET /tickets/{ticket_number}/answers` - List ticket answers (client communications), paginated
- `GET /tickets/{ticket_number}/answers/{id}` - Get specific ticket answer with attached files
- `DELETE /tickets/{ticket_number}/answers/{id}` - Remove a ticket answer (`delete_ticket_answer`)
- `DELETE /ticket_answers/{ticket_answer_id}/files/{id}` - Remove a file from a ticket answer (`delete_ticket_answer_file`)
- `GET /tickets/{ticket_number}/histories` - Get ticket event history (timeline) with optional filters
- `GET /tickets` - List tickets with filters (supports `requestor_ids`, `requestor_email`, `services_catalogs_item_ids`, `priority_ids` query params; response includes `services_catalog` and `priority` per ticket). Also supports `group_by` (values: day/week/month/desk) for aggregated counts — returns `{ group_by, date_type, total, buckets: [{period, count}] }` instead of a ticket list. **Note:** `group_by` and the aggregated response shape are not documented in the public Swagger as of 2026-06-30; the feature was added in api_rails ticket #96694 and is live in production. Used internally by `get_tickets_comparison` (2 calls per invocation) and `list_tickets` (with `group_by` param). A documentation request has been registered with the API team.
- `GET /clients` - Search/list clients (`search_client`, `list_clients`, and `client_name` auto-resolve in `list_tickets` and `create_ticket`)
- `GET /clients/{id}` - Get client details (`get_client`)
- `POST /clients` - Create a new client (`create_client`)
- `PUT /clients/{id}` - Update client fields (`update_client`)
- `PUT /clients/{id}/entities` - Update client custom fields (`update_client_entities`)
- `GET /clients/{id}/desks` - List desks associated with a client (`get_client_desks`)
- `GET /clients/{id}/technical-groups` - List technical groups associated with a client (`get_client_technical_groups`)
- `POST /clients/{id}/users` - Create a portal user for a client (`create_client_user`)
- `POST /clients/{id}/email_tickets_permissions` - Add authorized email/domain for a client (`add_client_email_permission`)
- `GET /clients/{client_id}/addresses` - List addresses of a client (`list_client_addresses`)
- `POST /clients/{client_id}/addresses` - Create an address for a client (`create_client_address`)
- `GET /clients/{client_id}/addresses/{id}` - Get a specific address of a client (`get_client_address`)
- `PUT /clients/{client_id}/addresses/{id}` - Update an address of a client (`update_client_address`)
- `DELETE /clients/{client_id}/addresses/{id}` - Remove an address from a client (`delete_client_address`)
- `GET /clients/{client_id}/contacts` - List contacts of a client (`list_client_contacts`)
- `POST /clients/{client_id}/contacts` - Create a contact for a client (`create_client_contact`)
- `GET /clients/{client_id}/contacts/{id}` - Get a specific contact of a client (`get_client_contact`)
- `PUT /clients/{client_id}/contacts/{id}` - Update a contact of a client (`update_client_contact`)
- `DELETE /clients/{client_id}/contacts/{id}` - Remove a contact from a client (`delete_client_contact`)
- `GET /requestors` - Search requestors with server-side filtering (`search_requestor`, and `requestor_name`/`requestor_email` auto-resolve in `create_ticket` and `update_ticket`). Used as fallback when the client-scoped route returns 403 or when no `client_id` is available.
- `GET /clients/{client_id}/requestors` - Client-scoped requestor listing/search. Powers `list_requestors`. **Primary route** for `requestor_name`/`requestor_email` auto-resolve in `create_ticket` and `update_ticket` when `client_id` is known (scoped-first since v2.37.0, eliminates ticket #98515 class of bug). Falls back to global `GET /requestors` on 403.
- `GET /clients/{client_id}/requestors/{id}` - Get a single requestor of a client (`get_requestor`; `include_entity_fields` for custom fields).
- `POST /clients/{client_id}/requestors` - Create a requestor in a client (`create_requestor`).
- `PUT /clients/{client_id}/requestors/{id}` - Update a requestor (`update_requestor`, partial).
- `PUT /clients/{client_id}/requestors/{id}/entities` - Update a requestor's custom fields (`update_requestor_entities`).
- `DELETE /clients/{client_id}/requestors/{id}` - Delete a requestor (mapped; **not yet implemented** as an MCP tool — out of current scope).
- `POST /users` - Create a new user/agent (`create_user`). Admin-only — returns 403 for non-admin keys.
- `GET /users/{id}` - Get user details (`get_user`). Admin-only.
- `PUT /users/{id}` - Update user fields (`update_user`, partial). Admin-only.
- `GET /users` - Search users (used by `search_user`, `responsible_name` auto-resolve, and as level 3 of the `search_requestor` fallback chain — the matched user's email becomes `requestor_email`). Returns 403 for non-admin users — handled automatically by the fallback below.
- `GET /users/me` - Current authenticated user (used as the final level of the `search_requestor` chain — suggests opening the ticket as yourself via `requestor_email`).
- `GET /technical-users` - Search technical attendants with server-side filtering by name, email, desk_id, client_id (`search_technical_user`). **Does not require user management permission** — works for admin and non-admin. **Primary path** for `responsible_name` auto-resolve in `create_ticket`, `update_ticket`, `list_tickets`. Note: absent from the public swagger.json as of 2026-06-18 but live in production.
- `GET /technical-groups` - List attendant groups (used by `search_user` non-admin fallback and as fallback for `responsible_name` resolution when `/technical-users` returns 404/403)
- `GET /technical-groups/{id}/users` - List users in an attendant group (non-admin fallback for `search_user` — deduplicated, fuzzy-matched)
- `GET /departments` - List organization departments with optional name search (`list_departments`). Admin: all active; non-admin: only linked to attendant group
- `GET /desks` - Search/list desks (used by Smart Name Resolution and `list_desks`)
- `GET /desks/{id}` - Get full desk configuration (`get_desk`)
- `GET /desks/{id}/priorities` - Get desk priorities (`list_desk_priorities`, `update_ticket` priority_name resolution, `list_tickets` priority_name resolution)
- `GET /desks/{id}/services-catalogs` - Get desk service catalogs (`list_desk_services_catalogs`)
- `GET /desks/{id}/stages` - Get desk stages
- `GET /desks/{id}/services-catalogs-items` - Get service catalog items (supports `?name` for server-side search by catalog/area/item name; used by `search_catalog_item` and `list_tickets` `catalog_query` resolver)
- `POST /tickets/{ticket_number}/internal_communications` - Create internal communication
- `GET /tickets/{ticket_number}/internal_communications` - List internal communications
- `GET /tickets/{ticket_number}/internal_communications/{id}` - Get specific internal communication
- `PUT /tickets/{ticket_number}/internal_communications/{id}` - Update internal communication text (`update_internal_communication`)
- `DELETE /tickets/{ticket_number}/internal_communications/{id}` - Remove an internal communication (`delete_internal_communication`)
- `GET /tickets/{ticket_number}/files` - Get ticket attached files
- `POST /tickets/{ticket_number}/files` - Upload files to an existing ticket (`upload_ticket_files`)
- `DELETE /tickets/{ticket_number}/files/{id}` - Remove a file attached to a ticket (`delete_ticket_file`)
- `GET /tickets/{ticket_number}/stages-slas` - Get ticket stages history with SLA outcomes
- `GET /tickets/{ticket_number}/service-types` - List service types available for valorization of a ticket appointment (contract riders and loose services). Used by `get_ticket_service_types` and by `create_appointment` for `loose_service_name`/`contract_name` resolution.
- `GET /tickets/{ticket_number}/shifts` - List displacements available for valorization of a ticket appointment (travel/visit costs, filterable by contract_id). Used by `get_ticket_shifts` and by `create_appointment` for `shift_name` resolution.
- `GET /tickets/{ticket_number}/checklists` - List checklists (forms) of a ticket with all fields and fill state (`get_ticket_checklists`; paginated via `offset`/`limit`; header `X-Total-Items` for total count)
- `PUT /tickets/{ticket_number}/checklists/{id}/items/{index}` - Fill or clear a single checklist field (`update_ticket_checklist_item`; payload: `{ value }` for text/textarea/value/radio or `{ options: [{id, checked}] }` for checkbox; `{ value: null }` clears any field)
- `POST /tickets/{ticket_number}/appointments` - Create a ticket appointment. Supports 9 valorization fields: `attendance` (1/2/3), `attendance_kind` (1/2), `contract_rider_id`, `loose_service_id`, `shift_id`, `shift_owner_ticket_number`, `guarantee`, `value`, `external_user_name`. Plus 3 name-resolution params: `shift_name`, `loose_service_name`, `contract_name`.
- `GET /appointments` - List global appointments across all tickets with server-side filters (user_ids, desk_ids, start_date, end_date, include_valorization); returns X-Total-Items header. Response includes `external_user_name` and `valorization.shift_owner_ticket`. Used by `list_appointments_global` and `list_appointments_report`.
- `GET /tickets/{ticket_number}/appointments` - List ticket appointments with filters; returns X-Total-Items header. Response includes `external_user_name` and `valorization.shift_owner_ticket`. Used by `list_appointments`.
- `GET /chats/{id}` - Retrieve chat details
- `GET /chats/inbox` - List inbox chats
- `GET /chats/mine` - List chats assigned to the authenticated user
- `GET /chats/in_attendance` - List chats currently in attendance
- `GET /chats/archived` - List archived (finished or canceled) chats
- `GET /chats/{id}/messages` - List messages of a chat in chronological order (`list_chat_messages`)
- `PUT /chats/{id}` - Update a chat (transfer attendant/department, link ticket)
- `POST /chats/send_message` - Send a WhatsApp message (free text or HSM template), creating the chat
- `PUT /chats/{id}/archive` - Finish (archive) a chat
- `GET /entities` - List custom field groups (`list_entities`)
- `GET /entities/{entity_id}/fields` - List custom subfields of an entity (`list_entity_fields`)
- `GET /entity_fields/{entity_field_id}/options` - List options of a single_select/checkbox field (`list_entity_field_options`)
- `GET /knowledges` - List knowledge base articles with optional search/folder filter (`list_knowledges`). Without "Gerenciar base de conhecimento" permission: public + attendant group only; with permission: all
- `POST /knowledges` - Create a new knowledge base article (`create_knowledge`). Requires "Gerenciar conhecimento" permission
- `GET /contracts` - List the organization's contracts (`list_contracts`), read-only. Returns 14 fields per contract; secondary fields (IDs, `rider_value`/`rider_tax`, durations) exposed via `include_details: true`. Header `X-Total-Items` for total count. No `GET /contracts/{id}` exists in the API; no endpoint to list contract types (IDs discoverable only via `include_details`). Monetary fields require "Visualizar valores dos tickets" permission (otherwise `"--"`).
- `GET /reports/feedbacks/chats` - Chats satisfaction/feedback report (`get_chats_feedback_report`). Returns `summary` (rating_average, chats_evaluated, chats_finished, clients_evaluated, answers_percentage); optional `chats_list` with `chats_list=true`. Requires administrator/reports permission (403 for non-admin).
- `GET /reports/feedbacks/tickets` - Tickets satisfaction/feedback report (`get_tickets_feedback_report`). Same structure as chats; list items use `tickets_list=true`, `rating` (integer), `revised_in_time` (timestamp), `comments` (plural, may be `""`), `desk_id`/`desk_name`. Requires administrator/reports permission (403 for non-admin).
- `GET /reports/billings/history` - Billing history report (`get_billings_history`). Returns paginated array of billing records with `billing_id`, `billing_date`, `client_id`, `client_name`, `due_date`, `nfe_number`, `paid`, `real_value`, `reversal`. Filters: `billing_start_date`/`billing_end_date` (pair), `due_start_date`/`due_end_date` (pair), `client_id`, `nfe_number`, `ticket_number`, `_type` (billed|reversed|paid). Header `X-Total-Items` for total count. Requires "Faturar serviços avulsos e contratos" permission + Tickets license (403 code `40301` without permission, `40304` without license).
- `GET /equipments` - List equipment/resources with optional filters (`list_equipments`). Supports `client_id`, `include_manufacturer`, `include_system` flags, pagination. Requires "Visualizar recursos" + Tickets License.
- `GET /equipments/{id}` - Get full details of a single equipment/resource (`get_equipment`). Returns hardware inventory, OS, manufacturer, network, custom fields (optional). Requires "Visualizar recursos" + Tickets License.
- `POST /equipments` - Create a new equipment/resource (`create_equipment`). Required: `name`, `client_id`, `equipment_type_id`. Optional: `equipment_group_id` (auto-assigned if omitted), `acquisition_date`, `warranty_date`.
- `PUT /equipments/{id}` - Update an existing equipment/resource (`update_equipment`). Partial update — only provided fields are sent.
- `GET /equipments/{id}/softwares` - List installed software on a resource (`list_equipment_softwares`). No pagination params — endpoint returns all at once.
- `GET /equipment-groups` - List equipment groups with optional `client_id` filter (`list_equipment_groups`). Paginated with `X-Total-Items`.
- `GET /equipment-types` - List equipment types with optional `name` filter (partial, case-insensitive) (`list_equipment_types`). Paginated with `X-Total-Items`.
- `GET /pre-tickets` - List pre-tickets (service requests in pre-triage) with optional filters (`list_pre_tickets`). Supports `archived`, `client_id`, `created_after`, `created_before`, `include_description`, pagination. Header `X-Total-Items` for total count. Requires Tickets license + "Gerenciar pré-tickets" permission.
- `POST /pre-tickets` - Create a new pre-ticket (`create_pre_ticket`). `multipart/form-data`. Required: `title`, `description`, `requestor_name`, `requestor_email`, `requestor_telephone`. Optional: `requestor_ramal`, `requestor_country`, `client_id`, `files[]` (max 10, 25MB each).
- `GET /templates/gupshup` - List HSM templates from the Gupshup integration (`list_gupshup_templates`). Filters: `integration_id`, `offset`, `limit`. Header `X-Total-Items` for total count. Requires "Gerenciar Modelos" permission.
- `GET /templates/whatsapp_cloud` - List templates from the WhatsApp Cloud (Meta) integration (`list_whatsapp_cloud_templates`). Filters: `integration_id`, `status` (enum: APPROVED/MISSING_VARS/REJECTED/PENDING), `offset`, `limit`. Header `X-Total-Items` for total count. Requires "Gerenciar Modelos" permission.
- `GET /services-catalogs` - List org-wide service catalogs (`list_services_catalogs`). Filter by `name` (ilike). Header `X-Total-Items`. Requires `service_catalogs_manage` role for write operations (read is unrestricted).
- `POST /services-catalogs` - Create a service catalog (`create_services_catalog`). Body `{ services_catalog: { name } }`. Name must be unique. Requires `service_catalogs_manage`.
- `PUT /services-catalogs/{id}` - Update a service catalog name (`update_services_catalog`). Body `{ services_catalog: { name } }`. Requires `service_catalogs_manage`.
- `DELETE /services-catalogs/{id}` - Soft-delete a service catalog and cascade-deactivate its areas and items (`delete_services_catalog`). Returns 204. Requires `service_catalogs_manage`.
- `GET /services-catalogs/{id}/areas` - List areas of a catalog (`list_services_catalog_areas`). Filter by `name`. Header `X-Total-Items`.
- `POST /services-catalogs/{id}/areas` - Create an area in a catalog (`create_services_catalog_area`). Body `{ area: { name } }`. Requires `service_catalogs_manage`.
- `PUT /services-catalogs/{catalog_id}/areas/{id}` - Update an area name (`update_services_catalog_area`). Body `{ area: { name } }`. Requires `service_catalogs_manage`.
- `DELETE /services-catalogs/{catalog_id}/areas/{id}` - Soft-delete an area and cascade-deactivate its items (`delete_services_catalog_area`). Returns 204. Requires `service_catalogs_manage`.
- `GET /services-catalogs-areas/{id}/items` - List items of an area (`list_services_catalog_items`). Filter by `name`. Header `X-Total-Items`.
- `POST /services-catalogs-areas/{id}/items` - Create an item in an area (`create_services_catalog_item`). Body `{ item: { name, start_time, end_time } }`. `start_time`/`end_time` in `HH:MM` format (hours 0-999). Requires `service_catalogs_manage`.
- `PUT /services-catalogs-areas/{area_id}/items/{id}` - Partial update of an item (`update_services_catalog_item`). Body `{ item: { name?, start_time?, end_time? } }`. Requires `service_catalogs_manage`.
- `DELETE /services-catalogs-areas/{area_id}/items/{id}` - Soft-delete an item (`delete_services_catalog_item`). Returns 204. Requires `service_catalogs_manage`.

## Avançado: execução local (SDK via npx)

> [!NOTE]
> Recomendamos o **servidor hospedado** (`https://mcp.tiflux.com` — veja [Como conectar](#como-conectar)): sempre atualizado, sem instalação e com mais controle e segurança. A execução local existe para cenários específicos (desenvolvimento, restrições de rede, ambientes offline).

Requisitos: Node.js >= 18.

Execute diretamente via `npx`:

```bash
npx @tiflux/mcp@latest
```

Ou instale globalmente:

```bash
npm install -g @tiflux/mcp
```

Configuração no cliente MCP (stdio):

```json
{
  "tiflux": {
    "command": "npx",
    "args": ["@tiflux/mcp@latest"]
  }
}
```

A chave de API é lida da variável de ambiente `TIFLUX_API_KEY`. Crie um arquivo `.env` (ou exporte as variáveis) com suas credenciais:

```bash
# Tiflux API Configuration
TIFLUX_API_KEY=your_api_key_here

# Default values for ticket creation
TIFLUX_DEFAULT_CLIENT_ID=1
TIFLUX_DEFAULT_DESK_ID=1
TIFLUX_DEFAULT_PRIORITY_ID=1
TIFLUX_DEFAULT_CATALOG_ITEM_ID=1
```

## Licença

MIT

## Suporte

Para suporte, entre em contato com o time Tiflux ou abra uma issue no [repositório público](https://github.com/tiflux/tiflux-mcp/issues).
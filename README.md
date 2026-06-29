# TiFlux MCP Server

Model Context Protocol (MCP) server for TiFlux integration with Claude Code and other AI clients.

## Features

- **Ticket Management**: Get, create, update, close and list tickets with comprehensive filtering. Supports desk transfer — when `desk_id`/`desk_name` is informed, the MCP auto-resolves the first stage of the destination desk.
- **Stages & SLA History**: Inspect the full history of ticket stages with per-stage SLA outcomes
- **Internal Communications**: Create and list internal communications for tickets with file attachments
- **Time Tracking (Appointments)**: Create and list work-hour appointments on tickets
- **Chat Management**: List inbox/mine/in-attendance/archived chats, fetch chat details, transfer/link chats, send WhatsApp messages and finish chats
- **Department Discovery**: List organization departments with optional name search — resolves department names to IDs for chat filtering (`list_departments`)
- **Knowledge Base**: List and create knowledge base articles — search by title/tags/description and filter by folder (`list_knowledges`, `create_knowledge`)
- **Desk Exploration**: List available desks and inspect full desk configurations (SLA, fields, behavior) without leaving the chat
- **Custom Field Discovery**: Discover custom fields (entities) at all three levels — entity → field → option — enabling LLMs to correctly fill checkbox/single_select fields using the right option IDs
- **Client CRUD**: Full CRUD for clients — get, create, update, list with filters, related desks/technical groups, portal users, and email permissions
- **Attendant Search (non-admin)**: Search technical attendants (responsible candidates) via `GET /technical-users` — no admin permission required. Supports server-side filtering by name, email, `desk_id`, and `client_id`. `responsible_name` auto-resolve in `create_ticket`, `update_ticket`, and `list_tickets` now uses this endpoint as the **primary path** (1 round-trip, works for all profiles including non-admin).
- **Requestor Search**: Search ticket openers (requestors) by name, email, or telephone via dedicated `GET /requestors` endpoint with server-side filtering (no 200-record limit). Includes an automatic fallback chain that works for non-admin attendants and finds people who only exist as users: `GET /requestors` → client-scoped `GET /clients/{id}/requestors` → `GET /users` (email used as `requestor_email`) → `GET /users/me` (open as yourself). Triggers on 403 or zero results
- **File Upload Support**: Attach up to 10 files (25MB each) to internal communications
- **API Integration**: Direct integration with TiFlux API v2
- **Environment Configuration**: Secure configuration with environment variables
- **Comprehensive Testing**: Automated tests with 100% mock isolation

## Installation

```bash
npm install -g @tiflux/mcp
```

## Usage

### With Claude Code

Add to your MCP configuration:

```json
{
  "tiflux": {
    "command": "npx",
    "args": ["@tiflux/mcp@latest"]
  }
}
```

### With Other MCP Clients

```bash
npx @tiflux/mcp@latest
```

### Via URL (HTTP Transport)

**Endpoint:** `https://mcp.tiflux.com/mcp`

```bash
claude mcp add tiflux-lambda --transport http https://mcp.tiflux.com/mcp --header "x-tiflux-api-key:APIKEY" -s project
```

#### Manual Configuration

Add to `.claude/settings.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "tiflux": {
      "type": "url",
      "url": "https://mcp.tiflux.com/mcp",
      "headers": {
        "x-tiflux-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

#### Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/mcp` | GET | No | Server info |
| `/mcp` | POST | Yes | MCP operations |
| `/health` | GET | No | Health check |

### Via Web (OAuth 2.0) — Claude web & ChatGPT connectors

Use TiFlux as a **connector** in any AI platform that supports MCP over OAuth 2.0 — such as
**Claude (claude.ai / desktop)** and **ChatGPT** — with no local install. You just add a
custom connector pointing to the TiFlux MCP server URL.

**MCP Server URL (paste this in the connector):**

```
https://mcp.tiflux.com
```

**Add the connector:**

- **Claude (claude.ai / desktop):** Settings → **Connectors** → **Add custom connector** →
  paste `https://mcp.tiflux.com` → Connect.
- **ChatGPT:** Settings → **Connectors** (or when building a GPT, **Add** a connector) →
  paste `https://mcp.tiflux.com` → Connect.

**How the authorization works:**

1. After adding the connector, the platform opens the TiFlux authorization page automatically.
2. The page shows a step-by-step guide to generate your TiFlux API Key:
   - Log in at [app.tiflux.com](https://app.tiflux.com/)
   - Click your profile photo → **Minha conta**
   - Open the **Sessões** tab
   - Under **Sessões API**, click **"Gerar novo token de sessão"**
   - Copy the generated key and paste it into the authorization form
3. After authorizing, the platform receives a Bearer token and uses it for all subsequent
   MCP requests — no need to handle the key again.

> For Claude Code or local/script usage with a direct API key header, see
> [Via URL (HTTP Transport)](#via-url-http-transport) above.

**Authentication methods supported:**

| Method | Header | When to use |
|--------|--------|-------------|
| API key (direct) | `x-tiflux-api-key: YOUR_API_KEY` | Claude Code, local SDK, scripts |
| Bearer token (OAuth) | `Authorization: Bearer <token>` | Claude.ai, ChatGPT, web connectors |

**OAuth 2.0 endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /.well-known/oauth-authorization-server` | OAuth server metadata (RFC 8414) |
| `POST /register` | Dynamic client registration (RFC 7591) |
| `GET /authorize` | Authorization page (user enters API key) |
| `POST /authorize` | Form submit — issues auth code |
| `POST /token` | Token exchange and refresh |

## Configuration

Create a `.env` file with your TiFlux API credentials:

```bash
# TiFlux API Configuration
TIFLUX_API_KEY=your_api_key_here

# Default values for ticket creation
TIFLUX_DEFAULT_CLIENT_ID=1
TIFLUX_DEFAULT_DESK_ID=1
TIFLUX_DEFAULT_PRIORITY_ID=1
TIFLUX_DEFAULT_CATALOG_ITEM_ID=1
```

### Response Verbosity

The server supports two verbosity modes to control token consumption:

| Mode | Description |
|------|-------------|
| `rich` | Full Markdown output with emojis, footers, and verbose pagination blocks (default) |
| `compact` | Terse output — no decorative footer, one-line pagination summary, `get_ticket` omits low-value flags and truncates long descriptions, `list_tickets` uses ultra-terse per-ticket rows |

**SDK (stdio) — environment variable:**

```bash
TIFLUX_MCP_VERBOSITY=compact npx @tiflux/mcp@latest
```

**Server (HTTP/Lambda) — per-request header:**

```
x-tiflux-verbosity: compact
```

> Default is `rich` in both modes. Existing integrations are unaffected unless the env var or header is set.

### Token-reduction tips for API integrations

When building applications that call this MCP server programmatically, token costs matter. Follow these guidelines:

- **Pass IDs when you already have them.** Every tool that accepts a `_name` param for auto-resolution (e.g. `desk_name`, `stage_name`, `entity_field_name`) will make one or more extra API calls to resolve the name. If you stored the ID from a previous call, pass it directly (e.g. `desk_id`, `stage_id`, `entity_field_id`) — this is always faster and cheaper.
- **Use `compact` verbosity** via `TIFLUX_MCP_VERBOSITY=compact` (SDK) or `x-tiflux-verbosity: compact` header (Server). Compact mode cuts `get_ticket` and `list_tickets` output by ~50%.
- **Paginate deliberately.** `list_tickets` with a wide date range on a busy desk can return hundreds of items. Pass `limit` and `offset` intentionally — when a full page comes back, compact mode appends a next-page hint (`→ offset: N`) so the model knows there may be more to fetch.

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

**New in v1.4.0:** Expanded fields for complete ticket metadata in a single call.

### create_ticket
Create a new ticket in TiFlux.

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
- `requestor_id` (number, optional): Requestor ID (person who opens the ticket, must belong to the selected client). Pass this directly if you already know the ID — skips the auto-resolve lookup.
- `requestor_name` (string, optional): Requestor name. If provided without `requestor_id` and without `requestor_email`, the MCP automatically attempts to resolve this to an existing `requestor_id` (avoids creating a "ghost" requestor) via `GET /requestors`, falling back to the client-scoped `GET /clients/{id}/requestors` if the global endpoint returns 403. If multiple matches are found, returns a list to disambiguate. If no match — or if the user lacks permission to search requestors — falls back to the previous behavior (sends name as-is, and the API resolves/creates the requestor).
- `requestor_email` (string, optional): Requestor email. When provided, the MCP does **not** attempt to auto-resolve the name to an ID — the email is an exact enough identifier.
- `requestor_telephone` (string, optional): Requestor phone
- `responsible_id` (number, optional): Responsible user ID
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `followers` (string, optional): Comma-separated follower emails
- `parent_ticket_number` (number, optional): Parent ticket number — the created ticket will be linked as a child of this ticket
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.png"}]` (max 10 files, 25MB each)

**New in v2.4.0:** Support for base64 file upload via `files_base64`. The ticket is sent as `multipart/form-data`. **Note for Server mode (Lambda):** `files_base64` payloads are subject to the 6MB API Gateway limit.

> **Breaking change (v2.8.0):** O parametro `files` (caminhos locais) foi removido. Use a nova tool `upload_ticket_files` para enviar arquivos via base64, ou passe os arquivos diretamente via `files_base64`.

### update_ticket
Update an existing ticket in TiFlux. Supports transferring a ticket to another desk — when `desk_id`/`desk_name` is provided without an explicit `stage_id`/`stage_name`, the MCP automatically resolves the first stage of the destination desk (the stage with `first_stage: true`, or the one with the lowest index as a fallback), preventing invalid-stage errors.

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
- `followers` (string, optional): Comma-separated follower emails
- `services_catalogs_item_id` (number, optional): Catalog item ID for updating desk with specific item
- `catalog_item_name` (string, optional): Catalog item name for automatic search (alternative to services_catalogs_item_id, requires desk_id or desk_name)

**Note:** At least one optional field must be provided along with the `ticket_number`.

**Desk Transfer Prerequisites:**
1. **Desk relationship** — origin and destination desks must be **linked** in TiFlux settings. Without this the API rejects the transfer with a `42202` error.
2. **Catalog item for destination desk** — desks that require a service catalog reject the transfer without `services_catalogs_item_id`/`catalog_item_name` of the destination desk.
3. **Priority is not preserved** — priority is scoped per desk and is **lost** on transfer (becomes `null`). Provide `priority_name`/`priority_id` to preserve it. Status is automatically reallocated by the API.

**Priority change rules** (enforced by the API v2):
- **Same desk (no transfer):** use `priority_id` directly (no `desk_id`/`desk_name`). `priority_change_reason` is **required** (`42201` otherwise). `priority_name` does **not** work here — it requires a desk, which the API interprets as a transfer.
- **During a desk transfer:** provide `priority_id` or `priority_name` to preserve priority; do **not** send `priority_change_reason` (`42202` otherwise — it is dropped automatically with a warning).

**Error messages:** Common `42202` transfer errors (missing desk relationship, required catalog) are returned as actionable messages instead of raw API text.

### update_ticket_entities
Update custom fields (entities) of a ticket in TiFlux. Supports up to 50 fields per request. For checkbox fields with multiple named options, send one item per option with `entity_field_option_id`. Use `list_entity_field_options` to discover option IDs.

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
Cancel a specific ticket in TiFlux.

**Parameters:**
- `ticket_number` (string, required): Ticket number to be cancelled (e.g., "37", "123")

**Example:**
```json
{
  "ticket_number": "84429"
}
```

### list_tickets
List tickets with filtering options.

**Parameters:**
- `desk_ids` (string, optional): Comma-separated desk IDs (e.g., "1,2,3")
- `desk_name` (string, optional): Desk/team name for automatic ID resolution. Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution). **Prefer this field when the user references a name without qualifying the entity.**
- `client_ids` (string, optional): Comma-separated client (company) IDs (e.g., "1,2,3")
- `client_name` (string, optional): Client (company) name for automatic search. Use **only** when the user explicitly says "client", "company", or gives a known corporate name. For a person, prefer `requestor_email`.
- `stage_ids` (string, optional): Comma-separated stage IDs (e.g., "1,2,3")
- `stage_name` (string, optional): Stage name (must be used with desk_name)
- `responsible_ids` (string, optional): Comma-separated responsible (assigned attendant) user IDs (use when you already have the ID)
- `responsible_name` (string, optional): Responsible user name for automatic resolution. Works for both admin (via `GET /users`) and non-admin users (via attendant groups fallback). Use when the user says "assigned to" / "responsible" and gives a name.
- `requestor_ids` (string, optional): Comma-separated requestor (person who opened the ticket) IDs (e.g., "1,2,3"). Use for filtering by **person** (not company). Resolve the ID via `search_requestor`.
- `requestor_email` (string, optional): Email of the requestor (person who opened the ticket). Use when the user references a **person** or provides an email directly. Avoids a round-trip to resolve the ID.
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 200)
- `is_closed` (boolean, optional): Include closed tickets (default: false)
- `filter_by` (string, optional): Status mode with precedence over `is_closed`: "open" (only open), "closed" (only resolved/closed — does NOT include cancelled), "canceled" (only cancelled — robust even with custom status names), or "all" (every status in a single query). Use "canceled" when the user specifically asks for cancelled tickets, and "all" for tickets regardless of status.
- `date_type` (string, optional): Date type for filtering: "created_at" (creation date, default) or "solved_in_time" (resolution/closing date)
- `group_by` (string, optional): Aggregates the ticket COUNT instead of returning the list. "day"/"week"/"month" group by period (combine with `date_type` + date range); "desk" groups by desk. Returns `{ group_by, date_type, total, buckets: [{period, count}] }`. Use for comparison/trend (e.g., "opened per day this week") or per-desk breakdowns.
- `sla_expiring_before` (string, optional): Filters OPEN (and non-stopped) tickets whose RESOLUTION SLA (`solve_expiration`) is due before the given ISO 8601 datetime, including already overdue. Use for "SLA at risk" (e.g., pass end-of-today). Combine with `group_by=desk` for "desks with SLA at risk".
- `start_datetime` (string, optional): Start date/time filter in ISO 8601 format (e.g., "2024-05-15T00:00:00Z"). Filters tickets with date >= start_datetime
- `end_datetime` (string, optional): End date/time filter in ISO 8601 format (e.g., "2024-05-15T23:59:59Z"). Filters tickets with date <= end_datetime

**Note:** At least one filter (desk_ids/desk_name, client_ids/client_name, stage_ids/stage_name, responsible_ids/responsible_name, requestor_ids, requestor_email, start_datetime, end_datetime, or is_closed) is required.

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
{
  "desk_name": "Support",
  "date_type": "solved_in_time",
  "start_datetime": "2024-01-01T00:00:00Z",
  "end_datetime": "2024-01-31T23:59:59Z",
  "is_closed": true
}
```

### close_ticket
Close a specific ticket in TiFlux.

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

*Ticket fechado via API TiFlux*
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
Create a new client in TiFlux. Only `name` and `social` are required; all other fields are optional and only sent if provided.

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
For admin users, the TiFlux API does not support name-based filtering in the `/users` endpoint — the tool fetches up to 200 users and filters client-side. For non-admin users, the tool uses the technical-groups chain and deduplicates users that appear in multiple groups.

**Example:**
```json
{
  "name": "John",
  "type": "attendant",
  "active": true
}
```

### search_technical_user
Search for technical attendants (users who can be assigned as responsible) in TiFlux by name, email, desk, or client. Uses the `GET /technical-users` endpoint — **does not require user management permission** (works for both admin and non-admin attendants). Use the returned `id` as `responsible_id` when creating or updating a ticket.

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

### search_requestor
Search for requestors (ticket openers) in TiFlux by name, email, or telephone. Uses the dedicated `GET /requestors` endpoint with server-side filtering — no client-side limit.

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
Upload files to an existing ticket in TiFlux. Files must be provided as base64-encoded content.

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

**Note:** Uploaded text files (`.md`, `.txt`, `.csv`, `.json`) are sent with the appropriate `charset=utf-8` content type, which prevents character encoding issues (mojibake) in the TiFlux portal.

### delete_ticket_file
Remove a file attached to a ticket in TiFlux.

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
Remove an answer (client communication) from a ticket in TiFlux.

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
Remove a file attached to a specific ticket answer in TiFlux.

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
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Events per page (default: 20, max: 200)
- `history_of` (integer, optional): Filter by ticket area (e.g., `1` = appointments)
- `type_id_attr` (integer, optional): Filter by attribute type
- `operation` (integer, optional): Filter by operation type — only valid when `history_of=1`

**Returns:**
For each event:
- Action description, user, date/time, event type and operation
- Diff of changed fields with old → new values

**Example:**
```json
{
  "ticket_number": 123,
  "history_of": 1
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

**Note:** The TiFlux API only allows the author of the communication to edit it. A 403 error will be returned if the authenticated user did not create the communication.

### delete_internal_communication
Remove an internal communication from a ticket in TiFlux.

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

> **Disclaimer:** Creating appointments (`create_appointment`) is only supported for tickets on desks configured with non-valued appointments. Listing appointments (`list_appointments`) works for any desk and renders valorization details when available.

### create_appointment
Create a new appointment (work-hour record) on a specific ticket. Only works on tickets from desks configured with non-valued appointments.

**Parameters:**
- `ticket_number` (string, required): Ticket number where the appointment will be created
- `date` (string, required): Appointment date in `YYYY-MM-DD` format. Future dates are not allowed.
- `init_time` (string, required): Start time in `HH:MM` format (e.g. `"09:00"`, `"14:30"`)
- `end_time` (string, required): End time in `HH:MM` format. Must be greater than or equal to `init_time`.
- `description` (string, required): Description of the work performed

**Example:**
```json
{
  "ticket_number": "123",
  "date": "2025-01-15",
  "init_time": "09:00",
  "end_time": "10:30",
  "description": "Investigation and fix of the reported issue"
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
Each appointment card shows date, time range, attendant, client (when available), and description. When the desk has valorization enabled, the card also includes:
- Attendance type: External (Externo), Remote (Remoto), or Internal (Interno)
- Service type: Loose (Avulso) with loose service name, or Contract with contract name
- Travel shift name and value (when applicable)
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
- Linked ticket number
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
Listar prioridades configuradas em uma mesa do TiFlux. Use para descobrir os IDs de prioridade antes de criar ou atualizar tickets (ex: "alta prioridade" → `priority_id`). O filtro `priority_name` e feito client-side com fuzzy match apos buscar os registros da API.

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
Listar catalogos de servicos vinculados a uma mesa do TiFlux. Catalogos sao os containers pai — diferentes dos itens de catalogo (use `search_catalog_item` para itens selecionaveis em tickets). O filtro `catalog_name` e feito client-side com fuzzy match.

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

### list_entities
List custom field groups (entities) available in the TiFlux organization. Use to discover which custom field groups exist, which applications they apply to (`ticket`, `client`, etc.), and their IDs — required for `list_entity_fields`.

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
List subfields (entity_fields) of a custom field group in TiFlux. Returns name, type, required status, and indicates which fields have selectable options (single_select/checkbox) — use `list_entity_field_options` in those cases.

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

## API Endpoints Used

The MCP server integrates with the following TiFlux API v2 endpoints:

- `GET /tickets/{id}` - Retrieve ticket details
- `POST /tickets` - Create new tickets (supports multipart with file attachments via `files_base64`; `requestor_id` body field links existing requestor)
- `PUT /tickets/{id}` - Update existing tickets
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
- `GET /tickets` - List tickets with filters (supports `requestor_ids`, `requestor_email` query params)
- `GET /clients` - Search/list clients (`search_client`, `list_clients`, and `client_name` auto-resolve in `list_tickets` and `create_ticket`)
- `GET /clients/{id}` - Get client details (`get_client`)
- `POST /clients` - Create a new client (`create_client`)
- `PUT /clients/{id}` - Update client fields (`update_client`)
- `PUT /clients/{id}/entities` - Update client custom fields (`update_client_entities`)
- `GET /clients/{id}/desks` - List desks associated with a client (`get_client_desks`)
- `GET /clients/{id}/technical-groups` - List technical groups associated with a client (`get_client_technical_groups`)
- `POST /clients/{id}/users` - Create a portal user for a client (`create_client_user`)
- `POST /clients/{id}/email_tickets_permissions` - Add authorized email/domain for a client (`add_client_email_permission`)
- `GET /requestors` - Search requestors with server-side filtering (`search_requestor`, and `requestor_name` auto-resolve in `create_ticket`). Admin/global permission required — returns 403 for non-admin attendants, handled by the client-scoped fallback below.
- `GET /clients/{client_id}/requestors` - Client-scoped requestor search; automatic fallback for `search_requestor` and `create_ticket` when `GET /requestors` returns 403 (attendant with permission on that client).
- `GET /users` - Search users (used by `search_user`, `responsible_name` auto-resolve, and as level 3 of the `search_requestor` fallback chain — the matched user's email becomes `requestor_email`). Returns 403 for non-admin users — handled automatically by the fallback below.
- `GET /users/me` - Current authenticated user (used as the final level of the `search_requestor` chain — suggests opening the ticket as yourself via `requestor_email`).
- `GET /technical-users` - Search technical attendants with server-side filtering by name, email, desk_id, client_id (`search_technical_user`). **Does not require user management permission** — works for admin and non-admin. **Primary path** for `responsible_name` auto-resolve in `create_ticket`, `update_ticket`, `list_tickets`. Note: absent from the public swagger.json as of 2026-06-18 but live in production.
- `GET /technical-groups` - List attendant groups (used by `search_user` non-admin fallback and as fallback for `responsible_name` resolution when `/technical-users` returns 404/403)
- `GET /technical-groups/{id}/users` - List users in an attendant group (non-admin fallback for `search_user` — deduplicated, fuzzy-matched)
- `GET /departments` - List organization departments with optional name search (`list_departments`). Admin: all active; non-admin: only linked to attendant group
- `GET /desks` - Search/list desks (used by Smart Name Resolution and `list_desks`)
- `GET /desks/{id}` - Get full desk configuration (`get_desk`)
- `GET /desks/{id}/priorities` - Get desk priorities (`list_desk_priorities`, `update_ticket` priority_name resolution)
- `GET /desks/{id}/services-catalogs` - Get desk service catalogs (`list_desk_services_catalogs`)
- `GET /desks/{id}/stages` - Get desk stages
- `GET /desks/{id}/services-catalogs-items` - Get service catalog items (supports `?name` for server-side search by catalog/area/item name)
- `POST /tickets/{ticket_number}/internal_communications` - Create internal communication
- `GET /tickets/{ticket_number}/internal_communications` - List internal communications
- `GET /tickets/{ticket_number}/internal_communications/{id}` - Get specific internal communication
- `PUT /tickets/{ticket_number}/internal_communications/{id}` - Update internal communication text (`update_internal_communication`)
- `DELETE /tickets/{ticket_number}/internal_communications/{id}` - Remove an internal communication (`delete_internal_communication`)
- `GET /tickets/{ticket_number}/files` - Get ticket attached files
- `POST /tickets/{ticket_number}/files` - Upload files to an existing ticket (`upload_ticket_files`)
- `DELETE /tickets/{ticket_number}/files/{id}` - Remove a file attached to a ticket (`delete_ticket_file`)
- `GET /tickets/{ticket_number}/stages-slas` - Get ticket stages history with SLA outcomes
- `POST /tickets/{ticket_number}/appointments` - Create a ticket appointment (time tracking)
- `GET /tickets/{ticket_number}/appointments` - List ticket appointments with filters
- `GET /chats/{id}` - Retrieve chat details
- `GET /chats/inbox` - List inbox chats
- `GET /chats/mine` - List chats assigned to the authenticated user
- `GET /chats/in_attendance` - List chats currently in attendance
- `GET /chats/archived` - List archived (finished or canceled) chats
- `PUT /chats/{id}` - Update a chat (transfer attendant/department, link ticket)
- `POST /chats/send_message` - Send a WhatsApp message (free text or HSM template), creating the chat
- `PUT /chats/{id}/archive` - Finish (archive) a chat
- `GET /entities` - List custom field groups (`list_entities`)
- `GET /entities/{entity_id}/fields` - List custom subfields of an entity (`list_entity_fields`)
- `GET /entity_fields/{entity_field_id}/options` - List options of a single_select/checkbox field (`list_entity_field_options`)
- `GET /knowledges` - List knowledge base articles with optional search/folder filter (`list_knowledges`). Without "Gerenciar base de conhecimento" permission: public + attendant group only; with permission: all
- `POST /knowledges` - Create a new knowledge base article (`create_knowledge`). Requires "Gerenciar conhecimento" permission

## Telemetry

Every request sent to the TiFlux API v2 includes a `User-Agent` header with basic technical metadata:

```
TiFlux-MCP-sdk/2.3.0                     # local / npx mode
TiFlux-MCP-server/2.3.0 (node/v20.11.0)  # Lambda / hosted mode
```

**What is collected:** mode (`sdk` or `server`) and package version. The Node.js version is **only** sent in `server` mode (TiFlux-hosted infrastructure) — in local `sdk` mode it is intentionally omitted, so no detail about your local environment is collected.

**What is NOT collected:** tool names, arguments, responses, user data, or any personally identifiable information.

This telemetry is always enabled and requires no configuration. It is used exclusively to understand which package versions are in use. No separate telemetry endpoint is used — the data is carried as a standard HTTP header on every API v2 request.

## Requirements

- Node.js >= 16.0.0
- Valid TiFlux API credentials

## License

MIT

## Support

For support, please contact the TiFlux development team or create an issue on GitHub.
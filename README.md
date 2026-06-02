# TiFlux MCP Server

Model Context Protocol (MCP) server for TiFlux integration with Claude Code and other AI clients.

## Features

- **Ticket Management**: Get, create, update, close and list tickets with comprehensive filtering
- **Stages & SLA History**: Inspect the full history of ticket stages with per-stage SLA outcomes
- **Internal Communications**: Create and list internal communications for tickets with file attachments
- **Time Tracking (Appointments)**: Create and list work-hour appointments on tickets
- **Chat Queries**: List inbox/mine/in-attendance/archived chats and fetch chat details
- **Desk Exploration**: List available desks and inspect full desk configurations (SLA, fields, behavior) without leaving the chat
- **Custom Field Discovery**: Discover custom fields (entities) at all three levels — entity → field → option — enabling LLMs to correctly fill checkbox/single_select fields using the right option IDs
- **Client Search**: Search for clients by name with automatic resolution
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

### Via Web (OAuth 2.0)

Connect through any AI platform that supports the MCP OAuth 2.0 server connector (Claude.ai, ChatGPT, and any MCP-compatible client with OAuth 2.0 support).

**MCP Server URL:** `https://mcp.tiflux.com`

**How it works:**

1. Add TiFlux as a connector in your AI platform using the URL above
2. The platform opens the TiFlux authorization page automatically
3. The page displays a step-by-step guide to generate your TiFlux API Key:
   - Log in at [app.tiflux.com](https://app.tiflux.com/)
   - Click your profile photo → **Minha conta**
   - Open the **Sessões** tab
   - Under **Sessões API**, click **"Gerar novo token de sessão"**
   - Copy the generated key and paste it into the authorization form
4. After authorizing, the platform receives a Bearer token and uses it for all subsequent MCP requests

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
- `client_id` (number, optional): Client ID
- `client_name` (string, optional): Client name for automatic search (alternative to client_id)
- `desk_id` (number, optional): Desk ID
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `priority_id` (number, optional): Priority ID
- `services_catalogs_item_id` (number, optional): Service catalog item ID
- `catalog_item_name` (string, optional): Catalog item name for automatic search (alternative to services_catalogs_item_id, requires desk_id or desk_name)
- `status_id` (number, optional): Status ID
- `requestor_name` (string, optional): Requestor name
- `requestor_email` (string, optional): Requestor email
- `requestor_telephone` (string, optional): Requestor phone
- `responsible_id` (number, optional): Responsible user ID
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `followers` (string, optional): Comma-separated follower emails
- `parent_ticket_number` (number, optional): Parent ticket number — the created ticket will be linked as a child of this ticket

### update_ticket
Update an existing ticket in TiFlux.

**Parameters:**
- `ticket_id` (string, required): ID of the ticket to update
- `title` (string, optional): New ticket title
- `description` (string, optional): New ticket description. Accepts Markdown (bold, lists, headings, code) — the MCP automatically converts it to HTML before sending to the API.
- `client_id` (number, optional): New client ID
- `desk_id` (number, optional): New desk ID
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `stage_id` (number, optional): Stage/phase ID
- `stage_name` (string, optional): Stage name for automatic search (alternative to stage_id, requires desk_id or desk_name)
- `responsible_id` (number, optional): Responsible user ID (use null to unassign)
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `followers` (string, optional): Comma-separated follower emails
- `services_catalogs_item_id` (number, optional): Catalog item ID for updating desk with specific item
- `catalog_item_name` (string, optional): Catalog item name for automatic search (alternative to services_catalogs_item_id, requires desk_id or desk_name)

**Note:** At least one optional field must be provided along with the ticket_id.

### update_ticket_entities
Update custom fields (entities) of a ticket in TiFlux. Supports up to 50 fields per request. For checkbox fields with multiple named options, send one item per option with `entity_field_option_id`. Use `list_entity_field_options` to discover option IDs.

**Parameters:**
- `ticket_number` (string, required): Ticket number to update
- `entities` (array, required): List of custom fields to update. For multiple-choice checkbox fields, send one item per option.

**Entity Object Structure:**
- `entity_field_id` (number, required): Custom field ID (obtained via `get_ticket` or `list_entity_fields`)
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

**Example — simple text/date fields:**
```json
{
  "ticket_number": "123",
  "entities": [
    {
      "entity_field_id": 72,
      "value": "New value"
    },
    {
      "entity_field_id": 73,
      "value": "2025-01-15"
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
- `desk_name` (string, optional): Desk name for automatic ID resolution. Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `client_ids` (string, optional): Comma-separated client IDs (e.g., "1,2,3")
- `stage_ids` (string, optional): Comma-separated stage IDs (e.g., "1,2,3")
- `stage_name` (string, optional): Stage name (must be used with desk_name)
- `responsible_ids` (string, optional): Comma-separated responsible user IDs
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 200)
- `is_closed` (boolean, optional): Include closed tickets (default: false)
- `date_type` (string, optional): Date type for filtering: "created_at" (creation date, default) or "solved_in_time" (resolution/closing date)
- `start_datetime` (string, optional): Start date/time filter in ISO 8601 format (e.g., "2024-05-15T00:00:00Z"). Filters tickets with date >= start_datetime
- `end_datetime` (string, optional): End date/time filter in ISO 8601 format (e.g., "2024-05-15T23:59:59Z"). Filters tickets with date <= end_datetime

**Note:** At least one filter (desk_ids/desk_name, client_ids, stage_ids/stage_name, or responsible_ids) is required.

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
- `files` (array, optional): Array of local file paths to attach (max 10 files, 40MB each)
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.pdf"}]` (alternative to files, max 10 files, 40MB each)

**New in v1.3.0:** Support for base64 file upload via `files_base64` parameter.

**Example:**
```json
{
  "ticket_number": "123",
  "text": "Hello, your issue has been resolved.",
  "with_signature": true,
  "files": ["/path/to/attachment.pdf"]
}
```

### search_client
Search for clients by name.

**Parameters:**
- `client_name` (string, required): Client name to search (partial match supported)

### search_user
Search for users by name to use as responsible in tickets.

**Parameters:**
- `name` (string, required): User name to search (partial match supported, searches in name and email)
- `type` (string, optional): User type filter (client, attendant, admin)
- `active` (boolean, optional): Filter active (true) or inactive (false) users
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Implementation Note:**
The TiFlux API does not support name-based filtering in the `/users` endpoint. This tool fetches up to 200 users from the API and performs client-side filtering by name and email. This approach ensures compatibility with the API while providing the expected search functionality.

**Requirements:**
The API user must have the `users_manage` permission to access the `/users` endpoint.

**Example:**
```json
{
  "name": "John",
  "type": "attendant",
  "active": true
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
Search for service catalog items by name within a specific desk.

**Parameters:**
- `desk_id` (number, optional): Desk ID to search catalog items
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id). Accepts partial names — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution)
- `catalog_item_name` (string, required): Catalog item name to search (partial match supported)
- `area_id` (number, optional): Service area ID to filter results
- `catalog_id` (number, optional): Service catalog ID to filter results
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

**Note:** At least one parameter (desk_id or desk_name) must be provided along with catalog_item_name.

**Example:**
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
- `files` (array, optional): Array of local file paths to attach (max 10 files, 25MB each)
- `files_base64` (array, optional): Array of base64 encoded files `[{content: "base64...", filename: "file.pdf"}]` (alternative to files, max 10 files, 25MB each)

**New in v1.3.0:** Support for base64 file upload via `files_base64` parameter.

**Example:**
```json
{
  "ticket_number": "123",
  "text": "Internal communication content",
  "files": ["/path/to/file1.pdf", "/path/to/file2.png"]
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

### get_internal_communication
Get a specific internal communication with full content.

**Parameters:**
- `ticket_number` (string, required): Ticket number containing the communication
- `communication_id` (string, required): ID of the internal communication to retrieve

## Appointments (Time Tracking)

> **Disclaimer:** Only non-valued appointments are supported for now. Tickets on desks configured with valued appointments (with hourly rate) are not yet accepted.

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
List appointments (work-hour records) of a specific ticket with optional filters.

**Parameters:**
- `ticket_number` (string, required): Ticket number to list appointments from
- `user_id` (number, optional): Filter by the ID of the user who made the appointment
- `start_date` (string, optional): Return appointments from this date (`YYYY-MM-DD`)
- `end_date` (string, optional): Return appointments up to this date (`YYYY-MM-DD`)
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Appointments per page (default: 20, max: 200)

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
Listar chats na caixa de entrada (chats não assumidos) com filtros opcionais de departamento, cliente, origem e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels: `chat`, `site_widget`, `campaign`, `whatsapp`, `whatsapp_web`, `gupshup`, `whatsapp_cloud`
- `started_by` (string, optional): Chat initiator type: `Client`, `Attendant`, `Campaign`, `API`

**Example:**
```json
{
  "origins": "whatsapp",
  "limit": 10,
  "offset": 1
}
```

### list_my_chats
Listar chats assumidos pelo usuário autenticado (dono da API key) com filtros opcionais e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)

**Example:**
```json
{
  "department_id": 3,
  "limit": 20
}
```

### list_in_attendance_chats
Listar todos os chats em atendimento da organização com filtros opcionais de responsável, status e paginação.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)
- `user_id` (number, optional): Filter by responsible attendant ID
- `status` (string, optional): Filter by attendance status: `waiting_client`, `waiting_attendance`, `triage`

**Example:**
```json
{
  "user_id": 7,
  "status": "triage"
}
```

### list_archived_chats
Listar chats arquivados (finalizados ou cancelados) com filtros opcionais. Exibe avaliação do atendimento e status de cancelamento.

**Parameters:**
- `offset` (number, optional): Page number (default: 1, minimum: 1)
- `limit` (number, optional): Chats per page (default: 20, max: 200)
- `department_id` (number, optional): Filter by department ID
- `client_id` (number, optional): Filter by client ID
- `requestor_id` (number, optional): Filter by requestor ID — must be greater than 0
- `number` (number, optional): Filter by WhatsApp contact number — **requires WhatsApp license**
- `origins` (string, optional): Comma-separated origin channels (see list_inbox_chats)
- `started_by` (string, optional): Chat initiator type (see list_inbox_chats)
- `canceled` (boolean, optional): `true` = only canceled chats, `false` = only normally finished, omitted = all archived chats

**Example:**
```json
{
  "canceled": false,
  "limit": 50
}
```

## Desk Tools

Explore and inspect desks (service queues) without leaving the chat. Use `list_desks` to discover available desks, `get_desk` to inspect full configuration, `list_desk_priorities` to discover priority IDs before creating tickets, and `list_desk_services_catalogs` to list service catalog containers linked to a desk.

### list_desks
Listar mesas (desks) disponiveis no tenant para descoberta e exploracao. Retorna tabela com id, nome, display name, status ativo e tipo de atendimento. Use antes de criar tickets ou para explorar quais mesas existem.

**Parameters:**
- `active` (boolean, optional): Filter active (`true`) or inactive (`false`) desks. Default: `true` (active only)
- `name` (string, optional): Server-side filter by name or display_name (case-insensitive exact match)
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
- `desk_name` (string, optional): Partial or full desk name — e.g. `"cansados"` resolves to `"Dev - Cansados"` (see Smart Name Resolution). Alternative to desk_id

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

## Smart Name Resolution

When using `desk_name` in any tool, the MCP server performs a two-step lookup:

1. **Direct search:** `GET /desks?active=true&name={desk_name}` — fast, uses the API's built-in filter.
2. **Fuzzy fallback (automatic):** If the direct search returns no results, the server fetches all active desks and applies client-side fuzzy matching with tokenization and normalization (trim, lowercase, accent-insensitive). This handles common patterns like:
   - **Partial name:** `"cansados"` resolves to `"Dev - Cansados"`
   - **Accent-insensitive:** `"comunicacao"` resolves to `"Comunicação"`
   - **Token match:** `"premium"` resolves to `"Dev - Premium"`

**Behavior:**
- If exactly **1 desk** matches → auto-resolved, request proceeds normally.
- If **multiple desks** match → returns a list so you can be more specific or use `desk_id` directly.
- If **no match** → returns a clear error message.

This applies to: `create_ticket`, `update_ticket`, `list_tickets`, `search_stage`, `search_catalog_item`, `get_desk`, `list_desk_priorities`, and `list_desk_services_catalogs`.

## API Endpoints Used

The MCP server integrates with the following TiFlux API v2 endpoints:

- `GET /tickets/{id}` - Retrieve ticket details
- `POST /tickets` - Create new tickets
- `PUT /tickets/{id}` - Update existing tickets
- `PUT /tickets/{id}/entities` - Update ticket custom fields
- `PUT /tickets/{ticket_number}/cancel` - Cancel specific ticket
- `PUT /tickets/{ticket_number}/close` - Close specific ticket
- `POST /tickets/{ticket_number}/answers` - Create ticket answer (client communication)
- `GET /tickets` - List tickets with filters
- `GET /clients` - Search clients
- `GET /users` - List users (name filtering done client-side)
- `GET /desks` - Search/list desks (used by Smart Name Resolution and `list_desks`)
- `GET /desks/{id}` - Get full desk configuration (`get_desk`)
- `GET /desks/{id}/priorities` - Get desk priorities (`list_desk_priorities`)
- `GET /desks/{id}/services-catalogs` - Get desk service catalogs (`list_desk_services_catalogs`)
- `GET /desks/{id}/stages` - Get desk stages
- `GET /desks/{id}/services-catalogs-items` - Get service catalog items
- `POST /tickets/{ticket_number}/internal_communications` - Create internal communication
- `GET /tickets/{ticket_number}/internal_communications` - List internal communications
- `GET /tickets/{ticket_number}/internal_communications/{id}` - Get specific internal communication
- `GET /tickets/{ticket_number}/files` - Get ticket attached files
- `GET /tickets/{ticket_number}/stages-slas` - Get ticket stages history with SLA outcomes
- `POST /tickets/{ticket_number}/appointments` - Create a ticket appointment (time tracking)
- `GET /tickets/{ticket_number}/appointments` - List ticket appointments with filters
- `GET /chats/{id}` - Retrieve chat details
- `GET /chats/inbox` - List inbox chats
- `GET /chats/mine` - List chats assigned to the authenticated user
- `GET /chats/in_attendance` - List chats currently in attendance
- `GET /chats/archived` - List archived (finished or canceled) chats
- `GET /entities` - List custom field groups (`list_entities`)
- `GET /entities/{entity_id}/fields` - List custom subfields of an entity (`list_entity_fields`)
- `GET /entity_fields/{entity_field_id}/options` - List options of a single_select/checkbox field (`list_entity_field_options`)

## Requirements

- Node.js >= 16.0.0
- Valid TiFlux API credentials

## License

MIT

## Support

For support, please contact the TiFlux development team or create an issue on GitHub.
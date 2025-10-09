# TiFlux MCP Server

Model Context Protocol (MCP) server for TiFlux integration with Claude Code and other AI clients.

## Features

- **Ticket Management**: Get, create, update, close and list tickets with comprehensive filtering
- **Internal Communications**: Create and list internal communications for tickets with file attachments
- **Client Search**: Search for clients by name with automatic resolution
- **File Upload Support**: Attach up to 10 files (25MB each) to internal communications
- **API Integration**: Direct integration with TiFlux API v2
- **Environment Configuration**: Secure configuration with environment variables
- **Comprehensive Testing**: 78 automated tests with 100% mock isolation

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
Retrieve a specific ticket by ID.

**Parameters:**
- `ticket_id` (string, required): ID of the ticket to retrieve

### create_ticket
Create a new ticket in TiFlux.

**Parameters:**
- `title` (string, required): Ticket title
- `description` (string, required): Ticket description
- `client_id` (number, optional): Client ID
- `client_name` (string, optional): Client name for automatic search (alternative to client_id)
- `desk_id` (number, optional): Desk ID
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id)
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

### update_ticket
Update an existing ticket in TiFlux.

**Parameters:**
- `ticket_id` (string, required): ID of the ticket to update
- `title` (string, optional): New ticket title
- `description` (string, optional): New ticket description
- `client_id` (number, optional): New client ID
- `desk_id` (number, optional): New desk ID
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id)
- `stage_id` (number, optional): Stage/phase ID
- `stage_name` (string, optional): Stage name for automatic search (alternative to stage_id, requires desk_id or desk_name)
- `responsible_id` (number, optional): Responsible user ID (use null to unassign)
- `responsible_name` (string, optional): Responsible user name for automatic search (alternative to responsible_id)
- `followers` (string, optional): Comma-separated follower emails

**Note:** At least one optional field must be provided along with the ticket_id.

### update_ticket_entities
Update custom fields (entities) of a ticket in TiFlux. Supports up to 50 fields per request.

**Parameters:**
- `ticket_number` (string, required): Ticket number to update
- `entities` (array, required): List of custom fields to update

**Entity Object Structure:**
- `entity_field_id` (number, required): Custom field ID (obtained via get_ticket)
- `value` (string, required): Field value. Accepted types:
  - `text`: string
  - `text_area`: string
  - `currency`: float as string (e.g., "150.55")
  - `phone`: numbers only (e.g., "47999999999")
  - `email`: string
  - `link`: URL starting with http/https/ftp
  - `date`: format YYYY-MM-DD
  - `single_select`: option ID as string
  - `checkbox`: boolean as string "true"/"false"
  - Use `null` to clear non-required fields
- `country_code` (string, optional): Country code (for phone fields outside Brazil)

**Example:**
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
- `desk_name` (string, optional): Desk name for automatic ID resolution
- `client_ids` (string, optional): Comma-separated client IDs (e.g., "1,2,3")
- `stage_ids` (string, optional): Comma-separated stage IDs (e.g., "1,2,3")
- `stage_name` (string, optional): Stage name (must be used with desk_name)
- `responsible_ids` (string, optional): Comma-separated responsible user IDs
- `offset` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20, max: 200)
- `is_closed` (boolean, optional): Include closed tickets (default: false)

**Note:** At least one filter (desk_ids/desk_name, client_ids, stage_ids/stage_name, or responsible_ids) is required.

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
- `text` (string, required): Answer content that will be sent to the client
- `with_signature` (boolean, optional): Include user signature in the answer (default: false)
- `files` (array, optional): Array of file paths to attach (max 10 files, 25MB each)

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
- `name` (string, required): User name to search (partial match supported)
- `type` (string, optional): User type filter (client, attendant, admin)
- `active` (boolean, optional): Filter active (true) or inactive (false) users
- `limit` (number, optional): Results per page (default: 20, max: 200)
- `offset` (number, optional): Page number (default: 1)

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
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id)
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
- `desk_name` (string, optional): Desk name for automatic search (alternative to desk_id)
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
- `text` (string, required): Communication content
- `files` (array, optional): Array of file paths to attach (max 10 files, 25MB each)

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

### get_internal_communication
Get a specific internal communication with full content.

**Parameters:**
- `ticket_number` (string, required): Ticket number containing the communication
- `communication_id` (string, required): ID of the internal communication to retrieve

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
- `GET /users` - Search users by name
- `GET /desks` - Search desks
- `GET /desks/{id}/stages` - Get desk stages
- `GET /desks/{id}/services-catalogs-items` - Get service catalog items
- `POST /tickets/{ticket_number}/internal_communications` - Create internal communication
- `GET /tickets/{ticket_number}/internal_communications` - List internal communications
- `GET /tickets/{ticket_number}/internal_communications/{id}` - Get specific internal communication

## Development

```bash
# Clone the repository
git clone https://github.com/tiflux/tiflux-mcp.git
cd tiflux-mcp

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your credentials
# Run the server
npm start

# Run tests
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:coverage      # Tests with coverage report
```

## Testing

The project includes comprehensive automated testing:

- **78 total tests** with 100% pass rate
- **Complete API mocking** - no external HTTP calls during testing
- **Unit tests** for individual components (API, handlers, schemas)
- **Integration tests** for MCP server functionality
- **Mock data fixtures** for consistent test scenarios
- **Performance tests** for concurrent operations

Run tests with:
```bash
npm test                 # All tests
npm run test:unit       # Unit tests only  
npm run test:integration # Integration tests only
npm run test:coverage   # Coverage report
npm run test:watch      # Watch mode
npm run test:verbose    # Detailed output
```

## Requirements

- Node.js >= 16.0.0
- Valid TiFlux API credentials

## License

MIT

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/tiflux/tiflux-mcp).

## Support

For support, please contact the TiFlux development team or create an issue on GitHub.
# TiFlux MCP Server

Model Context Protocol (MCP) server for TiFlux integration with Claude Code and other AI clients.

## Features

- **Get Tickets**: Search and retrieve specific tickets by ID
- **Create Tickets**: Create new tickets with customizable parameters
- **API Integration**: Direct integration with TiFlux API
- **Environment Configuration**: Secure configuration with environment variables

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
TIFLUX_API_TOKEN=your_api_token_here

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
- `desk_id` (number, optional): Desk ID
- `priority_id` (number, optional): Priority ID
- `services_catalogs_item_id` (number, optional): Service catalog item ID
- `status_id` (number, optional): Status ID
- `requestor_name` (string, optional): Requestor name
- `requestor_email` (string, optional): Requestor email
- `requestor_telephone` (string, optional): Requestor phone
- `responsible_id` (number, optional): Responsible user ID
- `followers` (string, optional): Comma-separated follower emails

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
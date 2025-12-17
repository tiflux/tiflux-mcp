# Date Filters for list_tickets Tool

## Overview

This feature adds date filtering capabilities to the `list_tickets` MCP tool, allowing users to filter tickets by creation date or resolution date while also being able to include closed tickets.

## Parameters Added

### date_type (string, optional)
Specifies which date field to use for filtering:
- `"created_at"` - Filter by ticket creation date (default)
- `"solved_in_time"` - Filter by ticket resolution/closing date

### start_datetime (string, optional)
Start date/time filter in ISO 8601 format.
- Example: `"2024-05-15T00:00:00Z"`
- Filters tickets with date >= start_datetime

### end_datetime (string, optional)
End date/time filter in ISO 8601 format.
- Example: `"2024-05-15T23:59:59Z"`
- Filters tickets with date <= end_datetime

## Use Cases

### 1. List all tickets created in a specific month (including closed)
```json
{
  "desk_name": "Cansados",
  "date_type": "created_at",
  "start_datetime": "2024-01-01T00:00:00Z",
  "end_datetime": "2024-01-31T23:59:59Z",
  "is_closed": true
}
```

### 2. List tickets resolved in a specific period
```json
{
  "desk_name": "Support",
  "date_type": "solved_in_time",
  "start_datetime": "2024-01-01T00:00:00Z",
  "end_datetime": "2024-01-31T23:59:59Z",
  "is_closed": true
}
```

### 3. List only open tickets created today
```json
{
  "desk_name": "Support",
  "date_type": "created_at",
  "start_datetime": "2024-12-17T00:00:00Z",
  "end_datetime": "2024-12-17T23:59:59Z",
  "is_closed": false
}
```

## Implementation Details

### Files Modified

1. **src/schemas/tickets.js** (lines 239-251)
   - Added schema definitions for `date_type`, `start_datetime`, and `end_datetime` parameters

2. **src/handlers/tickets.js** (lines 1267-1280, 1425-1427)
   - Added extraction of new parameters
   - Added filters assignment to pass parameters to API

3. **src/api/tiflux-api.js** (lines 461-472)
   - Added code to append date parameters to API request

4. **src/Server.js** (lines 248-250)
   - Added tool schema definitions for MCP protocol

5. **README.md**
   - Updated documentation with new parameters and examples

## API Reference

The TiFlux API v2 supports these date filtering parameters natively:
- `date_type`: Accepts "created_at" or "solved_in_time"
- `start_datetime`: ISO 8601 format
- `end_datetime`: ISO 8601 format

These can be combined with `is_closed=true` to include closed tickets in date-filtered results.

## Related Ticket

- TiFlux Ticket #88466 - Add date filters to list_tickets MCP tool

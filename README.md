# Paperless-ngx MCP server

Does only one thing: Read documents from paperless-ngx

## What can it do?
- Search documents by:
  - Title
  - Tags
  - ID
  - Added before
  - Added after

### Can I retrieve ID from query and feed it back?
No.

## How to Use
1. Clone this repository.
2. ``npm run build``
3. Edit your desired mcp configuration json file
```json
{
  "Paperless-ngx-MCP-Server": {
    "command": "node",
    "args": [
      "/path/to/your/server/build/index.js"
    ],
    "env": {
      "PAPERLESS_URL": "<URL>",
      "PAPERLESS_API_KEY": "<API_KEY>"
    }
  }
}
```

### Why not .env file?
I'm working on it.
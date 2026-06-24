# locator-mcp

MCP server for scanning browser pages and collecting element locators (XPath, testId, CSS).

## Setup

```bash
npm install
```

## Run

```bash
# Development (TypeScript directly)
npm run dev

# Production (compile first)
npm run build
npm start
```

## Test

```bash
npm test
```

## Project structure

```
src/
  server.ts          MCP tool handlers
  scanner/           Scan pipeline
  shared/            Registry I/O, constants, utils
registry/            Local scan output (gitignored *.json)
tests/               Unit tests
.cursor/mcp.json     Cursor MCP config (committed, portable)
.cursor/rules/       Cursor AI rules for this repo
```

## Registry

Scans write to `registry/{scanName}.json`. Registry JSON files are **not committed** — generate them locally with `scan_page`.

## MCP tools

- `scan_page` — scan a browser page and save locators
- `get_registry_keys` — list keys (token-efficient)
- `get_locator` — fetch one entry by key
- `get_registry` — full registry (high token cost)
- `search_registry` — filter entries
- `list_registries` — list available registries

## Cursor MCP configuration

Run `npm install` in the repo before connecting MCP.

> **Note:** Global `~/.cursor/mcp.json` ignores `cwd`. Relative paths like `src/server.ts` resolve from your home directory and fail. Use **project** `.cursor/mcp.json` (recommended) or `npm run mcp --prefix <abs-path>` in global config.

### Cursor (project) — recommended

This repo includes [`.cursor/mcp.json`](.cursor/mcp.json). Open the repo as your Cursor workspace — no absolute paths needed:

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "${workspaceFolder}"]
    }
  }
}
```

Reload MCP after clone: **Cmd+Shift+J → MCP**.

If you also define `locator-mcp` in global `~/.cursor/mcp.json`, remove one to avoid duplicate servers.

### Cursor (global)

For use across workspaces, add to `~/.cursor/mcp.json` with your clone path:

```json
"locator-mcp": {
  "command": "npm",
  "args": ["run", "mcp", "--prefix", "/Users/eswar/Desktop/locator-collector"]
}
```

Replace the path with your local clone location.

### Claude Desktop

Claude does not support `${workspaceFolder}`. Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/Users/you/path/to/locator-mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Production (compiled)

Run `npm run build` in the repo first:

```json
"locator-mcp": {
  "command": "node",
  "args": ["/Users/you/path/to/locator-mcp/dist/server.js"]
}
```

### With Playwright MCP (for `scan_page`)

`scan_page` connects to an already-open browser. Pair with Playwright MCP on the same Chrome CDP endpoint (typically in global `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--cdp-endpoint",
        "http://localhost:9222"
      ]
    },
    "locator-mcp": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/Users/eswar/Desktop/locator-collector"]
    }
  }
}
```

Launch Chrome with remote debugging before scanning:

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/pw-chrome
```

Then call `scan_page` with `cdpEndpoint: "http://localhost:9222"`.

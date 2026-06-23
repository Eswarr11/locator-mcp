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

Add to `~/.cursor/mcp.json` under `mcpServers`.

Set `cwd` to your local clone path. From the repo root:

```bash
pwd
# e.g. /Users/you/projects/locator-mcp
```

Use that output for `<path-to-repo>` in the snippets below.

### Recommended (dev — no build step)

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

### Production (compiled)

Run `npm run build` in the repo first, then use:

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "npm",
      "args": ["run", "start"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

### With Playwright MCP (for `scan_page`)

`scan_page` connects to an already-open browser. Pair with Playwright MCP on the same Chrome CDP endpoint:

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
      "args": ["run", "dev"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

Launch Chrome with remote debugging before scanning:

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/pw-chrome
```

Then call `scan_page` with `cdpEndpoint: "http://localhost:9222"`.

### Alternative (explicit entry file)

If you prefer not to use npm scripts, set `cwd` and a relative `args` path:

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

Compiled:

```json
{
  "mcpServers": {
    "locator-mcp": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "<path-to-repo>"
    }
  }
}
```

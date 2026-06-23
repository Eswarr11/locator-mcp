import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import { z } from 'zod';
import { scanner } from './scanner/scanner.service.js';
import { listRegistryFiles, readRegistry } from './shared/registry.js';
import { ElementMetadata, LocatorRegistry } from './scanner/scanner.types.js';

const server = new McpServer({
  name: 'locator-mcp',
  version: '0.2.0',
});

server.tool(
  'scan_page',
  [
    'Scan an open browser page and extract all element locators.',
    'Supports two connection modes:',
    '(1) cdpEndpoint — Chrome DevTools Protocol HTTP URL (e.g. http://localhost:9222).',
    '    Requires Chrome launched with --remote-debugging-port=9222.',
    '    Use this when @playwright/mcp is also connected to the same external Chrome.',
    '(2) wsEndpoint — Playwright WebSocket URL (e.g. ws://127.0.0.1:PORT/...).',
    '    Use this if you have the browser WS endpoint from a Playwright browser server.',
    'Exactly one of cdpEndpoint or wsEndpoint must be provided.',
    'scanName determines the registry file: registry/{scanName}.json.',
    'scanMode: interactive (default), testId, or full.',
  ].join(' '),
  {
    cdpEndpoint: z
      .string()
      .optional()
      .describe('CDP HTTP endpoint, e.g. http://localhost:9222. Use when Chrome was started with --remote-debugging-port.'),
    wsEndpoint: z
      .string()
      .optional()
      .describe('Playwright WS endpoint, e.g. ws://127.0.0.1:PORT/GUID. Use when connecting via Playwright browser server.'),
    pageUrl: z
      .string()
      .optional()
      .describe('URL substring to target a specific tab. Omit to use the first active page.'),
    scanName: z
      .string()
      .describe('Registry filename without .json, e.g. goal-side-panel-locators.'),
    scanMode: z
      .enum(['interactive', 'testId', 'full'])
      .optional()
      .describe('Element discovery mode: interactive (default), testId, or full.'),
  },
  async ({ cdpEndpoint, wsEndpoint, pageUrl, scanName, scanMode }) => {
    if (!cdpEndpoint && !wsEndpoint) {
      return {
        content: [{
          type: 'text',
          text: [
            'Error: provide either cdpEndpoint or wsEndpoint.',
            '',
            'For use with @playwright/mcp, the recommended setup is:',
            '1. Launch Chrome: open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/pw-chrome',
            '2. Point @playwright/mcp at it: add --cdp-endpoint http://localhost:9222 to its args',
            '3. Call scan_page with cdpEndpoint: "http://localhost:9222"',
          ].join('\n'),
        }],
      };
    }

    let browser;
    try {
      browser = wsEndpoint
        ? await chromium.connect(wsEndpoint)
        : await chromium.connectOverCDP(cdpEndpoint!);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{
          type: 'text',
          text: [
            `Failed to connect to browser: ${msg}`,
            '',
            cdpEndpoint
              ? [
                  'CDP connection failed. Make sure:',
                  `  • Chrome is running with --remote-debugging-port=<port> matching ${cdpEndpoint}`,
                  '  • @playwright/mcp is configured with the same --cdp-endpoint',
                  '',
                  'Quick setup:',
                  '  open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/pw-chrome',
                ].join('\n')
              : 'WebSocket connection failed. Verify the wsEndpoint is correct and the browser server is still running.',
          ].join('\n'),
        }],
      };
    }

    try {
      let page = browser.contexts()[0]?.pages()[0];

      if (pageUrl) {
        outer: for (const ctx of browser.contexts()) {
          for (const p of ctx.pages()) {
            if (p.url().includes(pageUrl)) {
              page = p;
              break outer;
            }
          }
        }
      }

      if (!page) {
        return {
          content: [{
            type: 'text',
            text: 'Connected to browser but no open page was found. Make sure at least one tab is open.',
          }],
        };
      }

      const result = await scanner.scan(page, { scanName, scanMode });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scanId: result.scanId,
            registryFile: result.registryFile,
            pageUrl: result.pageUrl,
            scannedAt: result.scannedAt,
            totalElements: result.totalElements,
            registrySaved: true,
            stats: result.stats,
            warnings: result.warnings,
            sample: result.elements.slice(0, 5),
          }, null, 2),
        }],
      };
    } finally {
      await browser.close();
    }
  }
);

server.tool(
  'get_registry',
  'Return the full contents of registry/{scanName}.json — the map of element keys to CSS, XPath, and template locators.',
  {
    scanName: z
      .string()
      .describe('Registry filename without .json, e.g. goal-side-panel-locators.'),
  },
  async ({ scanName }) => {
    const content = await readRegistry(scanName);
    if (content === null) {
      const available = await listRegistryFiles();
      return {
        content: [{
          type: 'text',
          text: [
            `Error: registry '${scanName}.json' not found.`,
            available.length > 0
              ? `Available registries: ${available.join(', ')}`
              : 'No registry files found. Run scan_page first.',
          ].join('\n'),
        }],
      };
    }
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'list_registries',
  'List all available registry files in the registry/ directory.',
  {},
  async () => {
    const files = await listRegistryFiles();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ registries: files }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_registry_keys',
  'Return a lightweight list of element keys with tagName, testId, and confidence — much smaller than the full registry.',
  {
    scanName: z
      .string()
      .describe('Registry filename without .json.'),
  },
  async ({ scanName }) => {
    const content = await readRegistry(scanName);
    if (content === null) {
      const available = await listRegistryFiles();
      return {
        content: [{
          type: 'text',
          text: [
            `Error: registry '${scanName}.json' not found.`,
            available.length > 0 ? `Available: ${available.join(', ')}` : '',
          ].join('\n'),
        }],
      };
    }

    const registry = JSON.parse(content) as LocatorRegistry;
    const keys = Object.values(registry).map((el: ElementMetadata) => ({
      key: el.key,
      tagName: el.tagName,
      testId: el.attributes.testId,
      confidence: el.locators.confidence,
      matchCount: el.locators.matchCount,
      strategy: el.locators.strategy,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(keys, null, 2) }] };
  }
);

server.tool(
  'get_locator',
  'Return a single element locator entry by key from a named registry.',
  {
    scanName: z.string().describe('Registry filename without .json.'),
    key: z.string().describe('Element key from the registry.'),
  },
  async ({ scanName, key }) => {
    const content = await readRegistry(scanName);
    if (content === null) {
      return { content: [{ type: 'text', text: `Error: registry '${scanName}.json' not found.` }] };
    }

    const registry = JSON.parse(content) as LocatorRegistry;
    const entry = registry[key];
    if (!entry) {
      return {
        content: [{
          type: 'text',
          text: `Error: key '${key}' not found in registry '${scanName}'.`,
        }],
      };
    }

    const { recommended, fallbacks, xpath, confidence, matchCount, strategy } = entry.locators;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          key: entry.key,
          tagName: entry.tagName,
          text: entry.text,
          attributes: entry.attributes,
          locators: { recommended, fallbacks, xpath, confidence, matchCount, strategy },
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'search_registry',
  'Search a registry by tagName, testId, text, or confidence. Returns matching entries only.',
  {
    scanName: z.string().describe('Registry filename without .json.'),
    tagName: z.string().optional().describe('Filter by HTML tag name.'),
    testId: z.string().optional().describe('Filter by data-testid (substring match).'),
    text: z.string().optional().describe('Filter by direct text (substring match).'),
    confidence: z.enum(['high', 'medium', 'low']).optional().describe('Filter by locator confidence.'),
  },
  async ({ scanName, tagName, testId, text, confidence }) => {
    const content = await readRegistry(scanName);
    if (content === null) {
      return { content: [{ type: 'text', text: `Error: registry '${scanName}.json' not found.` }] };
    }

    const registry = JSON.parse(content) as LocatorRegistry;
    const matches = Object.values(registry).filter((el) => {
      if (tagName && el.tagName !== tagName.toLowerCase()) return false;
      if (testId && !el.attributes.testId?.includes(testId)) return false;
      if (text && !el.text?.toLowerCase().includes(text.toLowerCase())) return false;
      if (confidence && el.locators.confidence !== confidence) return false;
      return true;
    });

    return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

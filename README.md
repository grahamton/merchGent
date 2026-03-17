# merch-connector

An MCP server that gives AI agents eyes on any e-commerce storefront. Scrape product listings, take screenshots, run AI-powered merchandising audits, and build persistent memory about sites -- all through the Model Context Protocol.

## What it does

merch-connector connects to any MCP-compatible AI client (Claude Desktop, Claude Code, etc.) and exposes six tools that let the agent browse, extract, analyze, and remember e-commerce pages. It uses a stealth-configured headless browser to handle bot-protected sites, extracts structured product data, detects facets and filters, measures performance, and optionally runs a full merchandising audit using an AI model (Anthropic Claude or Google Gemini).

## Quick start

Run it directly without installing:

```bash
npx merch-connector
```

Or install globally:

```bash
npm install -g merch-connector
merch-connector
```

The server communicates over stdio and is designed to be launched by an MCP client, not run standalone.

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "merch-connector": {
      "command": "npx",
      "args": ["-y", "merch-connector"],
      "env": {
        "ANTHROPIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

Add to your project `.mcp.json` or global config:

```json
{
  "mcpServers": {
    "merch-connector": {
      "command": "npx",
      "args": ["-y", "merch-connector"],
      "env": {
        "ANTHROPIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Using a global install

If you installed globally, replace the command and args:

```json
{
  "mcpServers": {
    "merch-connector": {
      "command": "merch-connector",
      "env": {
        "ANTHROPIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | One of these | API key for Anthropic Claude. Used by `audit_storefront` and `ask_page`. |
| `GEMINI_API_KEY` | One of these | API key for Google Gemini. Used by `audit_storefront` and `ask_page`. |
| `MODEL_PROVIDER` | No | Force a provider: `"anthropic"` or `"gemini"`. Auto-detected from whichever key is set if omitted. |
| `MODEL_NAME` | No | Override the default model. Defaults to `claude-opus-4-6` (Anthropic) or `gemini-2.5-pro` (Gemini). |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom directory for site memory files. Defaults to `~/.merch-connector/data/`. |

You only need one AI API key. If you only plan to use `scrape_page`, `interact_with_page`, `clear_session`, and `site_memory`, no API key is needed at all -- those tools run locally.

## Tools

### audit_storefront

Scrape a product listing or PDP and run a full AI-powered merchandising audit. Returns a structured diagnosis with a 4-dimension audit matrix (Trust, Guidance, Persuasion, Friction), standards checks, and prioritized recommendations. Includes a screenshot for visual analysis.

**Parameters:**
- `url` (required) -- Full URL of the page to audit
- `depth` -- Pages of pagination to follow (1-5, default 1)
- `max_products` -- Max products to extract per page (default 10)

### scrape_page

Extract raw structured data from any storefront URL without AI analysis. Returns product catalog (title, price, stock, CTA, description, B2B/B2C signals), facets/filters, page metadata, performance timing, data layer contents, and interactable elements.

**Parameters:**
- `url` (required) -- Full URL to scrape
- `depth` -- Pages of pagination to follow (1-5, default 1)
- `max_products` -- Max products per page (default 10)
- `include_screenshot` -- Set true to include a base64 JPEG screenshot (default false)

### interact_with_page

Perform a search or click action on a storefront page, then return the resulting page data. Useful for navigating paginated results, triggering search queries, or following CTAs.

**Parameters:**
- `url` (required) -- Full URL to load
- `action` (required) -- `"search"` or `"click"`
- `selector` -- CSS selector (required for click, optional for search)
- `value` -- Text to type (required for search)
- `include_screenshot` -- Include a base64 JPEG screenshot of the result

### ask_page

Scrape a page and ask any natural-language question about it. The AI sees the full product data, facets, performance metrics, and a screenshot.

**Parameters:**
- `url` (required) -- Full URL to scrape and ask about
- `question` (required) -- Your question in plain language
- `depth` -- Pages of pagination to scrape first (default 1)
- `max_products` -- Max products per page (default 10)

### site_memory

Read, write, list, or delete persistent memory about websites. Memory auto-accumulates on every scrape (structure, performance, facets). Use this to add custom notes or store site-specific configuration.

**Parameters:**
- `action` (required) -- `"read"`, `"write"`, `"list"`, or `"delete"`
- `url` -- Any URL on the domain (required for read/write/delete)
- `note` -- Text note to append (used with write)
- `key` -- Custom field name to set (used with write)
- `value` -- Value for the custom field (used with write + key)

### clear_session

Clear stored session cookies for a domain. Use this to test logged-out vs. logged-in experiences.

**Parameters:**
- `url` (required) -- Any URL on the domain to clear

## How site memory works

Every time you scrape a page, merch-connector automatically learns about the site: its structural selectors, performance baseline, available facets, and typical product count. This memory persists across sessions in JSON files stored at `~/.merch-connector/data/` (or the path set by `MERCH_CONNECTOR_DATA_DIR`).

You can also manually store notes and custom fields using the `site_memory` tool -- for example, recording that a site needs extra wait time for lazy loading, uses a non-standard product card selector, or requires login cookies for pricing.

Memory is keyed by domain. Use `site_memory` with `action: "list"` to see all remembered sites.

## Requirements

- Node.js 18 or later
- One AI API key (Anthropic or Google Gemini) for `audit_storefront` and `ask_page`
- No API key needed for scraping-only tools

## License

MIT

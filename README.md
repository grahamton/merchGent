# merch-connector

[![npm version](https://img.shields.io/npm/v/merch-connector)](https://www.npmjs.com/package/merch-connector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP Server](https://img.shields.io/badge/MCP-Server-purple)](https://modelcontextprotocol.io)

**An MCP server that gives AI agents eyes on any e-commerce storefront.**

Scrape product listings, extract facets, measure performance, run AI-powered merchandising audits, and build persistent memory about sites -- all through the [Model Context Protocol](https://modelcontextprotocol.io).

## Why merch-connector?

E-commerce merchandising analysis is manual, repetitive, and fragmented. A merchandiser might spend hours clicking through competitor sites, checking if filters work, comparing product grids, and noting what's changed. AI agents can do this work -- but they can't see storefronts the way shoppers do.

merch-connector bridges that gap. It gives any MCP-compatible AI agent (Claude, custom agents, etc.) the ability to:

- **Browse** any storefront with a stealth headless browser that handles bot protection
- **Extract** structured product data, facets, performance metrics, and page structure
- **Analyze** merchandising quality through three expert personas or a full roundtable debate
- **Remember** site quirks across sessions so the agent gets smarter over time

## Quick start

```bash
npx merch-connector
```

The server communicates over stdio and is designed to be launched by an MCP client, not run standalone.

## Configuration

Add to your Claude Desktop `claude_desktop_config.json` or Claude Code `.mcp.json`:

```json
{
  "mcpServers": {
    "merch-connector": {
      "command": "npx",
      "args": ["-y", "merch-connector"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here"
      }
    }
  }
}
```

Or install globally: `npm install -g merch-connector`

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | One of these | Anthropic Claude API key |
| `GEMINI_API_KEY` | One of these | Google Gemini API key |
| `MODEL_PROVIDER` | No | Force `"anthropic"` or `"gemini"`. Auto-detected if omitted. |
| `MODEL_NAME` | No | Override default model. Defaults: `claude-opus-4-6` / `gemini-2.5-pro` |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom path for site memory files. Default: `~/.merch-connector/data/` |

You only need an API key for AI-powered tools (`audit_storefront`, `ask_page`, `merch_roundtable`). Scraping tools work without one.

## Tools

| Tool | Description | Needs AI key? |
|------|-------------|:---:|
| `scrape_page` | Extract products, facets, metadata, performance timing from any URL | No |
| `interact_with_page` | Search or click on a page, then extract the result | No |
| `ask_page` | Scrape a page and ask any question about it in plain language | Yes |
| `audit_storefront` | Full merchandising audit with structured diagnosis and recommendations | Yes |
| `merch_roundtable` | Three expert personas independently analyze, then debate to consensus | Yes |
| `site_memory` | Read/write persistent notes and learned data about any domain | No |
| `clear_session` | Reset stored cookies for a domain | No |

### Example: ask_page

> "Recommend facet changes for this laptop category page"

```json
{
  "url": "https://www.insight.com/en_US/shop/category/notebooks/store.html",
  "question": "Recommend facet changes?"
}
```

Response:

> **Brand/Manufacturer** -- Most glaring omission. 50 products span 6+ brands (HP, Lenovo, Apple, Microsoft, Dell, Crucial). B2B buyers with vendor agreements need this as facet #1.
>
> **Price range buckets are misaligned.** "Below $50" (2 items) signals category contamination -- confirmed by a Crucial RAM stick appearing in laptop results. Clean up category mapping and re-bucket starting at $500.

### Example: merch_roundtable

The roundtable scrapes once, then runs three sequential AI analyses followed by a moderator synthesis:

1. **Floor Walker** -- reacts as a real shopper ("I can't find Dell laptops without scrolling through 50 products")
2. **Auditor** -- evaluates Trust/Guidance/Persuasion/Friction ("0% facet detection rate, title normalization at 70%")
3. **Scout** -- identifies competitive gaps ("every competitor in B2B tech has brand filtering as facet #1")
4. **Moderator** -- synthesizes consensus, surfaces disagreements, produces prioritized recommendations endorsed by persona

## Personas

Three expert lenses for merchandising analysis. Use individually via the `persona` parameter on `audit_storefront`, or together via `merch_roundtable`.

| Persona | Role | Voice |
|---------|------|-------|
| **Floor Walker** | A shopper visiting for the first time | First-person, casual, instinctive -- "I don't know what button to click" |
| **Auditor** | Compliance analyst with a framework | Metric-driven, precise -- "Fill rate is 82%, 3/10 titles lack brand prefix" |
| **Scout** | VP of Merchandising at a competitor | Strategic, comparative -- "This is table-stakes for the category" |

## Architecture

```
MCP Client (Claude, etc.)
    |
    | stdio (JSON-RPC)
    |
merch-connector (Node.js MCP server)
    |
    +-- scraper.js      Puppeteer + stealth plugin, structure detection, facet extraction
    +-- analyzer.js     Model-agnostic AI (Anthropic Claude / Google Gemini)
    +-- site-memory.js  Persistent per-domain JSON store
    +-- prompts/        Persona prompt files (floor-walker, auditor, scout, moderator)
```

- **Scraping**: Puppeteer with stealth plugin bypasses bot detection. Heuristic structure detection finds product grids on unknown sites. Extracts products, facets, performance timing, and takes screenshots.
- **Analysis**: Dual-provider AI. Anthropic uses tool_choice forcing for structured JSON; Gemini uses responseSchema. Dynamic imports load only the needed SDK.
- **Memory**: Auto-learns site fingerprints (selectors, timing, facet names) on every scrape. Manual notes persist across sessions. Stored as JSON files per domain.
- **Sessions**: Per-domain cookie jar maintained in memory, auto-merged on subsequent calls.

## Development

```bash
git clone https://github.com/grahamton/merchGent.git
cd merchGent
npm install

# Also install at least one AI SDK for analysis features
npm install @anthropic-ai/sdk    # or @google/genai

# Copy and fill in your API key
cp .env.example .env
```

### Running tests

```bash
npm test                              # scrape-only (no API key needed)
npm run test:audit                    # full merchandising audit
npm run test:persona                  # single persona (floor_walker)
npm run test:roundtable               # all 3 personas + moderator
node test/smoke.js --ask "question"   # ask anything about a page
node test/smoke.js --url https://...  # override default URL
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector -- node bin/merch-connector.js
```

Opens a browser UI where you can call any tool interactively.

## Detailed tool reference

### audit_storefront

Scrape + AI analysis in one call. Returns diagnosis, 4-dimension audit matrix (Trust/Guidance/Persuasion/Friction), standards checks, and prioritized recommendations.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to audit |
| `depth` | No | Pagination pages to follow (1-5, default 1) |
| `max_products` | No | Max products per page (default 10) |
| `persona` | No | `"floor_walker"`, `"auditor"`, or `"scout"` |

### scrape_page

Raw structured extraction. Returns products (title, price, stock, CTA, description, B2B/B2C signals), facets/filters, page metadata, performance timing, data layers, and interactable elements.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to scrape |
| `depth` | No | Pagination pages to follow (1-5, default 1) |
| `max_products` | No | Max products per page (default 10) |
| `include_screenshot` | No | Include base64 JPEG screenshot (default false) |

### interact_with_page

Perform a search or click, then extract the resulting page.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to load |
| `action` | Yes | `"search"` or `"click"` |
| `selector` | Depends | CSS selector (required for click) |
| `value` | Depends | Text to type (required for search) |
| `include_screenshot` | No | Include screenshot of result |

### ask_page

Scrape + AI Q&A. The model sees full product data, facets, performance, and a screenshot.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to scrape and ask about |
| `question` | Yes | Plain language question |
| `depth` | No | Pagination pages (default 1) |
| `max_products` | No | Max products per page (default 10) |

### merch_roundtable

Multi-persona analysis with moderator synthesis.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to analyze |
| `depth` | No | Pagination pages (default 1) |
| `max_products` | No | Max products per page (default 10) |

**Returns:** `perspectives` (each persona's take), `debate.consensus`, `debate.disagreements`, `debate.finalRecommendations` (with impact + endorsements).

### site_memory

Persistent per-domain memory. Auto-accumulates on every scrape.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `action` | Yes | `"read"`, `"write"`, `"list"`, or `"delete"` |
| `url` | Depends | Any URL on the domain (required for read/write/delete) |
| `note` | No | Text note to append (with write) |
| `key` | No | Custom field name (with write) |
| `value` | No | Value for the field (with write + key) |

### clear_session

Reset cookies for a domain.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Any URL on the domain to clear |

## History

**v1.2.0** -- Complete rewrite. Replaced the original React + Express UI with a lean MCP server. Added three expert personas, roundtable mode, persistent site memory, dual AI provider support, and facet/pagination extraction.

**v1.0.0** -- Original React + Express application with Gemini-powered analysis.

## License

MIT

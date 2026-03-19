# merch-connector

[![npm version](https://img.shields.io/npm/v/merch-connector)](https://www.npmjs.com/package/merch-connector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP Server](https://img.shields.io/badge/MCP-Server-purple)](https://modelcontextprotocol.io)

**An MCP server that gives AI agents eyes on any e-commerce storefront.**

Scrape product listings, extract facets, badges, sort options, and B2B signals; run AI-powered merchandising audits; compare two storefronts side-by-side; detect what changed between visits; and build persistent memory about sites -- all through the [Model Context Protocol](https://modelcontextprotocol.io).

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
| `OPENAI_API_KEY` | One of these | OpenAI-compatible key (use `"lm-studio"` for LM Studio) |
| `OPENAI_BASE_URL` | No | Base URL for OpenAI-compatible endpoint. Default: `http://localhost:1234/v1` |
| `MODEL_PROVIDER` | No | Force `"anthropic"`, `"gemini"`, or `"openai"`. Auto-detected if omitted. |
| `MODEL_NAME` | No | Override default model. Defaults: `claude-opus-4-6` / `gemini-2.5-pro` |
| `OPENAI_VISION` | No | Set `"true"` to pass screenshots to OpenAI-compatible vision models |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom path for site memory files. Default: `~/.merch-connector/data/` |
| `TOOL_TIMEOUT_MS` | No | AI tool timeout in ms. Default: `120000` (2 min) |

You only need an API key for AI-powered tools (`audit_storefront`, `ask_page`, `merch_roundtable`). Scraping tools work without one.

## Tools

| Tool | Description | Needs AI key? |
|------|-------------|:---:|
| `scrape_page` | Extract products, facets, badges, sort order, B2B signals, and change detection from any URL | No |
| `interact_with_page` | Execute one or more search/click actions in sequence, then extract the result | No |
| `compare_storefronts` | Structured side-by-side diff of two URLs: facet gaps, trust signals, sort options, B2B mode, performance | No |
| `ask_page` | Scrape a page and ask any question about it in plain language | Yes |
| `audit_storefront` | Full merchandising audit with structured diagnosis and recommendations | Yes |
| `merch_roundtable` | Three expert personas independently analyze, then debate to consensus (results stream as each persona completes) | Yes |
| `site_memory` | Read/write persistent notes and learned data about any domain | No |
| `clear_session` | Reset stored cookies and page cache for a domain | No |

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
| **B2B Auditor** | Procurement buyer evaluating a vendor | Process-driven -- scores steps-to-PO, spec completeness, pricing transparency, self-serve viability |

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
node test/smoke.js --b2b              # B2B validation: Insight.com laptops + b2b_auditor
node test/smoke.js --ask "question"   # ask anything about a page
node test/smoke.js --url https://...  # override default URL
node test/protocol.js                 # MCP protocol compliance (no browser/API key needed)
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
| `persona` | No | `"floor_walker"`, `"auditor"`, `"scout"`, or `"b2b_auditor"` |

### scrape_page

Raw structured extraction. Returns products (title, price, stock, CTA, description, B2B/B2C signals, trust signals), facets/filters, sort options, B2B mode + conflict score, page metadata, performance timing, data layers, and interactable elements. On repeat visits, also returns a `changes` diff (new/removed products, price movements, facet/sort changes).

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to scrape |
| `depth` | No | Pagination pages to follow (1-5, default 1) |
| `max_products` | No | Max products per page (default 10) |
| `include_screenshot` | No | Include base64 JPEG desktop screenshot (default false) |
| `mobile_screenshot` | No | Also capture a 390×844 (iPhone 14) mobile screenshot (default false) |

**Trust signals per product:** star rating, review count, sale badge + text, best seller flag, stock warning ("Only 3 left"), sustainability label, raw badge texts.

### compare_storefronts

Scrape two URLs concurrently and return a structured diff. No AI call — pure structural analysis.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url_a` | Yes | First URL (your site or baseline) |
| `url_b` | Yes | Second URL (competitor or variant) |
| `max_products` | No | Max products per page (default 10) |

**Returns:** product count delta, facet gap analysis (onlyInA / onlyInB / shared count), trust signal coverage per site, sort option gaps, B2B mode + conflict score for each, performance delta (FCP + full load, which is faster).

### interact_with_page

Execute one or more search/click actions in sequence, then extract the resulting page. Accepts a single action or an `actions` array for multi-step flows.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to load |
| `actions` | One of these | Array of `{ action, selector?, value? }` for multi-step flows |
| `action` | One of these | Single action shorthand: `"search"` or `"click"` |
| `selector` | Depends | CSS selector (required for click) |
| `value` | Depends | Text to type (required for search) |
| `include_screenshot` | No | Include screenshot of result |

**Multi-step example:** `[{ "action": "search", "value": "laptop" }, { "action": "click", "selector": ".filter-in-stock" }]`

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

**v1.5.0** -- Major scraper and tooling expansion. `scrape_page` now returns per-product trust signals (star rating, review count, sale badges, best seller, stock warnings, sustainability labels), sort order detection, `b2bMode` + `b2bConflictScore` as top-level fields, and a `changes` diff on repeat visits (new/removed products, price movements, facet/sort changes). New `compare_storefronts` tool diffs two URLs side-by-side with no AI call. `interact_with_page` now accepts an `actions` array for multi-step flows (search → filter → click). Optional `mobile_screenshot` parameter on `scrape_page` captures a 390×844 iPhone viewport. Roundtable streams each persona result via `notifications/message` as it completes instead of waiting for all four. OpenAI-compatible provider support extended with `OPENAI_VISION` flag.

**v1.4.0** -- Added 10-minute in-memory page data cache. `ask_page`, `audit_storefront`, and `merch_roundtable` now reuse a recent `scrape_page` result instead of re-scraping, cutting latency in half for local models. Unified session store: cookies and cached pages share a single domain-keyed structure, so `clear_session` wipes both automatically. Added configurable server-side timeout (`TOOL_TIMEOUT_MS`, default 120s) that returns an actionable error message instead of hanging.

**v1.3.0** -- Added OpenAI-compatible provider support (LM Studio, Ollama, Groq, Together AI, and any OpenAI-compatible endpoint). Configure with `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `MODEL_NAME`. Vision input supported via `OPENAI_VISION=true` for multimodal models. Falls back to JSON prompt mode for models without function calling.

**v1.2.0** -- Complete rewrite. Replaced the original React + Express UI with a lean MCP server. Added four expert personas (Floor Walker, Auditor, Scout, B2B Auditor), roundtable mode with progress notifications, persistent site memory injected into all persona analyses, price bucket validation, dual AI provider support (Anthropic + Gemini), and facet/pagination extraction.

**v1.0.0** -- Original React + Express application with Gemini-powered analysis.

## License

MIT

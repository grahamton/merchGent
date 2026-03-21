# merch-connector

[![npm version](https://img.shields.io/npm/v/merch-connector)](https://www.npmjs.com/package/merch-connector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP Server](https://img.shields.io/badge/MCP-Server-purple)](https://modelcontextprotocol.io)

**An MCP server that gives AI agents eyes on any e-commerce storefront.**

Scrape product listings, extract facets, badges, sort options, and B2B signals; run AI-powered merchandising audits; compare two storefronts side-by-side; detect what changed between visits; and build persistent memory about sites — all through the [Model Context Protocol](https://modelcontextprotocol.io).

---

## Why merch-connector?

E-commerce merchandising analysis is manual, repetitive, and fragmented. A merchandiser might spend hours clicking through competitor sites, checking if filters work, comparing product grids, and noting what's changed. AI agents can do this work — but they can't see storefronts the way shoppers do.

merch-connector bridges that gap. It gives any MCP-compatible AI agent (Claude, custom agents, etc.) the ability to:

- **Browse** any storefront with a stealth headless browser that handles bot protection
- **Extract** structured product data, facets, performance metrics, and page structure
- **Analyze** merchandising quality through five expert personas or a full roundtable debate
- **Remember** site quirks across sessions so the agent gets smarter over time
- **Track** changes across visits — new products, price moves, facet/sort changes

---

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
| `OPENAI_API_KEY` | One of these | OpenAI-compatible API key |
| `OPENAI_BASE_URL` | No | Base URL for OpenAI-compatible endpoint. Defaults to `https://api.openai.com/v1` |
| `MODEL_PROVIDER` | No | Force `"anthropic"`, `"gemini"`, or `"openai"`. Auto-detected if omitted. |
| `MODEL_NAME` | No | Override default model. Defaults: `claude-opus-4-6` / `gemini-2.5-pro` |
| `OPENAI_VISION` | No | Set `"true"` to pass screenshots to OpenAI-compatible vision models |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom path for site memory files. Default: `~/.merch-connector/data/` |
| `TOOL_TIMEOUT_MS` | No | AI tool timeout in ms. Default: `120000` (2 min) |
| `MERCH_LOG_FILE` | No | Path to NDJSON log file. If set, every server log entry is appended. |

You only need an API key for AI-powered tools (`audit_storefront`, `ask_page`, `merch_roundtable`). Scraping tools work without one.

---

## Tools

| Tool | Description | Needs AI key? |
|------|-------------|:---:|
| `scrape_page` | Extract products, facets, badges, sort order, B2B signals, and change detection from any URL | No |
| `interact_with_page` | Execute one or more search/click actions in sequence, then extract the result | No |
| `compare_storefronts` | Structured side-by-side diff of two URLs: facet gaps, trust signals, sort options, B2B mode, performance | No |
| `ask_page` | Scrape a page and ask any question about it in plain language | Yes |
| `audit_storefront` | Full merchandising audit with structured diagnosis and recommendations | Yes |
| `merch_roundtable` | Five expert personas independently analyze, then debate to consensus (results stream as each persona completes) | Yes |
| `site_memory` | Read/write persistent notes and learned data about any domain | No |
| `clear_session` | Reset stored cookies and page cache for a domain | No |
| `get_logs` | Retrieve recent server log entries from the in-memory buffer, filterable by level or tool name | No |
| `save_eval` | Persist a roundtable or audit run as a structured eval record with convergence score | No |
| `list_evals` | Retrieve eval history for a domain or all domains | No |

---

## Examples

### ask_page

> "Recommend facet changes for this laptop category page"

```json
{
  "url": "https://www.insight.com/en_US/shop/category/notebooks/store.html",
  "question": "Recommend facet changes?"
}
```

> **Brand/Manufacturer** — Most glaring omission. 50 products span 6+ brands (HP, Lenovo, Apple, Microsoft, Dell, Crucial). B2B buyers with vendor agreements need this as facet #1.
>
> **Price range buckets are misaligned.** "Below $50" (2 items) signals category contamination — confirmed by a Crucial RAM stick appearing in laptop results. Clean up category mapping and re-bucket starting at $500.

### merch_roundtable

The roundtable scrapes once, then runs five sequential AI analyses followed by a moderator synthesis:

1. **Floor Walker** — reacts as a real shopper ("I can't find Dell laptops without scrolling through 50 products")
2. **Auditor** — evaluates Trust/Guidance/Persuasion/Friction ("0% facet detection rate, title normalization at 70%")
3. **Scout** — identifies competitive gaps ("every competitor in B2B tech has brand filtering as facet #1")
4. **B2B Auditor** — scores procurement readiness (steps-to-PO, spec completeness, pricing transparency)
5. **Moderator** — synthesizes consensus, surfaces disagreements, produces prioritized recommendations

---

## Personas

Five expert lenses for merchandising analysis. Use individually via the `persona` parameter on `audit_storefront`, or together via `merch_roundtable`.

| Persona | Role | Voice |
|---------|------|-------|
| **Floor Walker** | A shopper visiting for the first time | First-person, casual, instinctive — "I don't know what button to click" |
| **Auditor** | Compliance analyst with a framework | Metric-driven, precise — "Fill rate is 82%, 3/10 titles lack brand prefix" |
| **Scout** | VP of Merchandising at a competitor | Strategic, comparative — "This is table-stakes for the category" |
| **B2B Auditor** | Procurement buyer evaluating a vendor | Process-driven — scores steps-to-PO, spec completeness, pricing transparency, self-serve viability |
| **Conversion Architect** | CRO specialist mapping the purchase funnel | Analytical, hypothesis-driven — "checkout button is below the fold on mobile, estimated −8% conversion" |

Each persona returns `score` (0–100), `severity` (1–5), `findings[]` (3–5 concrete observations), and `uniqueInsight` — the one thing only that lens would catch.

Pass `persona: "auto"` to `audit_storefront` and the server picks the best fit automatically based on the page fingerprint.

---

## Architecture

```
MCP Client (Claude, etc.)
    |
    | stdio (JSON-RPC)
    |
merch-connector (Node.js MCP server)
    |
    +-- scraper.js       Puppeteer + stealth plugin, structure detection, PageFingerprint
    +-- analyzer.js      Multi-provider AI (Anthropic / Gemini / OpenAI), 5 personas, smart selection
    +-- network-intel.js XHR interception, 35-platform fingerprint, dataLayer/GA4 parsing
    +-- site-memory.js   Persistent per-domain JSON store + change detection snapshots
    +-- eval-store.js    JSONL eval index + full run storage, convergence scoring
    +-- prompts/         Persona prompt files (floor-walker, auditor, scout, b2b-auditor, conversion-architect)
```

- **Scraping**: Puppeteer with stealth plugin bypasses bot detection. Heuristic structure detection finds product grids on unknown sites. Extracts products, facets, trust signals (ratings, badges, stock warnings), performance timing, and screenshots.
- **Network intelligence**: Intercepts XHR/fetch during page load to fingerprint the commerce stack (Algolia, Bloomreach, SFCC, Shopify, Elasticsearch, and 30+ more). When a high-confidence match is found, extracts product and facet data directly from the API response — bypassing DOM parsing failures on enterprise storefronts.
- **Analysis**: Three-provider AI — Anthropic uses `tool_choice` forcing for structured JSON; Gemini uses `responseSchema`; OpenAI-compatible uses function calling with a JSON-prompt fallback. Dynamic imports load only the needed SDK.
- **Personas**: Five expert lenses. `audit_storefront` supports `persona: "auto"` for fingerprint-driven selection. `merch_roundtable` runs all five in parallel then passes results to a moderator that synthesizes consensus and disagreements.
- **Memory**: Auto-learns site patterns on every scrape. Normalized snapshots enable change detection across visits — price moves, new/removed products, facet/sort changes. Manual notes persist across sessions.
- **Evals**: Two-tier storage — compact JSONL index (100 runs/domain) + full run JSON (10/domain). Convergence score (0–100) measures inter-persona agreement. Dedup hashing prevents double-saves.

---

## Development

```bash
git clone https://github.com/grahamton/merchGent.git
cd merchGent
npm install
cp .env.example .env   # fill in at least one AI API key
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

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector -- node bin/merch-connector.js
```

Opens a browser UI where you can call any tool interactively.

---

## Tool reference

### audit_storefront

Scrape + AI analysis in one call. Returns diagnosis, 4-dimension audit matrix (Trust/Guidance/Persuasion/Friction), standards checks, and prioritized recommendations.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to audit |
| `depth` | No | Pagination pages to follow (1–5, default 1) |
| `max_products` | No | Max products per page (default 10) |
| `persona` | No | `"floor_walker"`, `"auditor"`, `"scout"`, `"b2b_auditor"`, `"conversion_architect"`, or `"auto"` |

### scrape_page

Raw structured extraction. Returns products (title, price, stock, CTA, description, B2B/B2C signals, trust signals), facets/filters, sort options, B2B mode + conflict score, page metadata, performance timing, data layers, interactable elements, and PageFingerprint. On repeat visits, also returns a `changes` diff.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to scrape |
| `depth` | No | Pagination pages to follow (1–5, default 1) |
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

**Returns:** product count delta, facet gap analysis (onlyInA / onlyInB / shared count), trust signal coverage per site, sort option gaps, B2B mode + conflict score for each, performance delta (FCP + full load).

### interact_with_page

Execute one or more search/click actions in sequence, then extract the resulting page.

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

Multi-persona analysis with moderator synthesis. Each persona result is streamed as a `notifications/message` as it completes — clients don't have to wait for all five.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Full URL to analyze |
| `depth` | No | Pagination pages (default 1) |
| `max_products` | No | Max products per page (default 10) |

**Returns:** `perspectives` (each persona's typed result), `debate.consensus`, `debate.disagreements`, `debate.finalRecommendations` (with impact + endorsing personas).

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

Reset cookies and cached page data for a domain.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | Any URL on the domain to clear |

### save_eval

Persist the most recent roundtable or audit run as a structured eval record. Reads from the session persona cache — no data round-trip through the model. Must call `merch_roundtable` or `audit_storefront` on the same URL first.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | Yes | URL of the run to save (must match a cached session) |
| `note` | No | Optional free-text annotation |

**Returns:** eval ID, convergence score (0–100 inter-persona agreement), top concerns per persona, moderator summary excerpt, dedup hash.

### list_evals

Retrieve eval history for a domain or all domains.

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `url` | No | Filter to a specific domain. Omit to return all domains with eval history. |

### get_logs

Retrieve recent server log entries from the in-memory circular buffer (500 entries).

| Parameter | Required | Description |
|-----------|:---:|-------------|
| `level` | No | Filter by level: `"error"`, `"warn"`, `"info"`, `"debug"` |
| `tool` | No | Filter by tool name (e.g. `"merch_roundtable"`) |
| `limit` | No | Max entries to return (default 50) |

---

## History

### v2.0.0 — acquire tool: one-pass v2 architecture

- **New `acquire` tool**: Single call replaces the 6–8 step `scrape_page` + `audit_storefront` workflow — returns products, facets, screenshots, performance, trust signals, PDP samples, analytics, dataQuality, and `warnings[]` in one payload
- **Firecrawl integration**: LLM extraction via Firecrawl as primary scraper with automatic Puppeteer fallback; `scraperMeta` field reports which path was used and any fallback reason
- **`audit_storefront` retired**: Returns a hard error directing callers to `acquire`; `scrape_page` marked deprecated with log warning
- **Protocol tests updated**: 34/34 passing; `acquire` in tool list, `audit_storefront` absent, `scrape_page` deprecation asserted

### v1.9.2 — MCP-002 & MCP-005 fixes, roundtable refactor, B2B persona routing

- **MCP-002**: Restored `extractFacetsGeneric` fallback + `hasFacetStructure` structural scoring bonus (+20); added nested wrapper key support (`response.*`, `data.*`) and wired generic extraction as a fallback in `extractFromBestApi` — "Unknown Facet" no longer appears when XHR data is available
- **MCP-005**: Mobile screenshots now dismiss OneTrust, Cookiebot, and TrustArc consent overlays before capture; blank-image threshold raised to 20 KB to reliably reject consent-blocked frames
- **Roundtable refactor**: Collapsed per-provider per-persona duplicates into generic dispatch functions (~1000 lines removed); `merch_roundtable` auto-substitutes the B2B auditor persona when B2B signals are detected

### v1.9.1 — Bug fixes from Cowork plugin QA sweep

- **CSS selector safety**: `compare_storefronts` no longer crashes on Tailwind JIT arbitrary-value class names — all class-to-selector conversions now use `CSS.escape()`
- **Paint timing**: FCP and first-paint captured via pre-navigation `PerformanceObserver` — no longer returns 0 on SPA category pages
- **Mobile screenshot**: renders in a fresh browser page with UA + viewport set before navigation, fixing blank white screen on UA-gated SPAs
- **PDP `pageType`**: URL pattern signals (`/product/`, `/p/`, `/buy/product/`, `/pdp/`) now take priority over DOM product-count heuristics, fixing misclassification on PDPs with related-product carousels
- **AI timeout resilience**: `audit_storefront` and `merch_roundtable` cap the product payload sent to AI at 20 items, reducing prompt size and inference time
- **`scrape_pdp` price extraction**: falls back to CTA button text when no dedicated price element is found; `hasReviews` and `specTable.present` now require count > 0
- **Facet resolution**: "Unknown Facet" placeholders replaced with real names from intercepted XHR when a search API is detected
- **`get_category_sample`**: error response now includes `reason` and `suggestion` when no product URLs are found

### v1.9.0 — PDP sampling, smarter facets, B2B fingerprint depth

- **`scrape_pdp` tool**: dedicated PDP scraper returning description fill rate, image count, review schema, spec table, cross-sell modules, CTA text, and primary/sale prices — purpose-built for single product pages
- **`get_category_sample` tool**: scrapes a category page and runs `scrape_pdp` in parallel on a spread/random/top selection of products — one call for a multi-PDP spot check
- **Facet detection hardened**: Strategy 1 now skips parent containers that wrap multiple filter groups (fixes the "all filters collapsed into one facet" bug on obfuscated-class sites like Zappos); Strategy 2 replaced with heading-to-heading tree walker so filter groups segment correctly regardless of CSS class names
- **B2B fingerprint depth**: three new fingerprint fields — `contractPricingVisible`, `loginRequired`, `accountPersonalization`; `audit_storefront` now uses a dedicated `AUDIT_TIMEOUT_MS` (default 240s); PageSpeed Insights Core Web Vitals available via `include_pagespeed: true` on `scrape_page`

### v1.8.0 — Persona architecture v2

- **PA-2 Fingerprint context injection**: every persona now receives a `## Page Intelligence (pre-scan)` block prepended to its prompt — pageType, platform, commerceMode, trust signal inventory, top risks, and recommended personas — so the AI orients before reading raw product data
- **PA-4 Unified base schema**: all personas return `score` (0–100), `severity` (1–5), `findings[]` (3–5 observations), `uniqueInsight` — enabling structured cross-persona comparison
- **PA-5 Smart auto-selection**: `audit_storefront` accepts `persona: "auto"` — `selectPersonas(fingerprint)` picks the best-fit lens based on pageType and commerceMode
- **PA-6 Conversion Architect**: new CRO persona maps funnel stages, catalogs friction inventory, identifies top drop-off risk, generates A/B hypotheses with estimated lift ranges
- **Perf**: roundtable log entries no longer embed full result objects — `get_logs` payload reduced ~95% for cached re-runs

### v1.7.0 — PageFingerprint + synchronous moderator

- **PA-3 Synchronous moderator**: `merch_roundtable` now awaits the moderator synthesis before returning — `debate.consensus` and `debate.finalRecommendations[]` are guaranteed in the tool response
- **PA-1 PageFingerprint**: every scrape result now includes a `fingerprint` field with no extra AI call — `pageType`, `platform`, `commerceMode`, `priceTransparency`, `trustSignalInventory`, `discoveryQuality`, `funnelReadiness`, `topRisks[]`, `recommendedPersonas[]`
- **Category contamination detector**: `scrape_page` returns `contamination: { detected, suspectCount, suspects[] }` when off-category products appear in results
- **`get_logs` tool + file logging**: retrieves recent server log entries from an in-memory buffer (500 entries), filterable by level and tool name; set `MERCH_LOG_FILE` for NDJSON file logging

### v1.6.4

`save_eval` now works with all tool types, not just `merch_roundtable`. Convergence score returns `null` (not `0`) for single-persona runs. Auto-detects `toolName` from whichever persona cache slots are populated.

### v1.6.3 — Eval store

Two new tools (`save_eval`, `list_evals`) add persistent run tracking. Convergence score (0–100) measures inter-persona agreement on top concerns. Two-tier storage: compact JSONL index (100/domain) + full run JSON (10/domain). Dedup hashing prevents double-saving identical runs.

### v1.6.2

Roundtable personas now run in parallel via `Promise.all`, cutting wall-clock time from ~90s to ~30s. Persona results are written to cache the moment each resolves, so a retry after a timeout picks up where it left off.

### v1.6.0 — Network Intelligence Layer

Every `scrape_page` call now intercepts XHR/fetch responses and fingerprints the commerce stack from 35 platform signatures: Elasticsearch, Algolia, Coveo, Lucidworks Fusion, Bloomreach, Searchspring, SFCC, SAP Hybris, Shopify, Bazaarvoice, and more. When a high-confidence API match is found (≥70%), products and facets are extracted directly from the API response. Deep `dataLayer`/`digitalData` parsing surfaces GA4 events, GTM container IDs, A/B experiment assignments, and user segments. Discovered API endpoints are persisted to site memory so the discovery pass only runs once per domain.

### v1.5.0 — Scraper expansion

Per-product trust signals (ratings, badges, stock warnings), sort order detection, `b2bMode` + `b2bConflictScore`, change detection on repeat visits. New `compare_storefronts` tool. Multi-step `interact_with_page` actions array. Optional mobile screenshot. Roundtable streams each persona result as it completes.

### v1.4.0

10-minute in-memory page cache. `ask_page`, `audit_storefront`, and `merch_roundtable` reuse recent scrape results, cutting latency in half. Configurable `TOOL_TIMEOUT_MS`.

### v1.3.0

OpenAI-compatible provider support (OpenAI, Groq, Together AI, any OpenAI-compatible endpoint). `OPENAI_VISION=true` for multimodal models.

### v1.2.0

Complete rewrite — lean MCP server replacing the original React + Express UI. Four expert personas, roundtable mode, persistent site memory, dual AI provider support (Anthropic + Gemini).

### v1.0.0

Original React + Express application with Gemini-powered analysis.

---

## License

MIT

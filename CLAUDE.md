# CLAUDE.md — merch-connector (merchGent)

## What this project is

An MCP server that gives AI agents visual access to e-commerce storefronts for automated merchandising analysis. It bridges AI and real product pages through a stealth headless browser, a multi-provider AI abstraction layer, and a persona-based expert analysis system.

**13 MCP tools**: `scrape_page`, `scrape_pdp`, `get_category_sample`, `interact_with_page`, `compare_storefronts`, `audit_storefront`, `ask_page`, `merch_roundtable`, `site_memory`, `clear_session`, `get_logs`, `save_eval`, `list_evals`

**5 MCP prompts** (persona instructions): `floor-walker`, `auditor`, `auditor-b2b`, `scout`, `merch-roundtable`

**MCP resources**: per-domain site memories exposed at `merch-memory://<domain>` URIs

Transport: stdio JSON-RPC only (not HTTP). Designed to be launched by an MCP client, not run standalone.

---

## Project structure

```
bin/merch-connector.js        # CLI entry point
server/
  index.js                    # MCP server + all tool/prompt/resource handlers
  scraper.js                  # Puppeteer scraping + structure detection
  analyzer.js                 # Multi-provider AI analysis + persona logic
  site-memory.js              # Persistent per-domain JSON store
  eval-store.js               # Eval run storage: JSONL compact index + full run JSON
  network-intel.js            # XHR/fetch interception, platform fingerprints, dataLayer parsing
  prompts/                    # Markdown files for each persona + system prompt
test/
  smoke.js                    # Direct function tests (needs browser + optional API key)
  protocol.js                 # MCP protocol compliance tests (no browser/API key needed)
```

Site memory files live in `~/.merch-connector/data/<domain>.json` (configurable via `MERCH_CONNECTOR_DATA_DIR`).

Eval runs live in `~/.merch-connector/evals/<domain>.jsonl` (compact, up to 100 per domain) and `~/.merch-connector/evals/runs/<id>.json` (full, up to 10 per domain).

---

## Development setup

```bash
npm install
cp .env.example .env   # fill in at least one AI API key
```

Run the server:
```bash
npm start              # stdio MCP server
```

Connect via Inspector (opens browser UI):
```bash
npx @modelcontextprotocol/inspector -- node bin/merch-connector.js
```

---

## Environment variables

| Variable | Required? | Notes |
|----------|-----------|-------|
| `ANTHROPIC_API_KEY` | One of these three | `sk-ant-...` |
| `GEMINI_API_KEY` | One of these three | Google Gemini |
| `OPENAI_API_KEY` | One of these three | OpenAI-compatible API key |
| `OPENAI_BASE_URL` | No | Optional; defaults to `https://api.openai.com/v1` |
| `MODEL_PROVIDER` | No | Force: `"anthropic"`, `"gemini"`, or `"openai"` |
| `MODEL_NAME` | No | Override default model |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom path for site memory files |
| `TOOL_TIMEOUT_MS` | No | AI tool timeout in ms (default: 120000) |
| `AUDIT_TIMEOUT_MS` | No | Timeout for `audit_storefront` specifically (default: 240000) |
| `OPENAI_VISION` | No | Set `"true"` to enable screenshots for OpenAI-compatible models |
| `MERCH_LOG_FILE` | No | Path to NDJSON log file. Every `sendLog` call appends a structured line. |

Provider is auto-detected from available API keys: Anthropic → Gemini → OpenAI. Scraping tools (`scrape_page`, `interact_with_page`) work without any API key.

---

## Testing

```bash
# Protocol compliance (no browser or API key needed — run this first)
node test/protocol.js

# Scrape only (needs browser, no API key)
npm test

# Full audit (needs browser + API key)
npm run test:audit

# Single persona
npm run test:persona floor_walker

# All 3 personas + moderator debate
npm run test:roundtable

# B2B validation: Insight.com laptops + b2b_auditor persona
node test/smoke.js --b2b

# Ad-hoc question against a live page
node test/smoke.js --ask "what colors are available?"

# Custom URL
node test/smoke.js --url https://www.nike.com/w/mens-shoes
```

`test/smoke.js` supports `--url`, `--audit`, `--persona <name>`, `--ask "<question>"`, `--roundtable`, `--b2b` flags.

Default test URL: `https://www.zappos.com/running-shoes` (reliable product grid).

---

## Architecture notes

### Session / cache model
- Sessions are in-memory, keyed by domain. They do NOT survive a server restart.
- Each session stores: cookies + a 10-minute page cache (shared across `ask_page`, `audit_storefront`, `merch_roundtable`).
- `clear_session` wipes both cookies and cached pages for a domain.

### AI provider abstraction
Each analysis mode has parallel implementations for Anthropic / Gemini / OpenAI-compatible. `detectProvider()` dispatches to the right one. For Anthropic, structured output uses `tool_choice` forcing; for Gemini, `responseSchema`; for OpenAI-compatible, function calling with a JSON-prompt fallback.

### Scraper structure detection
Two-pass heuristic: tries stable selectors (data-automation, itemprop, common class patterns) first, then falls back to a scoring algorithm that finds the DOM container with the most repeated children carrying price/image/CTA signals.

### Scrape output fields (v1.5.0)
Every `scrapePage` call returns:
- `products[]` — title, price, stockStatus, CTA, description, b2bIndicators, b2cIndicators, `trustSignals` (star rating, review count, sale badge, best seller, stock warning, sustainability label, raw badge texts)
- `facets[]` — name, type, options, selectedCount
- `sortOptions` — type (`select`|`dropdown`|`button-group`), current sort, full options list; `null` if not detected
- `b2bMode` — `"B2B"` | `"B2C"` | `"Hybrid"`
- `b2bConflictScore` — 0–100; percentage of products carrying both B2B and B2C signals
- `changes` — diff vs. stored snapshot (new/removed products, price changes, facet/sort changes); `undefined` on first scrape of a domain
- `fingerprint` — pre-computed `PageFingerprint` object: `pageType`, `platform`, `commerceMode`, `priceTransparency`, `trustSignalInventory`, `discoveryQuality`, `funnelReadiness`, `topRisks[]`, `recommendedPersonas[]`
- `performance`, `structure`, `findings`, `interactables`, `dataLayers`

### Personas
Each persona returns a typed JSON schema validated against a strict schema before use. All five personas share a common base schema: `score` (0–100), `severity` (critical/major/minor), `findings[]`, `uniqueInsight`. `merch_roundtable` runs Floor Walker, Auditor, and Scout in **parallel** via `Promise.all`, then awaits the moderator synchronously — the complete `debate` field (consensus, disagreements, finalRecommendations) is guaranteed in the tool response. Each persona result is streamed as a `notifications/message` as it completes (type: `roundtable_persona_result`). `audit_storefront` supports `persona: "auto"` for fingerprint-driven selection.

### Site memory
Auto-populated on every `scrapePage` call (`learnFromScrape()`). Loaded and injected into all persona analyses for cross-session learning. Manual notes supported via the `site_memory` tool. A normalized snapshot is also stored on every scrape and diffed against the previous one — the `changes` field in scrape output is driven by this.

### Change detection
`takeSnapshot()` and `diffSnapshot()` in `site-memory.js` normalize products (title/price/stock), facet names, sort options, and `b2bMode` into a compact baseline. On every subsequent scrape, the diff is computed before the snapshot is updated and included in the output as `changes`.

### Competitor comparison
`compare_storefronts` scrapes two URLs concurrently (cache-aware) and returns a pure structural diff — no AI call. Fields: product count delta, facet gap analysis (onlyInA/onlyInB/shared), trust signal coverage per site, sort option gaps, B2B mode comparison, performance delta (FCP + full load).

### Eval store
`server/eval-store.js` implements two-tier storage aligned with industry JSONL conventions (mcp-eval, letta-evals):
- **Compact index** — `~/.merch-connector/evals/<domain>.jsonl` — one JSON line per run, max 100 per domain. Fields use OpenTelemetry MCP semantic conventions (`mcp.tool.name`). Contains `convergenceScore`, `topConcerns[]`, `moderatorSummary`, `hash`, optional `note` and `judgeScore`.
- **Full run** — `~/.merch-connector/evals/runs/<id>.json` — complete persona outputs (`floor_walker`, `auditor`, `scout`, `debate`), max 10 per domain (oldest deleted on overflow).
- **Convergence score** (0–100) — keyword overlap across the three persona `topConcern` strings. High = strong inter-persona consensus. Mirrors the "mcpx-eval" judge-agreement approach.
- **Dedup** — runs with identical `hash` (same three top concerns) are not re-appended to the compact index.
- `save_eval` reads from the session persona cache — no data round-trip through the model. Must call `merch_roundtable` or `audit_storefront` (with persona) on the same URL first.
- `list_evals` without a URL returns all domains with eval history.

---

## Key conventions

- **ES modules** throughout (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- **Node 18+** required.
- Functions are plain async exports (no class wrappers).
- JSON schemas for AI outputs are defined as `UPPERCASE_WITH_UNDERSCORES` constants in `analyzer.js`.
- Tool errors are returned as `{ content: [...], isError: true }` (MCP spec compliant), not thrown.
- Page data is embedded as formatted JSON blocks in prompts — never interpolated raw strings — to prevent prompt injection.
- Do not add browser launch logic outside `server/scraper.js`. The `BrowserManager` singleton in that file owns the headless browser lifecycle.
- `computeB2BSignals(products)` is exported from `scraper.js` — callers can use it to classify page data without re-scraping.

---

## Common tasks

**Add a new tool**: Register it in `server/index.js` under both `ListToolsRequestSchema` (schema declaration) and `CallToolRequestSchema` (dispatch), then implement the logic, preferably in `scraper.js` or `analyzer.js`.

**Add a new persona**: Create a `server/prompts/<name>.md` file, add a schema constant in `analyzer.js`, implement `analyzeAs<Name>()` with provider branches, export it, and register the prompt in `server/index.js`.

**Change default model**: Set `MODEL_NAME` in `.env`. Do not hard-code model names in source — they belong in `.env`.

**Adjust AI timeout**: Set `TOOL_TIMEOUT_MS` in `.env`.

**Add a scrape output field**: Add extraction logic in `extractPageData()` in `scraper.js`, include it in the return object, and add it to `buildPageOutput()` in `index.js` so it reaches MCP callers. If it should appear in change detection, also update `normalizeSnapshot()` in `site-memory.js`.

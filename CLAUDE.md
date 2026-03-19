# CLAUDE.md — merch-connector (merchGent)

## What this project is

An MCP server that gives AI agents visual access to e-commerce storefronts for automated merchandising analysis. It bridges AI and real product pages through a stealth headless browser, a multi-provider AI abstraction layer, and a persona-based expert analysis system.

**7 MCP tools**: `scrape_page`, `interact_with_page`, `audit_storefront`, `ask_page`, `merch_roundtable`, `site_memory`, `clear_session`

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
  prompts/                    # Markdown files for each persona + system prompt
test/
  smoke.js                    # Direct function tests (needs browser + optional API key)
  protocol.js                 # MCP protocol compliance tests (no browser/API key needed)
```

Site memory files live in `~/.merch-connector/data/<domain>.json` (configurable via `MERCH_CONNECTOR_DATA_DIR`).

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
| `OPENAI_API_KEY` | One of these three | OpenAI-compatible (set to `"lm-studio"` for LM Studio) |
| `OPENAI_BASE_URL` | No | Default: `http://localhost:1234/v1` |
| `MODEL_PROVIDER` | No | Force: `"anthropic"`, `"gemini"`, or `"openai"` |
| `MODEL_NAME` | No | Override default model |
| `MERCH_CONNECTOR_DATA_DIR` | No | Custom path for site memory files |
| `TOOL_TIMEOUT_MS` | No | AI tool timeout in ms (default: 120000) |
| `OPENAI_VISION` | No | Set `"true"` to enable screenshots for OpenAI-compatible models |

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

# Ad-hoc question against a live page
node test/smoke.js --ask "what colors are available?"

# Custom URL
node test/smoke.js --url https://www.nike.com/w/mens-shoes
```

`test/smoke.js` supports `--url`, `--audit`, `--persona <name>`, `--ask "<question>"`, `--roundtable` flags.

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

### Personas
Each persona returns a typed JSON schema validated against a strict schema before use. Personas are independent — `merch_roundtable` runs all three in sequence then passes all results to a moderator that synthesizes consensus and disagreements.

### Site memory
Auto-populated on every `scrapePage` call (`learnFromScrape()`). Loaded and injected into all persona analyses for cross-session learning. Manual notes supported via the `site_memory` tool.

---

## Key conventions

- **ES modules** throughout (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- **Node 18+** required.
- Functions are plain async exports (no class wrappers).
- JSON schemas for AI outputs are defined as `UPPERCASE_WITH_UNDERSCORES` constants in `analyzer.js`.
- Tool errors are returned as `{ content: [...], isError: true }` (MCP spec compliant), not thrown.
- Page data is embedded as formatted JSON blocks in prompts — never interpolated raw strings — to prevent prompt injection.
- Do not add browser launch logic outside `server/scraper.js`. The `BrowserManager` singleton in that file owns the headless browser lifecycle.

---

## Common tasks

**Add a new tool**: Register it in `server/index.js` under both `ListToolsRequestSchema` (schema declaration) and `CallToolRequestSchema` (dispatch), then implement the logic, preferably in `scraper.js` or `analyzer.js`.

**Add a new persona**: Create a `server/prompts/<name>.md` file, add a schema constant in `analyzer.js`, implement `analyzeAs<Name>()` with provider branches, export it, and register the prompt in `server/index.js`.

**Change default model**: Set `MODEL_NAME` in `.env`. Do not hard-code model names in source — they belong in `.env`.

**Adjust AI timeout**: Set `TOOL_TIMEOUT_MS` in `.env`.

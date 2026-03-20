# merch-connector Roadmap

Items are grouped by theme. Each has a short description, why it matters, and rough effort.
Reference the design doc at `docs/persona-architecture-v2.md` for full specs on Persona Architecture v2 items.

---

## ✅ Completed

| # | Item | Shipped |
|---|------|---------|
| #2 | Badge & Trust Signal Inventory (per-product: star rating, review count, sale badge, best seller, stock warning, sustainability) | v1.5.0 |
| #3 | Sort Order Extractor (`sortOptions`: type, current, all options) | v1.5.0 |
| #4 | Mobile Viewport Snapshot (`mobile_screenshot: true` on `scrape_page`) | v1.5.0 |
| #5 | Price Bucket Validator | v1.2.0 |
| #6 | B2B/B2C Conflict Scorer — `b2bConflictScore` (0–100) + `b2bMode` (B2B/B2C/Hybrid) as top-level scrape fields | v1.5.0 |
| #7 | B2B Audit Mode (`b2b_auditor` persona) | v1.2.0 |
| #8 | Persona Memory Integration (site notes injected into all persona contexts) | v1.2.0 |
| #9 | Roundtable Streaming Output — each persona result emitted via `notifications/message` as it completes | v1.5.0 |
| #12 | Remove `thinking` param from `askAnthropic` | v1.3.0 |
| #13 | B2B auditor validation — `--b2b` smoke flag targets Insight.com with `b2b_auditor` persona | v1.5.0 |
| #14 | Competitor Comparison Tool — `compare_storefronts`: product delta, facet gaps, trust signal coverage, sort/B2B/perf diff | v1.5.0 |
| #15 | Change Detection — normalized snapshot on every scrape, `changes` field returned with new/removed products, price moves, facet/sort diffs | v1.5.0 |
| #16 | Multi-Step `interact_with_page` Flows — `actions` array executes search/click steps sequentially | v1.5.0 |
| #17 | Network Intelligence Layer — XHR/fetch interception, 35 platform fingerprints (Algolia, Elasticsearch, SFCC, Shopify, etc.), direct API extraction, deep dataLayer/digitalData parsing | v1.6.0 |
| — | OpenAI-compatible provider (LM Studio, Ollama, Groq, etc.) | v1.3.0 |
| — | Page data cache (10-min TTL, shared across ask/audit/roundtable) | v1.4.0 |
| — | Persona result cache — roundtable reuses prior `audit_storefront` persona results | v1.6.0 |
| — | Server-side timeout wrapper with actionable fallback message (`TOOL_TIMEOUT_MS`) | v1.4.0 |
| — | Unified session store (cookies + page cache + persona cache in one domain Map) | v1.4.0 |
| — | Roundtable personas run in parallel via `Promise.all` (~30s vs. ~90s sequential) | v1.6.2 |
| — | Async moderator — tool returns after personas; moderator synthesis arrives via notification | v1.6.2 |
| — | Persona results written to cache immediately as each resolves (retry-safe) | v1.6.2 |
| — | GitHub Actions dual publish (npmjs.org + GitHub Packages) on tag push | v1.6.1 |
| — | All three AI SDKs promoted to regular dependencies (no manual install) | v1.5.5 |
| — | Eval store — `save_eval` + `list_evals` tools; two-tier JSONL storage; convergence score; dedup hashing; all 5 persona types supported | v1.6.3–v1.6.4 |

---

## 🧠 Persona Architecture v2

> Full spec: `docs/persona-architecture-v2.md`
> All six phases are non-breaking and can ship independently.

### PA-1 — PageFingerprint (pre-scan layer)
**What:** A fast, zero-AI pre-scan step that produces a structured `PageFingerprint` from existing scrape data before any persona runs. Fields: `pageType`, `platform`, `commerceMode`, `priceTransparency`, `trustSignalInventory`, `discoveryQuality`, `funnelReadiness`, `topRisks[]` (up to 4 pre-identified structural issues), `recommendedPersonas[]`.

**Why:** Right now each persona independently re-interprets the same raw scrape data — redundant reasoning, higher token counts, inconsistent baseline. The fingerprint computes these facts once and gives personas shared ground truth.

**How:** Pure synchronous JS function `computePageFingerprint(pageData)` in `analyzer.js`. No AI call. Reads `b2bMode`, `facets[]`, `products[].trustSignals`, `networkIntel`, `performance`, `interactables` from the existing scrape output. Include `fingerprint` in `buildPageOutput` so `scrape_page` callers see it too.

**Effort:** Medium — ~100 lines in `analyzer.js` + wiring in `index.js`

---

### PA-2 — Fingerprint context injection
**What:** Prepend the `PageFingerprint` to every persona prompt as shared baseline context. Include the pre-identified `topRisks` and the instruction: *"These structural issues are already known. Focus your analysis on what ONLY your lens can reveal beyond this baseline."*

**Why:** Without this, Floor Walker, Auditor, and Scout all spend tokens re-detecting that there are no ratings, or that FCP is 4200ms. With it, each persona focuses on unique insight. Faster responses, better signal-to-noise.

**How:** Update `buildPersonaContext(pageData, memory, fingerprint)` in `analyzer.js` to accept optional `fingerprint`. Pass it from `handleRoundtable` and `handleAuditStorefront`.

**Effort:** Small — ~30 lines change to `analyzer.js` + both handlers

---

### PA-3 — Synchronous moderator
**What:** Move the moderator from a detached async call to a synchronous `await` at the end of `runRoundtable`. The `debate` field is populated before the tool returns. `moderatorPending` is removed.

**Why:** Currently the moderator result arrives via `notifications/message` *after* the tool call completes. MCP clients that don't implement notification handling miss the synthesis entirely — the most valuable output is the most fragile. A complete, self-contained result in one response is strictly better.

**How:** Replace the detached `.then()` chain in `runRoundtable` with `await callWithPersona(...)`. Total wall clock increases ~8-10s (now ~22s instead of ~18s) in exchange for complete results every time.

**Effort:** Small — ~20 line change in `analyzer.js`

---

### PA-4 — Unified base schema
**What:** Add a common base shape to all persona schemas: `severity` (`critical` | `major` | `minor`), `findings[]` (`dimension`, `status`, `observation`, `impact`), `uniqueInsight`, `score` (0–100 health from this persona's lens). Each persona retains its unique fields alongside the base.

**Why:** Currently each persona returns a completely different shape, making cross-persona reasoning require persona-specific parsing. A unified base lets the moderator, eval system, and any external consumer reason across personas without special-casing each one. Enables richer eval metrics (score trends, dimension-level comparison).

**How:** Update each schema constant in `analyzer.js`. Update each persona prompt file to instruct the model to populate the new fields. Update `ROUNDTABLE_SCHEMA.disagreements[]` from hardwired `floorWalkerPosition` / `auditorPosition` / `scoutPosition` to `positions: { [personaId]: string }`.

**Effort:** Medium — schema changes + prompt file updates for 4 personas

---

### PA-5 — Smart persona selection ✅ v1.8.0
**What:** `audit_storefront` accepts `persona: "auto"` — `selectPersonas(fingerprint)` picks the best-fit persona based on `pageType`, `commerceMode`, and `fingerprint.recommendedPersonas`. B2B pages get `b2b_auditor`; category/search pages always include `scout`; PDP pages trim `scout` in favor of `floor_walker` + `auditor`.

**Note:** Smart selection is implemented for `audit_storefront` (single-persona mode). `merch_roundtable` always runs all three core personas — roundtable smart selection is a future enhancement.

---

### PA-6 — Conversion Architect persona ✅ v1.8.0
**What:** Fifth persona — CRO/funnel specialist. Fields: `funnelMap`, `frictionInventory`, `topDropOffRisk`, `quickWins` (A/B hypotheses with lift ranges), `topConcern`, `summary`, `score`, `severity`, `findings`, `uniqueInsight`.

**Available via:** `audit_storefront` with `persona: "conversion_architect"`. Not included in `merch_roundtable` (roundtable runs floor_walker, auditor, scout only).

---

## 🔬 Scraper Intelligence

### #1 — Category Contamination Detector
**What:** During scraping, compare each product's title/description against the page category. Flag products that clearly don't belong (e.g., a RAM stick on a laptop page). Return as `contamination: { detected: true, suspects: [...] }` in scrape output.

**Why:** Contaminated categories directly hurt conversion — caught this live on Insight.com (Crucial RAM appearing in laptop results). None of the personas currently detects this explicitly.

**How:** Heuristic keyword matching against URL category + page title in `extractPageData()`. Low false-positive threshold — only flag clear mismatches.

**Effort:** Medium — `scraper.js` addition, ~50 lines

---

## 📊 Eval & Observability

### EV-1 — LLM-as-judge scoring
**What:** Optional post-save step that runs a single AI call against a saved eval run and populates the `judgeScore` field in the compact JSONL record. Scores on a 5-dimension rubric: accuracy, completeness, actionability, evidence quality, consensus quality.

**Why:** The convergence score measures inter-persona *agreement* but not output *quality*. An LLM judge provides an independent quality signal — useful for tracking whether prompt changes improved or degraded analysis quality over time.

**How:** Add `run_judge: boolean` option to `save_eval`. If true, fire a single AI call with the full persona outputs + a scoring rubric. Write result back to both the compact record and the full run JSON. Use a lightweight model (haiku/flash) to keep cost low.

**Effort:** Medium — `eval-store.js` + `analyzer.js` judge function, ~80 lines

---

### EV-2 — `get_logs` tool + circular buffer
**What:** New `get_logs` MCP tool that returns the last N server log entries from an in-memory circular buffer. Supports `level` filter (`debug` | `info` | `error`) and `tool` filter.

**Why:** Server log notifications from `notifications/message` are sandwiched in the MCP Inspector UI with no way to copy them all. The `get_logs` tool lets any client retrieve recent logs programmatically — no separate terminal needed.

**How:** Add a 500-entry circular buffer in `index.js`. Push every `sendLog()` call to the buffer. Register `get_logs` tool with `level`, `tool`, and `limit` params.

**Effort:** Small — ~60 lines in `index.js`

---

### EV-3 — File logging
**What:** Optional file logging via `MERCH_LOG_FILE` env var. Appends structured NDJSON to the specified path. Useful for capturing full roundtable notification streams that can't be copied from the Inspector UI.

**Why:** Notifications disappear. When a roundtable produces 7 notifications (3 personas + moderator + progress ticks), there's currently no way to capture them all reliably outside the Inspector.

**How:** In `sendLog()`, if `MERCH_LOG_FILE` is set, append `JSON.stringify({ ts, level, ...data })\n` to the file.

**Effort:** Small — ~20 lines in `index.js`

---

## 🔌 Integrations

### #10 — LogRocket Session Link
**What:** Optional `logrocket_session_url` param on `audit_storefront` and `ask_page`. Fetch session replay data (clicks, rage clicks, network errors) and include it in analysis context.

**Why:** Pairing real user behavior data with page structure analysis is the original vision. Gives personas evidence from actual users, not just inferred problems.

**How:** New `server/logrocket.js`. Fetch + parse session events from LogRocket API. Append as "User Behavior" section in persona context.

**Effort:** Hard — LogRocket API integration + event shape parsing

---

### #11 — Coveo Boost/Bury Actions
**What:** New `coveo_action` tool that translates audit recommendations into Coveo Query Pipeline rules: boost high-trust products, bury contaminated results, configure recommended facets.

**Why:** Analysis without action is a report. This closes the loop — diagnosis leads directly to a configuration change in the commerce platform.

**How:** New `server/coveo.js`. Map audit output fields to Coveo REST API calls. New MCP tool registration.

**Effort:** Hard — requires Coveo org + API credentials + recommendation-to-rule mapping

---

### INT-3 — MCP Registry Submissions
**What:** Submit `merch-connector` to public MCP server registries: `mcp.so`, Glama, and the official Anthropic MCP servers list.

**Why:** Discovery. The package is on npm and GitHub Packages but not findable from the places developers look for MCP servers.

**When:** After more real-world testing and at least one of the PA-v2 phases shipped (fingerprint or synchronous moderator).

**Effort:** Small — write submission forms, no code

---

## 🧹 Tech Debt

### TD-1 — Remove `moderatorPending` after PA-3
Once the synchronous moderator (PA-3) ships, remove `moderatorPending: true` from `runRoundtable` return shape and from any client-side checks. Update CLAUDE.md architecture notes.

**Effort:** Tiny — cleanup pass

---

### TD-2 — Protocol test coverage for base schema fields
Once PA-4 (unified base schema) ships, add protocol test assertions that verify `severity`, `findings[]`, `score`, and `uniqueInsight` are present in roundtable persona outputs. Currently `protocol.js` only checks tool registration and handshake.

**Effort:** Small — `test/protocol.js` additions

---

### TD-3 — `prepublishOnly` check for new server files
`package.json` `prepublishOnly` script only syntax-checks 4 files. Add `eval-store.js` and `network-intel.js`.

**Effort:** Tiny — one line in `package.json`

---

*Last updated: 2026-03-19. Reflects v1.6.4 shipped state.*

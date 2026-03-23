# Changelog

All notable changes to this project will be documented in this file.

## [2.0.13] — 2026-03-22

### Changed
- **Data Quality Model**: `acquire` tool now returns a layered quality model in `dataQuality` separating extraction confidence from site quality.
- `dataQuality.overall.usabilityTier` classifies the page as `full`, `degraded`, `minimal`, or `failed`.
- `dataQuality.dimensions.descriptions` provides a graded tier distribution (`empty`, `spec`, `thin`, `rich`) and a `siteQualityAssessment`.
- `generateWarnings()` uses commerce-mode-aware thresholds (`B2C`, `B2B`, `Hybrid`) for data quality warnings.
- Firecrawl extraction schema refined: `description` renamed to `cardSubtitle` internally with few-shot examples to improve extraction consistency.

## [2.0.9] — 2026-03-22

### Added
- `acquire` now returns top-level `blocked` (boolean), `blockType` (`WAF` | `TIMEOUT` | `EMPTY_RENDER`), and `fallbackSuggestions[]` (3 pre-computed search strings) when warning codes `FIRECRAWL_FAILED`, `LOW_CARD_CONFIDENCE`, or `NO_PRODUCTS_FOUND` are present — gives the skill layer a trivial branch condition instead of requiring warning array parsing
- `blockType` is derived from warning combination: `FIRECRAWL_FAILED` → `WAF`; `NO_PRODUCTS_FOUND` + `FCP_ZERO` → `TIMEOUT`; `NO_PRODUCTS_FOUND` alone → `EMPTY_RENDER`; `LOW_CARD_CONFIDENCE` alone → `WAF`

### Changed
- Blocked responses are no longer cached — a retry after stealth changes or a different entry point always gets a fresh scrape attempt

## [2.0.2] — 2026-03-21

### Fixed
- **MCP-014**: Renamed `trustSignals.avgRatingAcrossProducts` → `avgRating` in `aggregateTrustSignals()` to match the field name the plugin audit command expects
- **MCP-014**: Remapped `warnings[].severity` values from `"high"/"medium"/"low"` to `"error"/"warn"` across all `generateWarnings()` entries and the `FIRECRAWL_FAILED` warning

## [2.0.1] — 2026-03-21

### Fixed
- **MCP-013**: Replaced retired `claude-3-5-sonnet-latest` alias with `claude-sonnet-4-6` in `callAnthropicGeneric` — was causing 404 errors on every Anthropic call (`ask_page`, `merch_roundtable`, all persona tools)

### Added
- `ask_page` now has full Gemini and OpenAI-compatible implementations (were placeholder stubs returning dummy text)
- `ask_page` Anthropic path uses `claude-haiku-4-5-20251001` for fast, cost-effective Q&A; all structured persona analysis continues to use Sonnet
- `FIRECRAWL_API_KEY` documented in README env vars table and CLAUDE.md; README configuration example updated with env passthrough pattern

## [2.0.0] — 2026-03-20

### Added
- `acquire` tool: one-pass audit payload replacing the multi-step scrape + analysis workflow — returns products, facets, screenshots, performance, trust signals, navigation, data quality, analytics platform detection, PDP samples, and `warnings[]` in a single call
- Firecrawl integration as primary scraper with automatic Puppeteer fallback; `scraper` field in response reports which path was used
- `pdp_sample` parameter on `acquire` (0–5, default 2): auto-selects median-priced + 80th-percentile premium products for PDP deep-dive

### Changed
- `audit_storefront` retired — returns a hard error directing callers to `acquire`
- `scrape_page` marked deprecated with log warning

### Fixed
- Protocol tests updated: 34/34 passing; `acquire` present, `audit_storefront` absent, `scrape_page` deprecation asserted

## [1.9.2] — 2026-03-17

### Fixed
- **MCP-002**: Restored `extractFacetsGeneric` fallback + `hasFacetStructure` structural scoring bonus; added nested wrapper key support (`response.*`, `data.*`); wired generic extraction as fallback in `extractFromBestApi` — eliminates "Unknown Facet" when XHR data is available
- **MCP-005**: Mobile screenshots now dismiss OneTrust, Cookiebot, and TrustArc overlays before capture; blank-image threshold raised to 20 KB

### Changed
- Roundtable refactor: collapsed per-provider per-persona duplicates into generic dispatch functions (~1000 lines removed)
- `merch_roundtable` auto-substitutes B2B Auditor persona when B2B signals are detected

## [1.9.1] — 2026-03-15

### Fixed
- `compare_storefronts` no longer crashes on Tailwind JIT arbitrary-value class names — all class-to-selector conversions use `CSS.escape()`
- FCP and first-paint captured via pre-navigation `PerformanceObserver` — no longer returns 0 on SPA category pages
- Mobile screenshot renders in a fresh browser page with UA + viewport set before navigation, fixing blank white screen on UA-gated SPAs
- PDP `pageType`: URL pattern signals now take priority over DOM product-count heuristics — fixes misclassification on PDPs with related-product carousels
- `audit_storefront` and `merch_roundtable` cap product payload sent to AI at 20 items
- `scrape_pdp` price extraction falls back to CTA button text when no dedicated price element is found
- `get_category_sample` error response now includes `reason` and `suggestion` when no product URLs are found

## [1.9.0] — 2026-03-12

### Added
- `scrape_pdp` tool: dedicated PDP scraper — description fill rate, image count, review schema, spec table, cross-sell modules, CTA text, primary/sale prices
- `get_category_sample` tool: scrapes a category and runs `scrape_pdp` in parallel on a selection of products
- Three new B2B fingerprint fields: `contractPricingVisible`, `loginRequired`, `accountPersonalization`
- `AUDIT_TIMEOUT_MS` env var for dedicated `audit_storefront` timeout (default 240s)
- PageSpeed Insights Core Web Vitals via `include_pagespeed: true` on `scrape_page`

### Fixed
- Facet detection: Strategy 1 skips parent containers wrapping multiple filter groups; Strategy 2 replaced with heading-to-heading tree walker

## [1.8.0] — 2026-03-08

### Added
- PA-2 Fingerprint context injection: every persona prompt receives a pre-scan intelligence block (pageType, platform, commerceMode, trust signals, top risks, recommended personas)
- PA-4 Unified base schema: all personas return `score`, `severity`, `findings[]`, `uniqueInsight`
- PA-5 Smart auto-selection: `audit_storefront` accepts `persona: "auto"` for fingerprint-driven selection
- PA-6 Conversion Architect persona: CRO lens, funnel stage mapping, A/B hypotheses with estimated lift

### Fixed
- `get_logs` roundtable entries no longer embed full result objects — payload reduced ~95% for cached re-runs

## [1.7.0] — 2026-03-05

### Added
- PA-3 Synchronous moderator: `merch_roundtable` awaits moderator synthesis before returning — `debate.consensus` and `debate.finalRecommendations[]` guaranteed in response
- PA-1 PageFingerprint: every scrape includes `fingerprint` field (pageType, platform, commerceMode, priceTransparency, trustSignalInventory, discoveryQuality, funnelReadiness, topRisks, recommendedPersonas) — no extra AI call
- Category contamination detector: `scrape_page` returns `contamination: { detected, suspectCount, suspects[] }`
- `get_logs` tool: retrieve server log entries from in-memory buffer (500 entries), filterable by level and tool name
- `MERCH_LOG_FILE` env var for NDJSON file logging

## [1.6.4] — 2026-02-28

### Fixed
- `save_eval` works with all tool types, not just `merch_roundtable`
- Convergence score returns `null` (not `0`) for single-persona runs
- `toolName` auto-detected from whichever persona cache slots are populated

## [1.6.3] — 2026-02-25

### Added
- `save_eval` tool: persist roundtable/audit runs as structured eval records with convergence score
- `list_evals` tool: retrieve eval history by domain or across all domains
- Two-tier eval storage: compact JSONL index (100/domain) + full run JSON (10/domain)
- Convergence score (0–100): measures inter-persona agreement on top concerns
- Dedup hashing: identical runs not re-appended to the compact index

## [1.6.2] — 2026-02-22

### Changed
- Roundtable personas now run in parallel via `Promise.all` — wall-clock time reduced from ~90s to ~30s
- Persona results written to cache as they resolve; retries after timeout resume from last checkpoint

## [1.6.0] — 2026-02-18

### Added
- Network Intelligence Layer: XHR/fetch interception fingerprints the commerce stack from 35 platform signatures (Algolia, Bloomreach, SFCC, Shopify, Elasticsearch, and more)
- High-confidence API match (≥70%) extracts products and facets directly from API response
- Deep `dataLayer`/`digitalData` parsing: GA4 events, GTM container IDs, A/B experiments, user segments
- Discovered API endpoints persisted to site memory — discovery pass runs once per domain

## [1.5.0] — 2026-02-12

### Added
- Per-product trust signals: star rating, review count, sale badge + text, best seller flag, stock warning, sustainability label
- Sort order detection: `sortOptions` field with type, current sort, and full options list
- `b2bMode` + `b2bConflictScore` on scrape results
- Change detection on repeat visits: `changes` diff (new/removed products, price moves, facet/sort changes)
- `compare_storefronts` tool: concurrent scrape + structural diff of two URLs
- Multi-step `interact_with_page` actions array
- Optional mobile screenshot (390×844 iPhone 14 viewport)
- Roundtable streams each persona result as `notifications/message` as it completes

## [1.4.0] — 2026-02-05

### Added
- 10-minute in-memory page cache — `ask_page`, `audit_storefront`, and `merch_roundtable` reuse recent scrape results
- `TOOL_TIMEOUT_MS` env var

## [1.3.0] — 2026-01-28

### Added
- OpenAI-compatible provider support (OpenAI, Groq, Together AI, any OpenAI-compatible endpoint)
- `OPENAI_BASE_URL` env var
- `OPENAI_VISION=true` for multimodal models

## [1.2.0] — 2026-01-20

### Added
- Complete rewrite: lean MCP server replacing the original React + Express UI
- 7 tools via MCP stdio transport
- Three expert personas: Floor Walker, Auditor, Scout
- Multi-persona roundtable with moderator synthesis
- Dual AI provider support (Anthropic + Gemini)
- Persistent per-domain site memory with auto-learning
- Facet/filter extraction (2 strategies)
- Pagination following (up to 5 pages)
- Performance timing extraction
- Per-domain session cookie jar
- Stealth-mode headless browser via puppeteer-extra
- npx support

### Removed
- React UI, Express API server, Firebase integration, Figma integration, all frontend build tooling

## [1.0.0] — 2026-01-01

Initial React + Express application with Gemini-powered merchandising analysis.

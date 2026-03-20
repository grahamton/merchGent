# merch-connector Roadmap

Items are grouped by theme. Each has a short description, why it matters, and rough effort.

---

## Strategic Direction

merch-connector's real moat is the **analysis engine** — 5 expert personas, PageFingerprint, site memory, convergence scoring, eval tracking — not the Puppeteer scraper. Firecrawl and similar tools are better at reliable data acquisition.

The v2.x direction:
1. **Decouple analysis from scraping** — add `analyze_products` tool that accepts raw JSON from any source (Firecrawl, APIs, CSV exports, internal catalogs), no browser required
2. **Specialized agent teams** — new personas for inventory/vendor management and pricing intelligence, composable by domain-focused agents
3. **Claude skill packaging** — zero-infra `/merch-audit <url>` skill wrapping Firecrawl + analysis for one-off audits
4. **A2A integration** — document the pattern for orchestrators that want to delegate merchandising analysis to merch-connector as a specialist subagent

```
Firecrawl (or any data source)
    ↓ structured product JSON
merch-connector (analysis layer)
    ├── PersonaEngine (5+ personas, typed schemas)
    ├── PageFingerprint (zero-AI classification)
    ├── SiteMemory (cross-session learning)
    └── EvalStore (convergence tracking)
         ↓ typed insights
Specialized agents:
    ├── Vendor Management Agent
    ├── Pricing Intelligence Agent
    └── Conversion/CRO Agent
```

---

## ✅ Completed

| # | Item | Shipped |
|---|------|---------|
| PA-1 | PageFingerprint — `pageType`, `platform`, `commerceMode`, `priceTransparency`, `trustSignalInventory`, `discoveryQuality`, `funnelReadiness`, `topRisks[]`, `recommendedPersonas[]` | v1.7.0 |
| PA-2 | Fingerprint context injection — `## Page Intelligence (pre-scan)` block prepended to every persona prompt | v1.8.0 |
| PA-3 | Synchronous moderator — `debate` field fully populated before tool returns; `moderatorPending` removed | v1.7.0 |
| PA-4 | Unified base schema — all personas return `score`, `severity`, `findings[]`, `uniqueInsight` | v1.8.0 |
| PA-5 | Smart persona auto-selection — `audit_storefront` accepts `persona: "auto"` | v1.8.0 |
| PA-6 | Conversion Architect persona — CRO/funnel specialist with funnel map, friction inventory, A/B hypotheses | v1.8.0 |
| #1 | Category Contamination Detector — `contamination: { detected, suspects[] }` in scrape output | v1.7.0 |
| #2 | Badge & Trust Signal Inventory — per-product: star rating, review count, sale badge, best seller, stock warning, sustainability | v1.5.0 |
| #3 | Sort Order Extractor — `sortOptions`: type, current, all options | v1.5.0 |
| #4 | Mobile Viewport Snapshot — `mobile_screenshot: true` on `scrape_page` | v1.5.0 |
| #6 | B2B/B2C Conflict Scorer — `b2bConflictScore` (0–100) + `b2bMode` (B2B/B2C/Hybrid) | v1.5.0 |
| #7 | B2B Audit Mode — `b2b_auditor` persona | v1.2.0 |
| #14 | Competitor Comparison Tool — `compare_storefronts` | v1.5.0 |
| #15 | Change Detection — normalized snapshot, `changes` diff on repeat visits | v1.5.0 |
| #16 | Multi-step `interact_with_page` flows — `actions` array | v1.5.0 |
| #17 | Network Intelligence Layer — XHR/fetch interception, 35 platform fingerprints, dataLayer parsing | v1.6.0 |
| EV-1 | Eval store — `save_eval` + `list_evals`; JSONL index; convergence score; dedup hashing | v1.6.3–v1.6.4 |
| EV-2 | `get_logs` tool + circular buffer (500 entries, level + tool filters) | v1.7.0 |
| EV-3 | File logging — `MERCH_LOG_FILE` env var for NDJSON file output | v1.7.0 |
| — | Multi-provider AI — Anthropic, Gemini, OpenAI-compatible | v1.3.0–v1.5.5 |
| — | Page data cache (10-min TTL, shared across ask/audit/roundtable) | v1.4.0 |
| — | Persona result cache — roundtable reuses prior `audit_storefront` results | v1.6.0 |
| — | Parallel persona execution via `Promise.all` (~30s vs. ~90s sequential) | v1.6.2 |
| — | GitHub Actions dual publish (npmjs.org + GitHub Packages) on tag push | v1.6.1 |

---

## 🧩 Analysis Layer Expansion

### analyze_products — Data-source-agnostic analysis
**What:** New `analyze_products` tool that accepts `{ products[], facets[], url?, domain? }` JSON and runs the full persona analysis engine without a browser. Accepts data from Firecrawl, direct API responses, CSV exports, or internal catalog systems.

**Why:** Decouples the analysis engine from the Puppeteer scraper. Opens up non-web use cases. Enables the Firecrawl → merch-connector pipeline where Firecrawl handles data acquisition and merch-connector handles intelligence. Makes merch-connector installable without browser dependencies for analysis-only workflows.

**How:** New handler in `index.js` that skips `scrapePage()`, builds a `pageData` object from the provided JSON, runs it through `computePageFingerprint()` + persona analysis pipeline. Reuses existing `runAnalysis()` and all persona functions unchanged.

**Effort:** Medium — ~80 lines in `index.js`, no changes to analyzer or scraper

---

### pricing_intel persona — Pricing intelligence specialist
**What:** New persona focused on pricing strategy. Returns: `pricingStrategy` (positioning assessment), `priceDistribution` (bucket analysis), `competitiveSignals` (value vs. premium positioning), `promotionPatterns` (sale cadence, discount depth), `anchoringIssues`, `topConcern`, `score`, `severity`, `findings[]`, `uniqueInsight`.

**Why:** The existing Auditor covers pricing as one dimension of four. A dedicated pricing persona gives pricing teams actionable intelligence — promo erosion, anchor price problems, competitive misalignment — at the depth they actually need.

**How:** New `server/prompts/pricing-intel.md`, `PRICING_INTEL_SCHEMA` constant, `analyzeAsPricingIntel()` function in `analyzer.js`. Register as `audit_storefront` persona option.

**Effort:** Medium — follows the PA-6 Conversion Architect pattern exactly

---

### vendor_mgmt persona — Vendor/inventory specialist
**What:** New persona focused on inventory and assortment health. Returns: `stockHealthScore`, `outOfStockRate`, `vendorConcentration` (brand/vendor diversity), `assortmentGaps` (missing SKU types, size/color gaps), `reorderSignals` (stock warning prevalence), `topConcern`, `score`, `severity`, `findings[]`, `uniqueInsight`.

**Why:** Vendor management teams care about OOS rates, vendor over-concentration, and assortment holes — none of which the current personas surface explicitly. A dedicated lens gives inventory managers actionable data without having to interpret a CRO persona.

**How:** New `server/prompts/vendor-mgmt.md`, `VENDOR_MGMT_SCHEMA` constant, `analyzeAsVendorMgmt()` in `analyzer.js`. Register as `audit_storefront` persona option. Update `selectPersonas()` to consider it for pages with high OOS indicators.

**Effort:** Medium — same pattern as above

---

## 🔌 Distribution & Integration

### Claude Skill — `/merch-audit`
**What:** A Claude skill file that wraps Firecrawl (for data) + merch-connector (for analysis) into a zero-infrastructure audit flow. User runs `/merch-audit https://example.com/category` in any Claude session.

**Why:** Very low barrier to discovery. No MCP server to install. Good for one-off audits, demos, and users who don't need persistent memory or eval tracking.

**Trade-offs:** Stateless — no site memory, no eval persistence. The MCP server remains the power path for ongoing monitoring.

**Effort:** Small — skill file only, no server changes

---

### INT-3 — MCP Registry Submissions
**What:** Submit to `mcp.so`, Glama, and the official Anthropic MCP servers list.

**Why:** Discovery. The package is on npm but not findable from where developers look for MCP servers.

**Effort:** Small — submission forms, no code

---

## 📊 Eval Quality

### EV-1 — LLM-as-judge scoring
**What:** Optional `run_judge: true` flag on `save_eval`. Fires a single lightweight AI call (haiku/flash) against the saved run and populates `judgeScore` on a 5-dimension rubric: accuracy, completeness, actionability, evidence quality, consensus quality.

**Why:** Convergence score measures inter-persona *agreement*; judge score measures output *quality*. Useful for tracking whether prompt changes improved analysis over time.

**Effort:** Medium — `eval-store.js` + new judge function in `analyzer.js`

---

## 🧹 Tech Debt

### TD-2 — Protocol test coverage for base schema fields
Add `protocol.js` assertions for `score`, `severity`, `findings[]`, `uniqueInsight` in persona outputs.

**Effort:** Small

---

### TD-3 — `prepublishOnly` check for new server files
Add `eval-store.js` and `network-intel.js` to the syntax check in `package.json`.

**Effort:** Tiny

---

*Last updated: 2026-03-19. Reflects v1.8.0 shipped state.*

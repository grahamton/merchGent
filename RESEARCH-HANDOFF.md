# Research Handoff: Data Quality Layer — merch-connector v2.0.12

**Date:** 2026-03-22
**Repo:** `C:\dev\merchGent` (or clone from GitHub: `grahamton/merchGent`)
**Version at handoff:** v2.0.12
**Assigned to:** Local model research team
**Requested by:** Graham Higbee

---

## Mission

Design and prototype a robust data quality layer for merch-connector. The current system is brittle — extraction is non-deterministic (LLM-based), scoring uses hard thresholds that produce false 0s, and there's no confidence tagging to distinguish "site has no descriptions" from "we failed to extract them". This produces noisy audit scores and false alarms.

**Produce three artifacts:**
1. **Design doc** — written analysis + recommended architecture (markdown)
2. **Eval harness** — test suite measuring extraction reliability across runs
3. **Schema proposals** — revised `EXTRACT_SCHEMA` + prompt designs to benchmark

---

## Codebase Entry Points

All relevant code lives in `server/`. These are ES modules (`"type": "module"`), Node 18+.

| File | Lines | What it does |
|------|-------|-------------|
| `server/firecrawl-client.js` | 250 | Firecrawl API calls — category `EXTRACT_SCHEMA`, PDP `PDP_EXTRACT_SCHEMA`, `acquireWithFirecrawl()` |
| `server/acquire.js` | 666 | Full acquire pipeline — `computeDataQuality()`, `generateWarnings()`, `aggregateTrustSignals()`, scraper routing |
| `server/scraper.js` | 1266 | Puppeteer DOM extraction — product card parsing, `getBreadcrumb()`, rating/review extraction |
| `test/protocol.js` | ~300 | MCP protocol compliance tests (no browser/API needed) — run with `node test/protocol.js` |

---

## Problem 1: Firecrawl Extraction Non-Determinism

### What happens

`acquireWithFirecrawl()` in `server/firecrawl-client.js` (line 201) calls the Firecrawl API with a JSON Schema (`EXTRACT_SCHEMA`) to extract structured product data from category pages. The schema includes a `description` field for each product card.

**Observed behavior:** On identical URLs on the same day, `description` is sometimes fully populated (`"Color: Matte Black. Model: T2692EPBL."`) and sometimes returns `""`. This flips `descriptionFillRate` between 1.0 and 0.0 — a massive false signal.

### Root cause

Firecrawl uses an LLM to extract structured data from page markdown. The `description` field in the schema has no guidance on what constitutes a "description" for a product *card* (as opposed to a PDP). Product cards on B2B sites (Ferguson, CDW) show spec strings — model numbers, color codes, finish names — not marketing copy. Without explicit guidance, the LLM sometimes maps these to `description` and sometimes skips them.

**Current partial fix (v2.0.12):** Added a `description` annotation to the JSON Schema property and a `prompt` on the extract call:

```js
// server/firecrawl-client.js line ~51
description: {
  type: 'string',
  description: 'Any subtitle, attribute summary, spec text, or short descriptive text visible on the product card below the title...'
}

// server/firecrawl-client.js line ~207
extract: {
  schema: EXTRACT_SCHEMA,
  prompt: 'For each product card, populate description with any subtitle, attribute summary, or spec text...',
}
```

This is untested at scale. Whether it eliminates variance is unknown.

### What to research

1. **Schema annotation effectiveness** — Does adding `description` to a JSON Schema property reliably guide Firecrawl's LLM? What annotation patterns work best?
2. **Multi-run variance** — Run `acquireWithFirecrawl()` against a set of known URLs 5–10x. Measure fill rate variance for `description`, `rating`, `reviewCount`, `badges[]`, `facets[]`. Build the eval harness around this.
3. **Prompt engineering alternatives** — Is a schema annotation better or worse than a `systemPrompt`? Should field descriptions be terse ("spec text below title") or verbose (full examples)?
4. **Field-level confidence scoring** — Should extraction include a per-field confidence float (0–1) rather than just the value? How would this integrate with `computeDataQuality()`?

---

## Problem 2: Hard-Threshold Scoring Brittleness

### What happens

`computeDataQuality()` in `server/acquire.js` (line 224) uses binary qualification:

```js
const withDesc = products.filter(
  p => p.description && p.description !== p.title && p.description.length > 30
).length;
```

A description of 29 chars counts as 0. A description equal to the title counts as 0. These thresholds were guesses. The result:
- A page with 80% real descriptions scores `descriptionFillRate: 0.8` but a page with all 25-char descriptions scores `0.0` — indistinguishable from a blocked/empty response.
- `ratingFillRate: 0` could mean "site has no ratings" (design choice) or "extraction failed" (tool bug). Auditors can't tell.

### What to research

1. **Graded quality tiers** — Instead of binary pass/fail, define quality tiers per field. For descriptions: empty → spec-string (< 40 chars) → thin copy (40–100 chars) → real copy (> 100 chars). Return a distribution, not just a fill rate.
2. **Extraction confidence vs. site quality** — Separate "did we extract this?" from "does the site have this?". A site with no descriptions is a *site quality problem*. A site where Firecrawl returns 0 descriptions but Puppeteer returns 1.0 is an *extraction problem*. These need different warnings.
3. **Warning threshold calibration** — `LOW_DESCRIPTION_FILL` fires at `< 0.3`. Is that the right threshold? What about sites that genuinely have thin descriptions (B2B spec catalogs)? Should the threshold vary by `commerce.mode`?
4. **Graceful degradation contract** — Define what a "valid" audit result looks like when data is partially available. When should a score be reported vs. withheld? When should a dimension be marked `confidence: "low"` instead of scored?

---

## Problem 3: Scraper Path Inconsistency

### What happens

`handleAcquire()` in `server/acquire.js` (line 521) routes to either Firecrawl or Puppeteer depending on `FIRECRAWL_API_KEY`. The two paths produce different data shapes:

- **Firecrawl path**: LLM extraction, `description` from AI, no performance metrics, collapsed facets not expandable, `scraper: 'firecrawl'`
- **Puppeteer path**: DOM scraping, `description` from CSS selector match, full performance metrics, can interact with UI, `scraper: 'puppeteer'`

`computeDataQuality()` is called identically for both paths but the data quality characteristics are fundamentally different. A `descriptionFillRate: 0` from Firecrawl means something different from `descriptionFillRate: 0` from Puppeteer.

### What to research

1. **Path-aware quality expectations** — Should `computeDataQuality()` accept `scraper` as a parameter and adjust thresholds/expectations accordingly?
2. **Cross-path consistency** — For fields present in both paths, how consistent are the values? Run both scrapers on the same URLs and diff the outputs.
3. **Firecrawl-only gaps** — What data is structurally unavailable via Firecrawl (performance, network interception, expanded facets) vs. what's just unreliably extracted? Document the permanent gaps separately from the fixable extraction gaps.

---

## Known Warning Codes (for reference)

```
LOW_CARD_CONFIDENCE     — Puppeteer only; card selector < 40% confidence
MOBILE_RENDER_FAILED    — Mobile screenshot blank
FCP_ZERO                — First Contentful Paint = 0 (SPA timing bug)
ECOMMERCE_TRACKING_GAP  — GTM present, no productImpressions
NO_PRODUCTS_FOUND       — Zero cards detected
PERFORMANCE_UNAVAILABLE — Firecrawl path; FCP/LCP/CLS always null
FACETS_INCOMPLETE       — Firecrawl; < 4 facets (collapsed panels)
PDP_SAMPLES_BLOCKED     — All PDP scrapes failed
LOW_DESCRIPTION_FILL    — < 30% products have real descriptions
FIRECRAWL_FAILED        — Firecrawl threw at runtime; Puppeteer fallback used
```

---

## Eval Harness Spec

Build `test/data-quality-eval.js`. Requirements:

### Test corpus
A hardcoded set of 4–6 URLs with known characteristics:
- `https://www.zappos.com/running-shoes` — high-quality B2C, rich descriptions expected
- `https://www.fergusonhome.com/shower-faucets/c108511` — B2C, spec-string descriptions
- `https://www.insight.com/en_US/shop/category/laptops.html` — B2B, spec-heavy, no marketing copy
- `https://www.allbirds.com/collections/mens-running-shoes` — DTC, rich copy expected
- (add others as useful)

### What to measure per URL per run
For each product field: `title`, `price`, `description`, `rating`, `reviewCount`, `badges`, `url`
- **fill rate** — fraction of products with non-null value
- **quality tier** — for description: empty / spec-string / thin / real
- **variance** — run 3x, report stddev of fill rates

For extraction as a whole:
- **product count** — how many cards extracted vs. expected
- **facet count** — how many vs. known ground truth
- **scraper used** — firecrawl vs puppeteer

### Output format
```jsonl
{"url": "...", "run": 1, "scraper": "firecrawl", "productCount": 5, "descriptionFillRate": 1.0, "descriptionQualityDist": {"empty": 0, "spec": 3, "thin": 1, "real": 1}, "ratingFillRate": 0.4, "facetCount": 2, "timestamp": "..."}
```

One line per run. Aggregate across runs to show mean ± stddev.

### Success criteria
- No field should have > 0.3 stddev in fill rate across 3 runs on the same URL
- `descriptionFillRate` on Zappos should be > 0.8 in all runs
- `ratingFillRate` on Insight should be 0 (site genuinely has no ratings — verify this is correct)

---

## Design Doc Requirements

Address these questions:

1. **Extraction reliability** — What is the right contract between `EXTRACT_SCHEMA` and the Firecrawl API? How do you write schemas + prompts that minimize LLM variance? What patterns from structured output literature apply here?

2. **Data quality model** — Propose a revised `computeDataQuality()` signature that:
   - Accepts `scraper` as input
   - Returns graded tiers (not just fill rate)
   - Separates extraction confidence from site quality assessment
   - Tags dimensions with `confidence: 'high' | 'medium' | 'low' | 'unverifiable'`

3. **Warning calibration** — For each existing warning code, recommend: keep as-is / adjust threshold / split into two warnings (extraction fail vs. site gap) / deprecate

4. **Graceful degradation contract** — When should an acquire payload be considered "usable" vs. "degraded" vs. "failed"? What should the skill layer (the auditor agent) do differently in each state?

---

## How to Run the Existing Tests

```bash
cd C:\dev\merchGent
npm install
node test/protocol.js        # Protocol compliance — no browser or API key needed
node test/smoke.js --url https://www.zappos.com/running-shoes   # Needs FIRECRAWL_API_KEY or browser
```

Set `.env` (copy from `.env.example`) with at minimum `FIRECRAWL_API_KEY` for the Firecrawl path.

---

## API / Model Notes

The server is provider-agnostic for AI analysis (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` + `OPENAI_BASE_URL`). For local model research agents:

- Set `OPENAI_BASE_URL=http://your-server:port/v1` and `OPENAI_API_KEY=local`
- Set `MODEL_PROVIDER=openai` to force the OpenAI-compatible path
- Set `MODEL_NAME=your-local-model-name`

The Firecrawl API is external (`FIRECRAWL_API_KEY` required for extraction tests) — this is separate from the analysis model. Firecrawl does the scraping; the analysis model does audit scoring.

---

## Out of Scope

- Changes to the MCP protocol layer (`server/index.js`) — don't touch tool schemas
- Persona/roundtable analysis logic (`server/analyzer.js`) — out of scope for this research
- Plugin/SKILL.md changes — those live in a separate repo (`C:\dev\merch-auditor`)
- Breaking changes to the `acquire` tool output shape — additive fields only

---

## Deliverable Format

- `RESEARCH-FINDINGS.md` — design doc
- `test/data-quality-eval.js` — eval harness (runnable Node 18+ ES module)
- `SCHEMA-PROPOSALS.md` — 2–3 alternative schema + prompt designs with benchmark results from the eval harness

Drop all three in the repo root when done. Tag the commit `research/data-quality-layer`.

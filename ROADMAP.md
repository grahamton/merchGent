# merch-connector Roadmap

Issues are grouped by theme. Each has a short description, why it matters, and rough effort. Start any of these by dropping the issue number in chat.

---

## 🔬 Scraper Intelligence

### #1 — Category Contamination Detector
**What:** During scraping, compare each product's title/description against the page category. Flag products that clearly don't belong (e.g., a RAM stick on a laptop page, an accessory mixed into an apparel category).

**Why:** Contaminated categories directly hurt conversion — buyers can't trust the results. We caught this live on the Insight laptop page (Crucial RAM at $424.99 appearing in laptop results).

**How:** Heuristic keyword matching against the URL category + page title. Flag products whose titles contain none of the category's core nouns. Return as `contamination: { detected: true, suspects: [...] }` in scrape output.

**Effort:** Medium — scraper.js addition, ~50 lines

---

### #2 — Badge & Trust Signal Inventory
**What:** During scraping, extract per-product signals: star rating, review count, sale/discount badge, "Best Seller" / "Top Pick" badge, stock warning ("Only 3 left"), sustainability/certification label (Energy Star, EPEAT, etc.), and "New" badge.

**Why:** These signals drive purchase decisions. The Auditor and Floor Walker can't evaluate persuasion quality if they can't see the badge data. Right now they're guessing from product titles.

**How:** Add badge extraction loop in `extractPageData()` in scraper.js. Scan each product card for common badge patterns (CSS classes containing "badge", "label", "tag"; text matching "sale", "new", "best seller", etc.).

**Effort:** Medium — scraper.js addition, ~60 lines

---

### #3 — Sort Order Extractor
**What:** Detect what sort options are available on the page (Relevance, Price Low-High, Price High-Low, Rating, Newest, Best Seller, Popular, etc.) and what the current/default sort is.

**Why:** Sort order is one of the highest-leverage merchandising levers. Missing "Sort by Rating" on a page with reviews is a major gap. The Scout currently has to infer this from what they can't see — give them real data.

**How:** Look for `<select>` elements and common sort UI patterns (buttons with "sort" in class/aria, dropdowns near product counts). Extract options and selected value.

**Effort:** Small-Medium — scraper.js addition, ~40 lines

---

### #4 — Mobile Viewport Snapshot
**What:** Add an optional `mobile_screenshot: true` parameter to `scrape_page` that re-renders the page at 390×844 (iPhone 14 viewport) and returns a second screenshot.

**Why:** Mobile traffic is 60–70% of e-commerce. A page can look fine on desktop and be completely broken on mobile. This gives the Floor Walker something to react to beyond the desktop view.

**How:** Add a second Puppeteer pass with `setViewport({ width: 390, height: 844 })` before screenshot. Return alongside the desktop screenshot.

**Effort:** Small — scraper.js addition, ~20 lines

---

## 🧠 Analyzer Intelligence

### #5 — Price Bucket Validator
**What:** Analyze the price range of extracted products against any facet price buckets shown on the page. Flag buckets that are misaligned (e.g., a "Below $50" bucket on a page where the cheapest product is $499, indicating bad category mapping or data quality issues).

**Why:** We caught this live on Insight: "$50–$100" buckets on a laptop page. It's a signal of category contamination and broken search/facet configuration.

**How:** Add a `validatePriceBuckets(products, facets)` function in analyzer.js. Compare product price range to facet bucket ranges. Flag buckets that contain 0 products, or whose ranges don't overlap with actual product prices.

**Effort:** Small — analyzer.js addition, ~40 lines, no AI call needed

---

### #6 — B2B/B2C Conflict Scorer
**What:** Instead of the current binary `b2bIndicators / b2cIndicators` flags, produce a scored tension metric: how many B2B signals vs. B2C signals are present per product and across the page. Output a conflict score 0–100 and a mode recommendation.

**Why:** "Hybrid" sites are common but the current implementation just says "Hybrid" with no nuance. A site with 90% B2B signals and 10% consumer signals is very different from 50/50. The score makes this actionable.

**How:** Expand the indicator lists in scraper.js. Count signals per product and aggregate. Add `b2bConflictScore` to scrape output. Update the Auditor schema to surface this.

**Effort:** Medium — scraper.js + analyzer.js update, ~60 lines

---

### #7 — B2B Audit Mode
**What:** Add `"b2b"` as a new persona option on `audit_storefront`. Uses the `auditor-b2b.md` prompt (already written) which evaluates for procurement efficiency: SKU visibility, spec filtering, pricing transparency, login walls, steps-to-PO count.

**Why:** The current Auditor evaluates for B2C merchandising standards. B2B pages need completely different criteria — a page like Insight.com requires procurement-lens evaluation, not a consumer conversion framework.

**How:** Wire `auditor-b2b.md` into `callWithPersona()` in analyzer.js. Add `"b2b"` to the persona enum in index.js and the AUDITOR_SCHEMA variant. The prompt is already written.

**Effort:** Small — mostly wiring, ~30 lines + schema addition

---

## 🎭 Persona Improvements

### #8 — Persona Memory Integration
**What:** When a persona runs, inject relevant site memory into their context. If the site memory says "this site needs 5s wait for lazy load" or "brand filter is broken," the persona should know that before they evaluate.

**Why:** Right now personas see raw scraped data but not the institutional knowledge accumulated in site-memory. A Floor Walker analyzing a site the agent has visited 10 times should know "last time the filter panel didn't load until 4 seconds in."

**How:** In `buildPersonaContext()` in analyzer.js, load the site memory for the domain and append it as a "Site Notes" section in the context block.

**Effort:** Small — ~20 lines in analyzer.js

---

### #9 — Roundtable Streaming Output
**What:** Add an optional streaming mode to `merch_roundtable` that emits each persona's result as it completes, rather than waiting for all four (3 personas + moderator) to finish before returning.

**Why:** The roundtable takes 60–90 seconds with 4 sequential AI calls. Users currently see nothing until it's all done. Streaming each persona result as it arrives makes the experience dramatically more engaging and useful.

**How:** MCP supports streaming via `notifications/message`. Emit a progress notification after each persona completes. The final response is the full roundtable output as usual.

**Effort:** Medium-Hard — requires MCP notification plumbing, ~80 lines

---

## 🔌 Integrations

### #10 — LogRocket Session Link
**What:** Accept an optional `logrocket_session_url` parameter on `audit_storefront` and `ask_page`. Fetch the session replay data (clicks, errors, rage clicks, network requests) and include it in the AI analysis context.

**Why:** This was the original vision — pairing behavioral data (what users actually did) with page structure analysis (what the page looks like). LogRocket exposes session data via API; combining it with the scrape output gives the AI a much richer picture.

**How:** New `logrocket.js` module that authenticates and fetches session events. Append events as a "User Behavior" section in the analysis context.

**Effort:** Hard — requires LogRocket API integration, auth, and event parsing

---

### #11 — Coveo Boost/Bury Actions
**What:** Add a new tool `coveo_action` that takes the recommendations from an audit and translates them into Coveo Query Pipeline rules: boost products with strong trust signals, bury contaminated results, surface the recommended facets.

**Why:** The whole point of the merchandising agent ecosystem was that analysis leads to action. Right now we diagnose but don't prescribe implementation. A Coveo connector closes that loop.

**How:** New `server/coveo.js` module. Map audit recommendations to Coveo REST API calls (feature boost, ranking expressions, facet configuration). New MCP tool `coveo_action`.

**Effort:** Hard — requires Coveo org, API credentials, and recommendation-to-rule mapping logic

---

## 🧹 Tech Debt

### #12 — Fix `thinking` param on `askAnthropic`
**What:** The `askAnthropic` function in analyzer.js still has `thinking: { type: 'adaptive' }`. This works now because it doesn't use `tool_choice`, but it's inconsistent and will break if we ever add structured output to `ask_page`.

**Why:** Cleanup and consistency. We already removed it from the two tool_choice callers.

**How:** Remove `thinking: { type: 'adaptive' }` from `askAnthropic()` in analyzer.js.

**Effort:** Tiny — 1 line

---

### #13 — Validate `auditor-b2b.md` end-to-end
**What:** Wire up the B2B auditor prompt (already written) and run a full end-to-end test against the Insight.com laptop page that surfaced the contamination and pricing issues.

**Why:** The prompt is written but not wired into the MCP tools yet (that's issue #7). This issue is the verification pass.

**Effort:** Small — depends on #7 being done first

---

*Last updated: 2026-03-17. Issues authored during v1.2.0 development session.*

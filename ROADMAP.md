# merch-connector Roadmap

Issues are grouped by theme. Each has a short description, why it matters, and rough effort. Start any of these by dropping the issue number in chat.

---

## ✅ Completed

| # | Item | Shipped |
|---|------|---------|
| #5 | Price Bucket Validator | v1.2.0 |
| #7 | B2B Audit Mode (`b2b_auditor` persona) | v1.2.0 |
| #8 | Persona Memory Integration (site notes injected into all persona contexts) | v1.2.0 |
| #12 | Remove `thinking` param from `askAnthropic` | v1.3.0 |
| —  | OpenAI-compatible provider (LM Studio, Ollama, Groq, etc.) | v1.3.0 |
| —  | Page data cache (10-min TTL, shared across ask/audit/roundtable) | v1.4.0 |
| —  | Server-side timeout wrapper with actionable fallback message | v1.4.0 |
| —  | Unified session store (cookies + page cache in one domain Map) | v1.4.0 |
| #2 | Badge & Trust Signal Inventory (per-product: star rating, review count, sale badge, best seller, stock warning, sustainability, new) | v1.5.0 |
| #3 | Sort Order Extractor (`sortOptions` in scrape output: type, current sort, all available options) | v1.5.0 |
| #6 | B2B/B2C Conflict Scorer — `b2bConflictScore` (0–100) and `b2bMode` (B2B/B2C/Hybrid) as top-level scrape fields | v1.5.0 |
| #13 | B2B auditor validation — `--b2b` smoke flag targets Insight.com laptops with `b2b_auditor` persona | v1.5.0 |
| #4  | Mobile Viewport Snapshot — optional `mobile_screenshot: true` on `scrape_page` returns 390×844 JPEG | v1.5.0 |
| #16 | Multi-Step `interact_with_page` Flows — `actions` array executes search/click steps sequentially | v1.5.0 |
| #14 | Competitor Comparison Tool — `compare_storefronts` tool: product count delta, facet gaps, trust signal coverage, sort/B2B/perf diff | v1.5.0 |
| #15 | Change Detection — snapshot stored on every scrape, `changes` field returned on subsequent scrapes with new/removed products, price moves, facet/sort changes | v1.5.0 |
| #9  | Roundtable Streaming Output — each persona result emitted via `notifications/message` as it completes; progress bar still fires via `notifications/progress` | v1.5.0 |

---

## 🔬 Scraper Intelligence

### #1 — Category Contamination Detector
**What:** During scraping, compare each product's title/description against the page category. Flag products that clearly don't belong (e.g., a RAM stick on a laptop page).

**Why:** Contaminated categories directly hurt conversion. We caught this live on the Insight laptop page (Crucial RAM appearing in laptop results).

**How:** Heuristic keyword matching against the URL category + page title. Return as `contamination: { detected: true, suspects: [...] }` in scrape output.

**Effort:** Medium — scraper.js addition, ~50 lines

---

### #2 — Badge & Trust Signal Inventory
**What:** Extract per-product signals: star rating, review count, sale badge, "Best Seller", stock warning ("Only 3 left"), sustainability labels, "New" badge.

**Why:** These signals drive purchase decisions. Auditor and Floor Walker can't evaluate persuasion quality without seeing badge data.

**How:** Add badge extraction in `extractPageData()`. Scan product cards for badge CSS classes and known text patterns.

**Effort:** Medium — scraper.js addition, ~60 lines

---

### #3 — Sort Order Extractor
**What:** Detect available sort options and current/default sort (Relevance, Price, Rating, Best Seller, Newest, etc.).

**Why:** Sort order is one of the highest-leverage merchandising levers. The Scout currently has to infer it from what they can't see.

**How:** Look for `<select>` and sort UI patterns near product counts. Extract options and selected value.

**Effort:** Small-Medium — scraper.js addition, ~40 lines

---

### #4 — Mobile Viewport Snapshot
**What:** Optional `mobile_screenshot: true` on `scrape_page` — re-renders at 390×844 (iPhone 14) and returns a second screenshot.

**Why:** Mobile traffic is 60–70% of e-commerce. A page can look fine on desktop and be broken on mobile.

**How:** Second Puppeteer pass with `setViewport({ width: 390, height: 844 })`.

**Effort:** Small — scraper.js addition, ~20 lines

---

## 🧠 Analyzer Intelligence

### #6 — B2B/B2C Conflict Scorer (surface as explicit output field)
**What:** The conflict score is already calculated in `buildPersonaContext` but is only visible in the AI's context text. Promote it to a top-level field in scrape output: `b2bConflictScore: 0–100`, `b2bMode: "B2B" | "B2C" | "Hybrid"`.

**Why:** Callers and agents need a machine-readable signal, not just text. Makes it trivial to branch logic ("if conflictScore > 50, use b2b_auditor").

**How:** Move the calculation from the context builder into `scrapePage()` return value. Pass it through to Auditor schema.

**Effort:** Small — refactor + schema addition, ~30 lines

---

### #14 — Competitor Comparison Tool
**What:** New tool `compare_storefronts` that accepts two URLs, scrapes both (with cache), and returns a structured diff: facet gaps, product count delta, trust signal coverage, performance delta.

**Why:** Merchandisers don't think in absolutes — they think relative to competitors. "We have 3 facets, they have 9" is more actionable than any single-site audit.

**How:** Scrape both URLs (reuse cache), pass both datasets to a new analyzer function with a comparison prompt. New MCP tool entry.

**Effort:** Medium — new tool + analyzer function, ~80 lines

---

### #15 — Change Detection / Monitoring
**What:** Add a `watch` action to `site_memory` (or a new `monitor_storefront` tool) that stores a snapshot of scrape output and, on subsequent calls, diffs it against the stored version. Returns what changed: new products, removed facets, price movements, title changes.

**Why:** Competitive monitoring is a top use case. Right now there's no way to know what changed on a site between visits.

**How:** Serialize a normalized snapshot of products + facets into site memory on each scrape. On next call, diff and return delta.

**Effort:** Medium — site-memory.js extension + scraper.js normalization, ~70 lines

---

## 🎭 Persona Improvements

### #9 — Roundtable Streaming Output
**What:** Emit each persona's result as a progress notification as it completes, rather than waiting for all four to finish.

**Why:** Roundtable takes 60–90s with 4 sequential AI calls. Users currently see nothing until it's all done.

**How:** MCP `notifications/message` after each persona completes. Final response is still the full roundtable output.

**Effort:** Medium-Hard — MCP notification plumbing, ~80 lines

---

## 🔌 Integrations

### #10 — LogRocket Session Link
**What:** Optional `logrocket_session_url` parameter on `audit_storefront` and `ask_page`. Fetch session replay data (clicks, rage clicks, network errors) and include it in analysis context.

**Why:** Pairing behavioral data with page structure analysis was the original vision. Gives the AI real user evidence, not just inferred problems.

**How:** New `server/logrocket.js` module. Fetch + parse session events. Append as "User Behavior" section in context.

**Effort:** Hard — requires LogRocket API integration and event parsing

---

### #11 — Coveo Boost/Bury Actions
**What:** New tool `coveo_action` that translates audit recommendations into Coveo Query Pipeline rules: boost high-trust products, bury contaminated results, configure recommended facets.

**Why:** Analysis without action is a report. This closes the loop — diagnosis leads directly to a configuration change.

**How:** New `server/coveo.js`. Map audit output to Coveo REST API calls. New MCP tool.

**Effort:** Hard — requires Coveo org, API credentials, recommendation-to-rule mapping

---

## 🧹 Tech Debt

### #13 — Validate `b2b_auditor` end-to-end
**What:** Run a full audit against Insight.com laptop page using `persona: "b2b_auditor"` and verify the output matches the expected B2B evaluation criteria.

**Why:** The prompt is written and wired, but has never been verified against a real B2B page in a formal test run.

**Effort:** Small — test run + prompt tuning if needed

---

### #16 — Multi-Step `interact_with_page` Flows
**What:** Extend `interact_with_page` to accept an array of actions (search → filter → click → extract) rather than a single action. Execute them in sequence and return the final page state.

**Why:** Real user journeys are multi-step. Testing add-to-cart, login walls, or search + filter pipelines requires chained interactions.

**How:** Change `action` param to accept either a single object or an array. Loop through actions, return final extracted page.

**Effort:** Medium — index.js + scraper.js update, ~50 lines

---

*Last updated: 2026-03-19. Reflects v1.5.0 shipped state.*

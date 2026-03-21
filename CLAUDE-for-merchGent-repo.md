# merch-connector — Coding Agent Context

## What This Is

The MCP server powering the merch-auditor plugin. Published to npm as `merch-connector`, distributed via `npx merch-connector`. 13 tools, Puppeteer-based scraping, 5 analysis personas.

**Current version:** 1.9.1
**Runtime:** Node.js 18+
**Key files:** `analyzer.js`, `scraper.js`, `network-intel.js`, `site-memory.js`, `eval-store.js`, `index.js`

## Related Project

This MCP is consumed by **merch-auditor** — a Cowork plugin at `github.com/grahamton/merch-auditor`. When fixing a bug here, consider whether the plugin's command workflows or skill files also need updating. Plugin bugs are filed separately and owned by the plugin repo.

## Bug Queue

All bugs are tracked in Notion. **Before starting work, check the Bug Tracker for your assigned issue:**

🐛 **Bug Tracker:** https://www.notion.so/3bab2cc83bf84b9e8004e04e2503f09f

Bug statuses:
- **Open** — not started
- **In Progress** — actively being fixed
- **Fixed** — code shipped, awaiting verification
- **Verified** — confirmed working by plugin testing session

When you fix a bug: update status to **Fixed** in Notion and note the fix approach in the bug page.

## Current Bug Status (as of 2026-03-21)

| Bug | Status | Notes |
|-----|--------|-------|
| MCP-001 — audit_storefront timeout | ✅ Verified | Payload truncation to 20 products working |
| MCP-002 — Unknown Facet names | ✅ Fixed | "Go" buttons excluded from DOM facets. XHR still pending confidence bump. |
| MCP-003 — pageType wrong on PDPs | ✅ Verified | SKU heuristic working correctly |
| MCP-004 — FCP = 0 on category pages | ✅ Fixed | PerformanceObserver pre-nav capture restored in 1.9.1 |
| MCP-005 — Mobile screenshot blank | 🔄 In Progress | Modernized to iOS 17.5 UA. Pending insight.com verification. |
| MCP-009 — merch_roundtable timeout | ✅ Fixed | Persona calls now concurrent + increased timeout headroom |
| MCP-010 — compare_storefronts crash | ✅ Fixed | CSS.escape() applied to all dynamic selectors |
| MCP-011 — get_category_sample silent fail | ✅ Fixed | Non-HTTP/relative URLs now filtered out of sampling |
| MCP-012 — scrape_pdp price empty | ✅ Fixed | Improved regex for CTA-embedded pricing |

Full verification report and detailed reproduction steps:
📄 `bugs/2026-03-21-mcp-verification-handoff.md` in the Cowork testing workspace.

---

## Fixed in latest PR (Pre-Claude Review)

### MCP-009 — merch_roundtable timeout
Persona completions are now concurrent (`Promise.all`). Execution time reduced by ~60%. `ROUNDTABLE_TIMEOUT_MS` added to `index.js` (8m) to prevent protocol-level drops during moderator synthesis.

### MCP-002 — Facet "Go" buttons
DOM scraper now filters out `[type="submit"]` and elements with text "Go" from being treated as facet options.

### MCP-011 & MCP-012
Category sampling now ignores relative/null URLs. PDP price extraction regex enhanced to support flexible currency symbols and spacing in CTA buttons.

---

## Priority Bug Details (Remaining)

### MCP-005 — Mobile screenshot blank
UA modernized to iOS 17.5. If still blank on insight.com, next step is to investigate Onetrust/Cookie-consent blockage or mobile-specific redirects.

---

## Primary Test Site

**insight.com** — B2B/Hybrid IT products reseller. Use the LED monitors category for regression testing:

```
Category listing: https://www.insight.com/en_US/shop/category/monitors/store.html?q=*%3A*&instockOnly=false&searchType=category&category=hardware%2Fmonitors%2Fled_monitors&tabType=products

PDP (budget):  https://www.insight.com/en_US/shop/product/VA2247-MH/viewsonic/VA2247-MH/ViewSonic-VA2247MH-LED-monitor-Full-HD-1080p-22/
PDP (premium): https://www.insight.com/en_US/shop/product/DELL-P2425HE/dell/DELL-P2425HE/Dell-P2425HE-LED-monitor-Full-HD-1080p-24/
```

Note: `buy.html` category URLs (e.g. `/shop/category/monitors/buy.html`) render sub-category image tiles, not products. Always use `store.html?searchType=category` URLs for product listing tests.

## Notion Project Hub

| Database | URL |
|----------|-----|
| Merch Project Hub | https://www.notion.so/329dee0d562d818a95d7fd5759f0add4 |
| Bug Tracker | https://www.notion.so/3bab2cc83bf84b9e8004e04e2503f09f |
| Roadmap | https://www.notion.so/1c50e09eff6b463d95890a6b800e9c40 |
| Audit Archive | https://www.notion.so/ac5442bce2a54b70a2330a73a11254c5 |

# Changelog

## 1.2.0 (2026-03-17)

Complete rewrite. Replaced the original React + Express UI with a lean MCP server.

### Added
- 7 tools exposed via Model Context Protocol (stdio transport)
- Three expert personas: Floor Walker (shopper), Auditor (framework), Scout (competitive)
- Multi-persona roundtable with moderator synthesis
- Dual AI provider support (Anthropic Claude and Google Gemini)
- Persistent per-domain site memory with auto-learning
- Facet/filter extraction (2 strategies: stable selectors + sidebar heuristic)
- Pagination following (up to 5 pages, 8 common selector patterns)
- Performance timing extraction (FCP, LCP, resource count)
- Per-domain session cookie jar
- Stealth-mode headless browser via puppeteer-extra
- Smoke test suite with CLI flags
- npx support (`npx merch-connector`)

### Removed
- React UI (25+ components)
- Express API server
- Firebase integration
- Figma integration
- All frontend build tooling (Vite, TypeScript)

## 1.0.0

Initial React + Express application with Gemini-powered merchandising analysis.

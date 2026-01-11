# merchGent

> **A read-only merchandising diagnostic system for modern commerce.**

merchGent audits e-commerce experiences across content, UX, and customer intent—producing actionable insights for merchandising leaders navigating complex B2B, B2C, and hybrid storefronts.

---

## What It Does

merchGent deploys specialized AI agents to analyze your commerce site and deliver:

- **Hybrid Trap Detection** — Identifies conflicting B2B/B2C signals that confuse buyers
- **Knowledge Surface Analysis** — Assesses content quality, findability, and completeness
- **Trust-Traced Findings** — Every recommendation cites the specific signals used
- **Merch-Ready Reports** — Outputs designed for merchandising decisions, not abstract theory

**Read-only by design.** merchGent never modifies your site or executes transactions.

---

## Quick Start

### Prerequisites

- Node.js (v18+)
- An API key for AI inference ([Gemini](https://ai.google.dev/), [OpenAI](https://platform.openai.com/), etc.)

### Installation

```bash
git clone <repo-url>
cd merchGent
npm install
```

### Configuration

Create `.env.local` in the project root:

```env
VITE_GEMINI_API_KEY=your_api_key_here
```

### Running Locally

You'll need **two terminal windows**:

**Terminal 1** — Web Agent (scraping service):

```bash
npm run server
```

_Runs on `http://localhost:3000`_

**Terminal 2** — Client Agent (React UI):

```bash
npm run dev
```

_Runs on `http://localhost:5173`_

Open the URL, select an audit mode, enter a target site, and run your first diagnostic.

---

## Audit Modes

merchGent operates in distinct **audit modes**, each answering a specific merchandising question:

| Mode                        | Question                                        | Focus                                |
| --------------------------- | ----------------------------------------------- | ------------------------------------ |
| **Hybrid Experience Audit** | Is this site accidentally serving two masters?  | B2B/B2C signal conflicts, mixed CTAs |
| **Knowledge Surface Audit** | Can customers find and trust product knowledge? | Content quality, findability, gaps   |
| _Logged-In vs Logged-Out_   | Does account state hurt intent or conversion?   | Coming in Phase 3                    |
| _Merchandising Coherence_   | Do navigation, PDPs, and CTAs tell one story?   | Coming in Phase 3                    |
| _Agent Readiness Scan_      | Is this site ready for agent-led commerce?      | Coming in Phase 4                    |

---

## Architecture

merchGent is built as a **team of specialized agents**:

- **Client Agent** — Orchestrates audits and synthesizes findings
- **Web Agent** — Crawls and extracts surface-level signals (Playwright-based)
- **Merch Agent** — Analyzes intent, coherence, and merchandising logic
- **Data Agent** — Inspects account state and transaction readiness (future)

For full details, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Standards & Methodology

merchGent audits are grounded in industry-recognized frameworks:

- **Baymard Institute** — UX and interface best practices
- **Forrester Research** — B2B/B2C strategy and buyer behavior
- **CIPS** — Procurement and compliance standards
- **GS1** — Product data and identification standards

All claims and recommendations are cited and traceable.

---

## Documentation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design and agent definitions
- **[PROMPTS.md](docs/PROMPTS.md)** — AI prompt engineering for Merch Agent
- **[KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)** — Industry standards reference
- **[ROADMAP.md](docs/ROADMAP.md)** — Development phases and audit mode roadmap

**For AI coding assistants:** See **[AGENTS.md](AGENTS.md)** for contribution guidelines.

---

## License & Disclaimer

merchGent is a **diagnostic tool**. It observes and reports—humans make the final decisions.

This is alpha software. Use in production at your own risk.

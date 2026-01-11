# merchGent

> **A read-only merchandising diagnostic system for modern commerce.**

merchGent audits e-commerce experiences across content, UX, and customer intent—producing actionable insights for merchandising leaders navigating complex B2B, B2C, and hybrid storefronts.

---

## 🚀 Key Features (v2.0)

- **🕵️ Smart Structural Scout**: The Web Agent heuristically scans pages to detect product grids and cards, even on sites without standard markup.
- **⚖️ Anti-Gravity Governance**: Built-in rules and workflows (`/fixer`, `/ticketbrain`) that prevent scope creep and over-engineering.
- **🔍 Hybrid Trap Detection**: Identifies conflicting B2B/B2C signals that confuse buyers.
- **📊 merchGent Score**: A holistic measure of merchandising effectiveness (Intent, Knowledge, Transaction).
- **🛡️ Trust-Traced Findings**: Every recommendation cites the specific signals used.

**Read-only by design.** merchGent never modifies your site or executes transactions.

---

## Quick Start

### Prerequisites

- Node.js (v18+)
- An API key for AI inference ([Gemini](https://ai.google.dev/) recommended)

### Installation

```bash
git clone <repo-url>
cd merchGent
npm install
```

### Configuration

Create `.env` in the project root:

```env
VITE_GEMINI_API_KEY=your_api_key_here
```

### Running Locally

You can use the helper script to start everything at once:

- **Windows**: Double-click `restart_all.bat`

Or run manually in two terminals:

**Terminal 1** — Backend (Web Agent & API):

```bash
npm run server
```

_Runs on `http://localhost:3001`_

**Terminal 2** — Frontend (Agent Dashboard):

```bash
npm run dev
```

_Runs on `http://localhost:3000`_

Open `http://localhost:3000` to access the dashboard.

---

## 🧠 Anti-Gravity Governance

This project enforces strict discipline to prevent "Feature Factory" bloat.

### Core Rules

See [`docs/ANTIGRAVITY_RULES.md`](docs/ANTIGRAVITY_RULES.md).

1.  **Level 1 Only**: Solving problems at the lowest effective layer.
2.  **No Scope Creep**: One ticket, one goal.
3.  **Evidence First**: Prototypes before abstractions.
4.  **Guardrail Lead**: Safety checks before code.

### Workflow Personas

Use slash commands to invoke specific modes:

- `/fixer` - **Local Fixer**: Edits existing code in place.
- `/ticketbrain` - **Ticket Brain**: Breaks ideas into atomic tickets.
- `/spiker` - **The Spiker**: Builds quick prototypes.
- `/redteamer` - **Red-Teamer**: Stress-tests plans.
- `/stakeholder-review` - **Stakeholder Review**: Sanity-check from a customer perspective.

---

## Audit Modes

| Mode                        | Question                                        | Focus                                |
| --------------------------- | ----------------------------------------------- | ------------------------------------ |
| **Hybrid Experience Audit** | Is this site serving two masters?               | B2B/B2C signal conflicts, mixed CTAs |
| **Knowledge Surface Audit** | Can customers find and trust product knowledge? | Content quality, findability, gaps   |
| _Logged-In vs Logged-Out_   | Does account state hurt intent?                 | _Planned: Phase 3_                   |

---

## Architecture

merchGent is built as a **team of specialized agents**:

- **Client Agent** — Orchestrates audits and synthesizes findings
- **Web Agent** — Crawls and extracts signals using **Puppeteer Stealth** + **Dynamic Scout**.
- **Merch Agent** — Analyzes intent, coherence, and merchandising logic
- **Data Agent** — Inspects account state and transaction readiness

For full details, see **[docs/AGENT_RULES.md](docs/AGENT_RULES.md)** and **[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)**.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

> **Disclaimer**: merchGent is a diagnostic tool. It observes and reports—humans make the final decisions. Use in production at your own risk.

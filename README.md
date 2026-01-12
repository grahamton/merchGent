# merchGent

> **A read-only merchandising diagnostic system for modern commerce.**

merchGent audits e-commerce experiences across content, UX, and customer intent, producing actionable insights for merchandising leaders navigating complex B2B, B2C, and hybrid storefronts.

---

## 🚀 Key Features

### 1. Interactive Experience Walkthrough (Phase 0)

**Don't just scan; see.** The new Walkthrough mode allows you to "drive" the agent through a multi-step user journey (e.g., "Add to Cart", "Checkout flow").

- **State Persistence**: The agent maintains a "cookie jar," allowing it to stay logged in or keep cart state across steps.
- **Smart Snapshots**: At every step, the agent extracts:
  - **Visuals**: High-res screenshots.
  - **Data Layers**: Auto-detection of `dataLayer`, `digitalData`, `adobe`, etc.
  - **Interaction Map**: Auto-suggested "Next Actions" (clickable buttons/links).

### 2. The Merch Agent Persona

**The Guardian of Catalog Integrity.** The agent is no longer a generic AI assistant. It embodies a specific persona:

- **Role**: E-commerce Data Quality & Taxonomy Specialist.
- **Obsession**: Fill Rates, Attribute Gaps, and Facet Hygiene.
- **Voice**: "If a user can't filter by it, it doesn't exist."

### 3. Smart Findings Register

**Standardized Insights.** Issues are no longer random text; they are structured data (`Finding` objects) with:

- **Severity**: Critical, Warning, Info, Success.
- **Category**: Usability, Performance, Merch, Technical.
- **Auto-Scouts**: Built-in rules automatically detect "Missing Alt Text", "Broken Links", and "Mixed B2B/B2C Signals".

### 4. Hybrid Trap Detection

**Is your site serving two masters?** Identifies conflicting signals (e.g., "Request Quote" vs "Buy Now" proximity) that confuse buyers and hurt conversion.

---

## 🛠️ Quick Start

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

Create `.env` (or `.env.local`) in the project root:

```env
GEMINI_API_KEY=your_api_key_here
# Optional: override API base URL for the frontend
VITE_API_BASE_URL=http://localhost:3001
```

### Running Locally

Run backend and frontend concurrently:

```bash
# Windows
restart_all.bat

# Manual (Two Terminals)
npm run server   # http://localhost:3001
npm run dev      # http://localhost:3000
```

---

## 📊 Audit Modes

| Mode                        | Phase       | Focus                                                                              | Status        |
| :-------------------------- | :---------- | :--------------------------------------------------------------------------------- | :------------ |
| **Experience Walkthrough**  | **Phase 0** | **Journey Mapping**: Interactive recording of multi-step flows. State persistence. | ✅ **Active** |
| **Hybrid Experience Audit** | **Phase 1** | **Conflict Detection**: B2B vs B2C signal conflicts.                               | ✅ **Active** |
| **Knowledge Surface Audit** | **Phase 2** | **Content Quality**: Findability, completeness, and trust gaps.                    | ✅ **Active** |
| **Merch Coherence Audit**   | Planned     | **Consistency**: Category logic, product grouping.                                 | 🚧 Planned    |

---

## 🧠 Architecture

merchGent is built as a **team of specialized agents**:

1.  **Client Agent (Orchestrator)**: The Frontend UI. Manages the audit lifecycle and presents the "Findings" timeline.
2.  **Web Agent (The Body)**: A headless Chrome instance (Puppeteer) that:
    - Navigates pages securely.
    - Injects/Extracts cookies for persistence.
    - Runs "Scouts" (JavaScript heuristics) to find grids, cards, and data layers.
3.  **Merch Agent (The Brain)**: A Generative AI agent injected with the **Guardian Persona**. It:
    - Ingests the raw PageData and Findings.
    - Synthesizes a "Health Score" and "Strategy Report" based on strict merchandising rules.
4.  **Journey Manager (The Memory)**: A backend service that persists user journeys, managing the transition from Step 1 -> Step N.

---

## 🛡️ Anti-Gravity Governance

This project enforces strict discipline to prevent "Feature Factory" bloat.

### Core Rules

See [`docs/ANTIGRAVITY_RULES.md`](docs/ANTIGRAVITY_RULES.md).

1.  **Level 1 Only**: Solving problems at the lowest effective layer.
2.  **No Scope Creep**: One ticket, one goal.
3.  **Evidence First**: Prototypes before abstractions.

### Workflow Personas

Use slash commands to invoke specific modes:

- `/fixer`: **Local Fixer** (Edit code in place)
- `/ticketbrain`: **Ticket Brain** (Atomic planning)
- `/spiker`: **The Spiker** (Quick prototyping)
- `/stakeholder-review`: **The Roast** (Customer perspective check)

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

> **Disclaimer**: merchGent is a diagnostic tool. It observes and reports; humans make the final decisions. Use in production at your own risk.

# AGENTS.md

## Purpose

merchGent audits modern commerce experiences across:

- content and knowledge surfaces
- merchandising intent and coherence
- UX consistency across account states
- readiness for agent-led commerce

The system is explicitly **diagnostic-first**.

Primary output:
**clear, defensible findings and recommendations for merch leaders.**

---

## Architectural North Star

Every change must reinforce at least one:

1. **Diagnostic Integrity**
   Findings must be explainable, attributable, and reproducible.

2. **Merchandising Clarity**
   Outputs must map directly to merch decisions, not abstract UX theory.

3. **Scoped Execution**
   Each audit run activates only the agents required for that audit mode.

If a change increases ambiguity, feature sprawl, or agent overlap, it should not ship.

---

## System Model (Authoritative)

merchGent operates as a **Team of Agents**, coordinated per audit run.

| Agent        | Role                | Core Responsibility                      |
| ------------ | ------------------- | ---------------------------------------- |
| Client Agent | Orchestrator        | Audit planning, agent routing, synthesis |
| Web Agent    | Technical Inspector | Crawl, render, extract surface signals   |
| Merch Agent  | Merch Doctor        | UX, merchandising, intent analysis       |
| Data Agent   | Trust Inspector     | Transactional and account-state analysis |

Agents do not share internal state.
Only structured outputs cross boundaries.

---

## Agent Definitions

### Client Agent

**Role:** Audit Orchestrator
**Mental Model:** Lead diagnostician

Responsibilities:

- Accept audit request + selected audit mode(s)
- Determine which agents activate
- Enforce scope boundaries
- Synthesize final report

Forbidden:

- Direct crawling
- UX judgments
- Transaction inspection

Output:

- Unified audit report with agent-attributed findings

---

### Web Agent

**Role:** Surface Inspector
**Mental Model:** Instrumented examiner

Responsibilities:

- Public and authenticated crawling
- Screen-based rendering analysis
- Raw extraction of:
  - products
  - CTAs
  - navigation
  - content surfaces
  - B2B/B2C signals

Inputs:

- URLs
- Auth context (if provided)

Outputs:

- Structured PageData
- Surface maps (not opinions)

Forbidden:

- Recommendations
- Intent interpretation

---

### Merch Agent

**Role:** Merchandising Doctor
**Mental Model:** Synthetic shopper + merch strategist

Responsibilities:

- Customer intent detection (B2B, B2C, Hybrid)
- Hybrid Trap diagnosis
- Merchandising coherence analysis
- UX decision-friction detection
- Recommendation generation

Inputs:

- PageData
- Declared business intent (if provided)

Outputs:

- Findings
- Severity
- Merch-focused recommendations

Forbidden:

- Crawling
- Performance metrics
- Transaction validation

---

### Data Agent

**Role:** Trust & State Inspector
**Mental Model:** Account and transaction auditor

Responsibilities:

- Logged-in vs logged-out experience comparison
- Account-type UX divergence analysis
- Transaction readiness inspection (when enabled)
- Risk and readiness signaling

Outputs:

- Trust gaps
- State divergence findings
- Readiness assessments

Forbidden:

- Merchandising judgments
- Content critique

---

## Operating Constraints

- Read-only analysis only
- No content rewriting
- No SEO optimization
- No pricing recommendations
- No auto-fixes

merchGent diagnoses. Humans decide.

# merchGent Strategic Audit Knowledge Base

## Overview of merchGent

**merchGent** is a read-only merchandising diagnostic system for modern commerce. It uses a team of specialized AI agents to audit an online commerce site’s content, user experience, and alignment with customer intent. The goal is actionable insights for merchandising leaders managing **B2B**, **B2C**, or **hybrid** storefronts.

**Read-only by design:** merchGent never modifies the target site, submits forms, or executes transactions.

### What merchGent Delivers

- **Hybrid Trap Detection:** Identifies conflicting B2B/B2C signals that confuse buyers
- **Knowledge Surface Analysis:** Assesses content quality, findability, and completeness
- **Trust-Traced Findings:** Every recommendation cites the specific signals used
- **Merch-Ready Reports:** Outputs designed for merchandising decisions, not abstract theory

### Design Philosophy

- **Audit modes, not features:** Users choose a mode. The system runs the appropriate checks.
- **Restraint everywhere else:** The UI and outputs are intentionally surgical. No noisy control panels.
- **Trust trace required:** Findings must be evidence-backed and reviewable.

---

## Audit Modes and Strategy

merchGent organizes analysis into **Audit Modes**, each representing a cohesive diagnostic lens. Modes are intentionally limited to protect clarity and ensure consistent outputs.

### Current and Planned Modes

- **Hybrid Experience Audit (Phase 1 – Active):** Detects B2B/B2C conflict and “Hybrid Traps.”
- **Knowledge Surface Audit (Phase 2 – Coming Soon):** Audits content quality, completeness, and findability.
  - **Activation milestone:** Becomes Active after successful beta testing on representative sites and finalization of content quality rules in the Governance Ingestion Engine.
- **Merchandising Coherence Audit (Planned):** Evaluates coherence and alignment across merchandising signals (taxonomy, cross-sell logic, promotions, consistency).
  - **Activation milestone:** Becomes Active after internal review of diagnostic criteria, calibration against real audits, and validation of recommendation templates and thresholds.

---

## Hybrid Experience Audit (Phase 1 – Active)

### Goal

Identify whether the target site falls into a **Hybrid Trap** by sending mixed signals meant for both B2B and B2C audiences. Hybrid traps occur when a site tries to serve two different buyer types with one blended, compromised experience.

### The Hybrid Trap: “Serving Two Masters”

A Hybrid Trap is flagged when the experience presents conflicting workflows or cues, such as:

- Consumer checkout patterns adjacent to quote or procurement flows
- Retail-style merchandising mixed with business procurement requirements
- Content that alternates between lifestyle persuasion and spec-driven enablement without clear segmentation

### Signal Model: B2B vs B2C

The Hybrid Experience Audit uses a **signal model**: agents detect evidence of B2B and B2C intent, then evaluate whether the mix creates friction or ambiguity.

#### Common B2B Signals

- Quote or bulk-order flows (request quote, tiered price tables, order pads)
- Account-based pricing (login to see price, negotiated pricing)
- Procurement support (PO number fields, invoicing language, payment terms, tax-exempt cues)
- Spec-dense content (technical sheets, compliance docs, part numbers prominent)
- Efficiency-first UX (known-item search prominence, reorder tools, low marketing overhead)

#### Common B2C Signals

- Instant checkout patterns (add to cart prominence, guest checkout flows)
- Lifestyle persuasion (aspirational imagery, emotional brand storytelling)
- Social proof (ratings, reviews, “trending” modules)
- Promotion mechanics (coupon prompts, free-shipping thresholds, flash-sale banners)
- Discovery-first UX (heavy browsing funnels, “you may also like,” curated collections)

### Diagnosis Output

The report produces a clear status, e.g.:

- **DANGEROUS HYBRID DETECTED**: significant conflicting signals present
- **B2B-OPTIMIZED** or **B2C-OPTIMIZED**: signals are coherent and aligned

Diagnosis is always paired with a Trust Trace and evidence-backed recommendations.

### Standards Check: Unified Criteria

The Hybrid Experience Audit includes a compact standards check using internalized best-practice criteria (no proprietary framework names required):

- **Intent alignment:** UX patterns match buyer intent (efficient known-item flows for B2B, discovery support for B2C)
- **Procurement readiness:** expected business purchasing affordances exist when the site signals B2B intent
- **Product data structure:** attributes are expressed as structured fields (filterable, comparable, consistent) rather than buried in prose

### Actionable Recommendations (Strict Constraint)

The final section lists the top recommended actions to take. We are **strictly constrained to a maximum of three key recommendations** to maintain the framework’s emphasis on clarity and focus and to avoid overwhelming the Merch Leader.

Each recommendation must include:

- The observed signal(s)
- The user-impact rationale
- The suggested remediation direction
- The agent that flagged it

---

## Knowledge Surface Audit (Phase 2 – Coming Soon)

### Goal

Assess whether the site’s content and information architecture provide purchase readiness and decision enablement for the intended buyer.

### What It Evaluates

- **Content completeness:** product descriptions, specs, images, policies, FAQs, support content
- **Findability:** search quality, navigation clarity, filters/facets coverage, internal linking
- **Knowledge gaps:** missing buyer-critical information that causes abandonment or escalations

### Output

- Diagnosis (e.g., **CONTENT GAPS DETECTED** vs **KNOWLEDGE SURFACE HEALTHY**)
- Standards check focused on content and findability
- Up to three recommendations, each trust-traced to observed gaps

### Activation Milestone

Becomes Active after:

- Beta validation on varied storefront types (B2B, B2C, hybrid)
- Finalized governance rules for content quality scoring and evidence capture

---

## Merchandising Coherence Audit (Planned)

### Goal

Evaluate whether merchandising signals across the site reinforce one coherent strategy rather than competing narratives.

### What It Evaluates

- **Taxonomy coherence:** category structure matches shopper mental models and catalog reality
- **Merchandising logic coherence:** cross-sells, upsells, and recommendations are relevant and consistent
- **Promotion coherence:** promotional placement aligns with priority products, inventory, and buyer intent
- **Messaging coherence:** value proposition and tone remain consistent from entry to PDP to checkout

### Output

- Diagnosis (e.g., **COHERENCE ISSUES DETECTED** vs **STRATEGY COHERENT**)
- Standards check focused on internal consistency and intent alignment
- Up to three recommendations, evidence-backed

### Activation Milestone

Becomes Active after:

- Internal review and approval of coherence criteria
- Calibration using real audits (reduce false positives)
- Validation of recommendation templates and thresholds

---

## Governance and System Architecture

These components are system-level controls. They enforce rules and maintain the “source of truth.” They are not agents.

### Governance Ingestion Engine

Purpose: maintain authoritative, updateable audit guidance and scoring rules used by agents.

Responsibilities:

- Ingest and version knowledge modules (modes, criteria, thresholds, templates)
- Maintain mappings between audit areas and internal rule sets
- Enable controlled updates without changing core agent behavior

### Agent Boundary Controller

Purpose: enforce operational limits and safety constraints.

Responsibilities:

- Enforce read-only behavior (no form submissions, no transactions)
- Restrict crawling scope (public only vs authenticated, when enabled later)
- Limit sampling (page caps, product caps) to control load and prevent drift
- Constrain outputs (analysis only, max recommendations, required trust trace)

### Signal Processor (Operational Telemetry)

Purpose: provide a transparent audit trail of what the system observed.

Responsibilities:

- Log key inputs (URL, page titles, viewport width, sampled pages)
- Maintain signal counts (B2B vs B2C)
- Record extracted evidence snippets used in Trust Trace

---

## Agent Roles and Orchestrator Back-End

### Agent M – The Strategist

Responsibilities:

- Interpret the selected Audit Mode and enforce its scope
- Orchestrate other agents and sampling plans
- Synthesize signals into diagnosis, standards check, and recommendations
- Ensure every conclusion is trust-traced and evidence-backed
- Enforce the max-three recommendation constraint

### Web Agent – The Data Collector

Responsibilities:

- Load and extract data from publicly accessible pages (Phase 1)
- Follow targeted retrieval instructions (representative sampling, not full crawls)
- Capture UI text, button labels, navigation structures, and visible commerce flows
- Never submit forms, never transact, never modify state

### Data Agent – The Analyzer

Responsibilities:

- Analyze extracted data for patterns, gaps, and inconsistencies
- Quantify signals and compare against thresholds
- Detect structured vs unstructured product data patterns
- Support evidence capture for Trust Trace (what, where, why it matters)

---

## Strategy Report Format (Required)

Every audit output uses the same structure.

### 1) Trust Trace (The Why)

A reviewable, human-readable log of:

- What was sampled
- What signals were detected
- Which criteria were applied
- Why the diagnosis follows from the evidence

### 2) Diagnosis (The What)

A single clear status aligned to the audit mode.

### 3) Standards Check (The Authority)

A compact grid of internal best-practice criteria with pass/fail or scored outcomes.

### 4) Actionable Recommendations (The Next Steps)

- **Maximum 3 recommendations**
- Each tied to explicit evidence and named agent source
- Written for merchandising leadership decision-making

---

## Summary Analogy

Think of the system like a restaurant workflow:

- The front-end is the menu: the Merch Leader chooses a dish (Audit Mode), not ingredients (features).
- In the back-end kitchen:
  - Agent M acts as the **Head Chef**, coordinating the work.
  - The Web Agent and Data Agent act as **Line Cooks**, gathering and preparing ingredients (site evidence).
  - Governance components act as the **Health Inspector**, enforcing boundaries and preventing unsafe inputs.
- The output is the plated dish: a clean Strategy Report with trust-traced evidence and a strict limit on recommendations.

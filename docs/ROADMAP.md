# PROJECT PLAN (v1)

## Core Strategy

**Audit Modes, not features.**

Each audit mode:

- activates a defined subset of agents
- produces a constrained output
- answers a specific merch question

This prevents feature sprawl and keeps audits explainable.

---

## Audit Modes (v1)

### 1. Knowledge Surface Audit

**Question:** Can customers and agents actually find, trust, and understand product knowledge?
**Activated Agents:** Web Agent, Merch Agent
**Inputs:** Public pages, Auth pages (optional), PDFs, videos, KB exports
**Outputs:** Knowledge coverage map, Staleness/drift signals, Retrieval gaps
**Primary Reader:** Merch leader, Content owner

### 2. Hybrid Experience Audit (Current Focus)

**Question:** Is this site accidentally serving two masters?
**Activated Agents:** Web Agent, Merch Agent
**Focus:** B2B vs B2C signal conflicts, Mixed CTAs, Pricing visibility ambiguity
**Outputs:** Hybrid Trap detection, Risk severity, Clear alignment recommendations
**Primary Reader:** Merch leader, Ecommerce leadership

### 3. Logged-In vs Logged-Out Audit

**Question:** Does account state change the experience in ways that hurt intent or conversion?
**Activated Agents:** Web Agent, Data Agent, Merch Agent
**Focus:** Content visibility, Navigation shifts, CTA changes
**Outputs:** State divergence map, UX risk flags
**Primary Reader:** Merch leader, UX / platform partner

### 4. Merchandising Coherence Audit

**Question:** Do navigation, PDPs, and CTAs tell a single, consistent story?
**Activated Agents:** Web Agent, Merch Agent
**Focus:** Category logic, Product grouping, CTA consistency
**Outputs:** Coherence map, High-friction zones
**Primary Reader:** Merch leader

### 5. Agent Readiness Scan (Optional)

**Question:** Is this experience structurally ready for agent-led commerce?
**Activated Agents:** Data Agent, Merch Agent
**Focus:** Transaction clarity, Intent signaling
**Outputs:** Readiness signals, Missing capabilities
**Primary Reader:** Merch leader, Strategy

---

## v1 Build Phases

### Phase 1: Foundation (In Progress)

- [x] PageData schema
- [x] Agent boundaries enforced (Audit Mode selection logic & Governance checks)
- [x] One audit mode end-to-end (Hybrid Experience)
- [ ] Responsive layout (needs mobile testing)
- [x] End-to-end test with real site (Verified with example.com)

### Phase 2: Expansion

- [x] Add Knowledge Surface Audit (Active)
- [ ] Hosting: Firebase Hosting (frontend) + Cloud Run (backend)
- [ ] File ingestion support
- [ ] Auth/Cookie Injection (High Priority - "Access First")
- [ ] Dev Tools Network Helper (Copy as Node.js fetch)

### Phase 3: Depth

- Logged-in vs logged-out comparisons
- State divergence reporting

### Phase 4: Enterprise Scale

- **Advanced Crawling**: WAF evasion, residential proxies, and unblocking infra
- Agent Readiness Scan

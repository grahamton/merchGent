# Persona Architecture v2 — Design Document

> Status: Research complete. Implementation not started.
> Branch: main (docs only — no code changes)

---

## 1. Current State Analysis

### Persona schemas (quick reference)

| Persona | Key fields | Schema constant |
|---|---|---|
| Floor Walker | `firstImpression`, `scan`, `hunt`, `gutTrust`, `topConcern`, `summary` | `FLOOR_WALKER_SCHEMA` |
| Auditor | `siteMode`, `matrix` (trust/guidance/persuasion/friction), `standardsChecks[]`, `topConcern`, `dataPoint`, `summary` | `AUDITOR_SCHEMA` |
| Scout | `categoryFitness`, `assortmentStrategy`, `discoveryTools`, `competitiveGaps`, `strategicRead`, `topConcern`, `summary` | `SCOUT_SCHEMA` |
| B2B Auditor | `matrix` (same 4D + `b2bImpact`), `procurementFrictionScore`, `selfServeViability`, `topConcern`, `summary` | `B2B_AUDITOR_SCHEMA` |
| Default Analyst | `trustTrace`, `siteMode`, `diagnosisTitle`, `diagnosisDescription`, `hybridTrapCheck`, `auditMatrix`, `standardsCheck[]`, `recommendations[]` | `AUDIT_SCHEMA` |
| Moderator | `consensus`, `disagreements[]`, `finalRecommendations[]` | `ROUNDTABLE_SCHEMA` |

### Overlap map

| Signal / Concern | Floor Walker | Auditor | Scout | B2B Auditor | Default |
|---|---|---|---|---|---|
| siteMode classification | implicit | explicit | implicit | implicit | explicit |
| Trust signals | `gutTrust` (felt) | `matrix.trust` (measured) | — | `matrix.trust` (procurement) | `auditMatrix.trust` |
| Guidance / navigation | `hunt` (experiential) | `matrix.guidance` (measured) | `discoveryTools` (competitive) | `matrix.guidance` (proc. eff.) | `auditMatrix.guidance` |
| Persuasion / social proof | `gutTrust` (partially) | `matrix.persuasion` (measured) | — | `matrix.persuasion` (justification) | `auditMatrix.persuasion` |
| Friction / barriers | `hunt` + `topConcern` | `matrix.friction` (measured) | — | `matrix.friction` (proc. barriers) | `auditMatrix.friction` |
| Competitive benchmarking | — | — | `categoryFitness` + `competitiveGaps` | — | — |
| Procurement metrics | — | — | — | `procurementFrictionScore` + `selfServeViability` | — |

### Redundancy findings

**Auditor vs. B2B Auditor** — ~70% structural overlap (identical 4-dimension matrix). The B2B Auditor adds `b2bImpact` per dimension, replaces `standardsChecks[]` with a numeric `procurementFrictionScore` and `selfServeViability` verdict. Despite the structural overlap, the semantic framing is different enough to justify keeping both — the B2B Auditor prompt hardwires procurement-buyer context that changes what the model notices.

**Floor Walker vs. Auditor on trust** — both evaluate trust, but Floor Walker observes *felt* trust (emotional reaction) while Auditor *measures* trust (title conformance, image consistency, description fill rate). Complementary, not redundant. The occasional matching `topConcern` is the intended convergence signal, not a bug.

**Auditor `matrix.guidance` vs. Scout `discoveryTools`** — Auditor says "there are 3 facets." Scout says "electronics B2B pages need 6 facets minimum and you have 3." Same raw observation, divergent interpretation — genuinely different value.

### Unique contribution per persona (what no other persona covers)

| Persona | Irreplaceable output |
|---|---|
| Floor Walker | Emotional narrative. The specific exit trigger — the moment a shopper leaves. Unmeasurable by Auditor or Scout. |
| Auditor | Evidence density: percentages, ratios, named product citations. Repeatable, defensible standards compliance. |
| Scout | Category norm comparison. Competitive gap severity (P0/P1/P2). Strategic positioning read. |
| B2B Auditor | Steps-to-PO friction score. Self-serve viability verdict. Procurement-impact framing per dimension. |
| Default Analyst | Only persona producing structured `recommendations[]`. Only one with explicit `hybridTrapCheck`. |

---

## 2. PageFingerprint Spec

### Design decision: no AI call

The fingerprint is computed **entirely from scrape data** via deterministic heuristics. `scrapePage` already returns `b2bMode`, `b2bConflictScore`, `facets[]`, `sortOptions`, `products[].trustSignals`, `networkIntel.platforms`, `performance`, `structure`, `interactables`. An AI call for pre-scan would add 3–5s with negligible quality gain.

### Full schema

```javascript
const PAGE_FINGERPRINT = {
  // Derived from URL structure + product count + facet presence
  // plp: multiple products + facets
  // pdp: single product, no facets
  // search_results: URL contains ?q= or /search/
  // category: breadcrumb pattern
  // cart: URL contains /cart or /basket
  // home: root URL, no products
  pageType: 'plp' | 'pdp' | 'search_results' | 'category' | 'cart' | 'home' | 'unknown',

  // From networkIntel.platforms[0] — already extracted by network-intel.js
  platform: string | null,

  // From scrape: b2bMode + b2bConflictScore (already computed by computeB2BSignals)
  commerceMode: {
    mode: 'B2B' | 'B2C' | 'Hybrid',
    conflictScore: number,  // 0–100
  },

  // Derived from products[].price and products[].cta patterns
  // public:          >80% products have visible prices
  // login_required:  most prices null + login interactable detected
  // quote_only:      >50% CTAs are "request quote" / "get pricing"
  // mixed:           some public, some hidden
  priceTransparency: 'public' | 'login_required' | 'quote_only' | 'mixed',

  // Aggregated from products[].trustSignals across all sampled products
  trustSignalInventory: {
    ratingsPresent: boolean,
    reviewCountPresent: boolean,
    saleBadgesPresent: boolean,
    bestSellerPresent: boolean,
    stockWarningsPresent: boolean,
    sustainabilityPresent: boolean,
    totalSignalTypes: number,  // 0–6 distinct types present
  },

  // Derived from facets[] + sortOptions + interactables
  discoveryQuality: {
    facetCount: number,
    sortOptionCount: number,
    hasSearch: boolean,
    facetNames: string[],  // for persona prompt context
  },

  // 3-point rating of page's conversion readiness
  // ready:   prices public + ≥2 trust signal types + >50% products have CTA
  // partial: one signal missing
  // weak:    two or more missing
  funnelReadiness: 'ready' | 'partial' | 'weak',

  // Up to 4 pre-identified structural risks derivable without AI.
  // Ready to embed directly in persona prompts as known baseline.
  // Examples:
  //   "Pricing not publicly visible"
  //   "Zero social proof — no ratings or reviews on any product"
  //   "B2B/B2C signal conflict at 73/100"
  //   "FCP 4,200ms — exceeds 3s threshold"
  //   "No filters detected — discovery fully unguided"
  //   "Description fill rate below 30%"
  topRisks: string[],  // max 4, ordered by severity

  // Persona selection recommendation based on fingerprint signals
  // B2B page → b2b_auditor first
  // Weak trust/data → auditor
  // UX friction dominant → floor_walker
  // Competitive signals → scout
  recommendedPersonas: ('floor_walker' | 'auditor' | 'scout' | 'b2b_auditor')[],
};
```

### Computation logic

| Field | Source |
|---|---|
| `pageType` | URL pattern (`/search`, `?q=`, `/cart`), product count (>3 = PLP, 1 = PDP), facet count (>0 = PLP/category) |
| `platform` | `pageData.networkIntel?.platforms?.[0]` |
| `commerceMode` | `{ mode: pageData.b2bMode, conflictScore: pageData.b2bConflictScore }` |
| `priceTransparency` | Scan `products[].price` for nulls; scan `products[].cta` for quote patterns |
| `trustSignalInventory` | Aggregate `products[].trustSignals` across all products |
| `discoveryQuality` | `facets.length`, `sortOptions?.options?.length`, search input in `interactables` |
| `funnelReadiness` | Score 0–3 (price visible +1, ≥2 trust types +1, >50% CTAs present +1) → ready/partial/weak |
| `topRisks` | Deterministic checklist against thresholds; pick top 4 by severity |
| `recommendedPersonas` | Decision tree: B2B mode → b2b_auditor; weak trust → auditor; thin data → floor_walker; competitive keywords in facets → scout |

---

## 3. Unified Base Schema

### Design goal

A common base shape that all personas extend — enabling the moderator, eval system, and cross-persona reasoning to consume findings uniformly without persona-specific parsing. Each persona retains its unique fields on top of the base.

### Base shape

```javascript
// All persona schemas extend this base
const BASE_PERSONA_OUTPUT = {
  personaId: 'floor_walker' | 'auditor' | 'scout' | 'b2b_auditor' | 'conversion_architect',
  topConcern: string,     // one sentence, highest-confidence actionable issue
  severity: 'critical' | 'major' | 'minor',  // severity of topConcern
  findings: Finding[],    // structured findings (see below)
  uniqueInsight: string,  // what ONLY this persona can see
  summary: string,
  score: number,          // 0–100 health score from this persona's lens
};

const FINDING = {
  dimension: string,       // trust | guidance | persuasion | friction |
                           // competitive | procurement | ux | assortment
  status: 'pass' | 'fail' | 'check',
  observation: string,     // specific evidence with product names / counts
  impact: 'high' | 'medium' | 'low',
};
```

### Severity classification

| Level | Definition | Examples |
|---|---|---|
| `critical` | Revenue-blocking: users cannot complete purchase | No prices visible, no CTAs, 3s+ load |
| `major` | Measurable conversion impact | Missing social proof, poor filter UX, confusing navigation |
| `minor` | Polish / improvement opportunity | Inconsistent badge use, minor description gaps |

### Current schema → base mapping

**Floor Walker**: `firstImpression` + `scan` → `uniqueInsight` + `findings[]` (dimensions: ux, trust, guidance). Keep `exitTrigger` as persona-specific extension.

**Auditor**: `matrix.*` → `findings[]` (dimensions from existing 4). Keep `siteMode`, `dataPoint` as persona-specific extensions.

**Scout**: `categoryFitness` + `competitiveGaps` → `findings[]` (dimension: competitive). Keep `assortmentStrategy`, `strategicRead` as persona-specific narratives.

**B2B Auditor**: `matrix.*` → `findings[]` with `b2bImpact` preserved in `observation`. Keep `procurementFrictionScore`, `selfServeViability` as persona-specific extensions.

### Impact on eval-store.js

None. `topConcern` is preserved in all schemas. Convergence scoring reads only `topConcern` + `diagnosisTitle`. The new `score` field (0–100 per persona) enables richer eval metrics in a future iteration — mean score across personas, score trend over time per domain.

---

## 4. New Roundtable Flow

### Current flow problems

1. Moderator fires async — detached from the tool return. MCP clients without notification handling miss it entirely. It is not in the tool response.
2. Each persona re-interprets the same raw scrape data independently — redundant reasoning, higher token counts.
3. No persona selection — B2B pages still run Floor Walker and Scout even when B2B Auditor is the right fit.

### Proposed v2 flow

```
Step 1: Pre-scan   (~0ms, pure heuristics)
  computePageFingerprint(pageData) → PageFingerprint
  No AI call. Reads existing scrape output.

Step 2: Persona selection   (~0ms, deterministic)
  fingerprint.recommendedPersonas → [floor_walker, auditor, scout] or subset
  (Only when smart_select: true on the tool call; defaults to all three)

Step 3: Focused personas   (~8-12s, parallel, unchanged)
  All selected personas run simultaneously via Promise.all.
  Each persona prompt is prepended with the PageFingerprint block:
    "Known baseline — skip re-detecting these:
     pageType=plp, platform=shopify, commerceMode=B2C,
     funnelReadiness=partial
     topRisks: [No ratings, FCP 4200ms]
     Focus on what ONLY your lens reveals beyond this baseline."
  Effect: personas skip re-deriving known facts, focus on unique interpretation.

Step 4: Synchronous moderator   (~8-10s, sequential after Step 3)
  await callWithPersona(moderatorPrompt, ...) — no longer detached
  result.debate populated before tool returns
  moderatorPending removed from return shape
  Complete, self-contained result in one tool response.
```

### Timing comparison

| | v1 | v2 |
|---|---|---|
| Pre-scan | — | ~0ms |
| Personas (parallel) | ~12-18s | ~8-12s (focused prompts) |
| Moderator | async, detached | ~8-10s synchronous |
| **Total wall clock** | ~12-18s + notification | ~16-22s complete |
| **Completeness** | Partial (no debate in return) | Full synthesis in response |

The v2 flow adds ~4s wall clock in exchange for result completeness. The right trade.

### Why synchronous moderator is safe

`ROUNDTABLE_TIMEOUT_MS` defaults to `TOOL_TIMEOUT_MS * 4 = 480s`. At 22s total, the synchronous roundtable is well within timeout. The async moderator was a design choice for speed, not a timeout requirement. With focused personas cutting persona time, adding the synchronous moderator back is net neutral on user-visible latency while massively improving result reliability.

### Progress notification shape (unchanged)

Each persona still emits `notifications/progress` as it resolves during the parallel phase. Clients with notification support get streaming feedback exactly as today. The only change is at the end: `await` instead of `.then()` on the moderator call.

---

## 5. Recommended New Persona: Conversion Architect

### The gap

None of the four personas reason about **funnel stage**. The Floor Walker reacts emotionally. The Auditor measures compliance. The Scout benchmarks competitively. None of them asks: "does this page successfully move a shopper from browsing to buying?"

### Why Conversion Architect over other candidates

| Candidate | Verdict |
|---|---|
| Accessibility reviewer | Valuable but outside merchandising scope; WCAG compliance is a different discipline |
| Mobile-first reviewer | Heavily overlaps with Floor Walker (UX) and Auditor (performance); mobile reasoning belongs in fingerprint + existing personas |
| SEO/discoverability | Zero overlap with existing personas but easily covered by `ask_page` with a targeted question; doesn't need a full persona |
| **Conversion Architect** | **Zero overlap with existing personas. Covers funnel-stage reasoning that no other persona touches.** |

### What only the Conversion Architect sees

| Finding | Covered by existing? | Conversion Architect adds |
|---|---|---|
| Social proof density | Auditor measures, Floor Walker feels | Whether it appears at the right decision *stage* |
| CTA clarity | Auditor and B2B Auditor measure friction | Whether CTAs match the buyer's readiness state |
| Description depth | Auditor measures fill rate | Whether descriptions answer consideration-stage questions |
| Price anchoring | None | Whether MSRP/sale/bundle context accelerates decision |
| Exit signals | Floor Walker finds the exit trigger | The structural pattern causing exits across product types |
| Page sequencing | None | Whether the eye is led from discovery → comparison → action |

### Schema

```javascript
const CONVERSION_ARCHITECT_SCHEMA = {
  type: 'object',
  required: ['funnelGrade', 'awarenessSignals', 'considerationGaps', 'decisionBarriers', 'topConcern', 'severity', 'score', 'summary'],
  properties: {
    funnelGrade:         { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
    awarenessSignals:    { type: 'string' },  // what engages and holds attention
    considerationGaps:   { type: 'string' },  // missing when shoppers compare options
    decisionBarriers:    { type: 'string' },  // what stops the final add-to-cart action
    topConcern:          { type: 'string' },
    severity:            { type: 'string', enum: ['critical', 'major', 'minor'] },
    score:               { type: 'number' },  // 0–100 conversion fitness
    summary:             { type: 'string' },
  },
};
```

### Prompt framing

> You are a conversion rate optimization specialist. You read e-commerce pages not as a shopper and not as an auditor — you read them as a funnel architect. Your job is to trace the path from first glance to purchase action and identify exactly where shoppers leak out of the funnel. You think in terms of awareness → consideration → decision, and you diagnose at which stage this page fails and why.

### Integration

- Registered as a valid `persona` enum value in `audit_storefront`
- Available as an optional fourth persona in `merch_roundtable` when `smart_select: true` and `fingerprint.funnelReadiness !== 'ready'`
- Added to `save_eval` persona cache checks

---

## 6. Migration Path

All six phases are non-breaking. Each phase ships independently.

### Phase 1 — Add PageFingerprint (additive only)
- Add `computePageFingerprint(pageData)` to `server/analyzer.js` (pure sync, no AI)
- Include `fingerprint` in `buildPageOutput` → `scrape_page` callers see it
- Include `fingerprint` in roundtable/audit results

### Phase 2 — Prepend fingerprint to persona prompts
- Update `buildPersonaContext()` in `analyzer.js` to accept optional `fingerprint`
- Prepend fingerprint block + "focus on unique lens" instruction to each persona call
- No schema changes, no new fields

### Phase 3 — Synchronous moderator
- Replace detached `.then()` with `await` on moderator call in `runRoundtable`
- Populate `result.debate` before returning
- Remove `moderatorPending: true` from return shape

### Phase 4 — Unified base schema
- Add `severity`, `findings[]`, `uniqueInsight`, `score` to all persona schema constants
- Update each prompt file to instruct the model to populate these fields
- Update `ROUNDTABLE_SCHEMA.disagreements[]` to `positions: { [personaId]: string }` (removes hardwired floorWalkerPosition etc.)

### Phase 5 — Smart persona selection
- Add `smart_select: boolean` (optional, default false) to `merch_roundtable` inputSchema
- When true: `runRoundtable` uses `fingerprint.recommendedPersonas` to select which personas to run
- Default behavior (all three) unchanged

### Phase 6 — Conversion Architect persona
- `server/prompts/conversion-architect.md`
- `CONVERSION_ARCHITECT_SCHEMA` + `analyzeAsConversionArchitect()` in `analyzer.js`
- Register `'conversion_architect'` as valid `persona` enum in `audit_storefront`
- Add to `handleSaveEval` persona cache reads
- Integrate as optional fourth roundtable persona when `smart_select: true`

---

## Key files for implementation

| File | Changes |
|---|---|
| `server/analyzer.js` | Add `computePageFingerprint`, extend persona schemas with base fields, update `buildPersonaContext`, sync moderator, add `analyzeAsConversionArchitect` |
| `server/index.js` | Add `fingerprint` to `buildPageOutput`, update `merch_roundtable` inputSchema (`smart_select`), register `conversion_architect` persona, update `handleSaveEval` |
| `server/prompts/floor-walker.md` | Add `uniqueInsight`, `severity`, `findings[]`, `score` instructions |
| `server/prompts/auditor.md` | Same base field additions |
| `server/prompts/scout.md` | Same base field additions |
| `server/prompts/auditor-b2b.md` | Same base field additions |
| `server/prompts/conversion-architect.md` | New file |
| `server/prompts/roundtable-moderator.md` | Update `disagreements[]` to accept dynamic persona keys |

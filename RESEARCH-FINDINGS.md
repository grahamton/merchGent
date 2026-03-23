# Research Findings: Data Quality Layer Design

**Research Team:** Local Model Research  
**Date:** 2026-03-23  
**Base Version:** merch-connector v2.0.12  
**Status:** Design recommendations ready for prototyping

---

## Executive Summary

The current data quality system in merch-connector suffers from three critical failure modes:

1. **Non-deterministic extraction** — LLM-based extraction via Firecrawl produces inconsistent results on identical inputs, causing false quality signals
2. **Binary scoring brittleness** — Hard thresholds fail to distinguish "site has no data" from "extraction failed"
3. **Path inconsistency** — Firecrawl and Puppeteer scrapers have fundamentally different quality characteristics but share a single scoring function

This document proposes a layered quality model that separates **extraction confidence** from **site quality assessment**, introduces **graded quality tiers**, and provides **path-aware evaluation**.

---

## Problem 1: Extraction Reliability

### Current State

`acquireWithFirecrawl()` uses JSON Schema + prompt to guide LLM extraction. The `description` field exhibits run-to-run variance on identical URLs:

- Run 1: `descriptionFillRate: 1.0`
- Run 2: `descriptionFillRate: 0.0`

This occurs because product cards on B2B sites show **spec strings** ("Color: Matte Black. Model: T2692EPBL"), not marketing copy. Without clear guidance, the LLM inconsistently maps these to the `description` field.

### Root Cause Analysis

**Schema annotation ambiguity:** The term "description" is semantically overloaded. On a PDP, description = marketing paragraph. On a category card, description = attribute summary or spec line. The schema annotation needs to explicitly define card-level descriptions.

**Prompt/schema interaction:** Firecrawl accepts both:
- JSON Schema `description` property on each field
- Top-level `prompt` parameter

Current code uses both, but their interaction is underspecified. Do they reinforce each other or conflict?

**LLM temperature:** Firecrawl's extraction LLM likely runs at non-zero temperature for flexibility. This introduces sampling variance.

### Recommended Contract: EXTRACT_SCHEMA Design Principles

#### 1. Field-Level Annotation Pattern

```javascript
// GOOD: Explicit, grounded in visual hierarchy
description: {
  type: 'string',
  description: 'Text appearing below the product title on the card, including: attribute summaries (e.g. "Color: Black"), spec lines (e.g. "Model: XYZ123"), finish/material names, or subtitle text. Exclude promotional badges. Empty string if none present.'
}

// BAD: Semantically ambiguous
description: {
  type: 'string',
  description: 'Product description'
}
```

**Key principles:**
- **Visual grounding** — "below the title on the card" anchors to DOM position
- **Positive examples** — List 3-4 concrete patterns
- **Boundary cases** — Explicitly exclude confusable elements (badges, disclaimers)
- **Empty contract** — Define when empty string is correct

#### 2. System Prompt Strategy

Use the `prompt` parameter for **task framing**, not field definitions:

```javascript
extract: {
  schema: EXTRACT_SCHEMA,
  prompt: 'You are extracting structured data from a product category page. Each product appears as a card with title, image, and metadata. Extract exactly what is visible on each card — do not infer or generate content. If a field is not present on the card, return empty string or empty array.',
  systemPrompt: 'Output valid JSON matching the schema. Prioritize precision over recall.'
}
```

**Rationale:**
- `prompt` sets the task context (category page, card-level extraction)
- `systemPrompt` enforces output discipline (valid JSON, no hallucination)
- Field semantics live in schema `description` properties

#### 3. Structured Output Techniques from Literature

**Constrained decoding:** If Firecrawl supports schema-guided decoding (like OpenAI's structured outputs), prefer that over prompt-only guidance. Schema-guided decoding eliminates JSON syntax errors and reduces semantic drift.

**Few-shot prompting:** For high-variance fields, include 1-2 examples in the `prompt`:

```javascript
prompt: 'Extract product cards. Example: If a card shows "Model T2692EPBL | Matte Black" below the title, map that to description. If a card shows only title + price, description should be empty string.'
```

**Retrieval grounding:** For known site patterns, inject site-specific guidance. Example: "Ferguson product cards show model number and finish name below the title — map both to description."

#### 4. Confidence Tagging (Proposed Extension)

**Problem:** Current schema returns only values, not confidence. When `description: ""`, we can't tell if the LLM is confident the field is absent or uncertain about extraction.

**Proposal:** Add optional per-field confidence scores. Two approaches:

**Approach A: Parallel confidence object**
```javascript
{
  products: [
    { title: "...", description: "Color: Black", price: 49.99 },
    // ...
  ],
  confidence: {
    description: [0.95, 0.60, 0.85, ...],
    price: [1.0, 1.0, 1.0, ...]
  }
}
```

**Approach B: Field-level confidence tuples**
```javascript
{
  products: [
    {
      title: { value: "...", confidence: 1.0 },
      description: { value: "Color: Black", confidence: 0.95 },
      price: { value: 49.99, confidence: 1.0 }
    }
  ]
}
```

**Recommendation:** Start with **Approach A** — easier schema, lower token cost. Map to Approach B internally if needed.

**Integration with `computeDataQuality()`:**
- Treat `confidence < 0.7` as "uncertain extraction"
- Tag the corresponding quality dimension as `confidence: 'low'`
- Separate from site quality assessment

---

## Problem 2: Data Quality Model Redesign

### Current Limitations

`computeDataQuality()` uses binary pass/fail:

```javascript
const withDesc = products.filter(
  p => p.description && p.description !== p.title && p.description.length > 30
).length;
const descriptionFillRate = products.length > 0 ? withDesc / products.length : 0;
```

**Issues:**
- 29-char descriptions count as 0
- No distinction between "site has no descriptions" and "extraction failed"
- `descriptionFillRate: 0` is ambiguous

### Proposed Model: Graded Quality Tiers

#### Tier Definitions

**For descriptions:**
- **Empty** — `""`
- **Spec string** — 1–40 chars, typically attribute pairs ("Color: Black")
- **Thin copy** — 40–100 chars, short phrases
- **Rich copy** — 100+ chars, paragraph-style

**For ratings:**
- **Absent** — `null`
- **Present** — numeric value

**For badges:**
- **None** — `[]`
- **Minimal** — 1–2 badges
- **Rich** — 3+ badges

#### Revised `computeDataQuality()` Signature

```javascript
/**
 * Compute multi-dimensional data quality metrics
 * @param {Object} data - Extraction result
 * @param {Array} data.products - Product array
 * @param {Array} data.facets - Facet array
 * @param {Object} data.extractionMetadata - Scraper + confidence data
 * @param {string} data.extractionMetadata.scraper - 'firecrawl' | 'puppeteer'
 * @param {Object} data.extractionMetadata.fieldConfidence - Per-field confidence (optional)
 * @param {Object} options - Configuration
 * @param {string} options.commerceMode - 'B2C' | 'B2B' | 'DTC' (for threshold tuning)
 * @returns {Object} Quality report with confidence tags
 */
function computeDataQuality(data, options = {}) {
  const { products, facets, extractionMetadata } = data;
  const { scraper, fieldConfidence = {} } = extractionMetadata;
  const { commerceMode = 'B2C' } = options;

  return {
    dimensions: {
      descriptions: computeDescriptionQuality(products, fieldConfidence.description, commerceMode),
      pricing: computePricingQuality(products, fieldConfidence.price),
      ratings: computeRatingQuality(products, fieldConfidence.rating),
      facets: computeFacetQuality(facets, scraper),
      products: computeProductCountQuality(products, scraper)
    },
    overall: {
      usabilityTier: 'full' | 'degraded' | 'minimal' | 'failed',
      extractionConfidence: 'high' | 'medium' | 'low',
      warnings: [] // Calibrated warning codes
    }
  };
}
```

#### Example Dimension Output

```javascript
{
  descriptions: {
    fillRate: 0.85,
    qualityDistribution: {
      empty: 0.15,
      spec: 0.60,
      thin: 0.20,
      rich: 0.05
    },
    extractionConfidence: 'high', // Based on fieldConfidence scores
    siteQualityAssessment: 'spec-heavy', // B2B site with spec strings
    confidence: 'high', // Overall dimension confidence
    warnings: []
  },
  ratings: {
    fillRate: 0.0,
    extractionConfidence: 'high',
    siteQualityAssessment: 'ratings-absent', // Site design choice
    confidence: 'high',
    warnings: []
  }
}
```

#### Key Features

1. **Separation of concerns:**
   - `extractionConfidence` — Did we extract reliably?
   - `siteQualityAssessment` — What does the site provide?
   - `confidence` — Can we trust this dimension?

2. **Quality distributions:**
   - Replace single fill rate with tier breakdown
   - Auditors can see "60% spec strings, 20% thin copy" vs. "80% rich copy"

3. **Path awareness:**
   - `scraper` parameter adjusts expectations
   - Firecrawl: lower confidence on complex fields, no performance metrics
   - Puppeteer: higher confidence, full metrics

4. **Commerce-mode tuning:**
   - B2B sites: spec strings are normal, not a quality defect
   - DTC sites: expect rich marketing copy

---

## Problem 3: Warning Calibration

### Current Warning Issues

Warnings fire on hard thresholds without context:
- `LOW_DESCRIPTION_FILL` fires at `< 0.3` — but B2B sites often have 100% spec strings (which currently score as 0)
- `NO_PRODUCTS_FOUND` conflates extraction failure with empty category
- `PERFORMANCE_UNAVAILABLE` is structural (Firecrawl path) not a quality issue

### Recommended Warning Taxonomy

**Tier 1: Extraction Failures** — Tool malfunction
- `FIRECRAWL_FAILED` — Keep as-is
- `EXTRACTION_CONFIDENCE_LOW` — NEW: Mean field confidence < 0.6
- `SCRAPER_TIMEOUT` — NEW: Extraction exceeded time budget
- `NO_PRODUCTS_FOUND` — **Condition:** `productCount === 0 AND extractionConfidence === 'low'`

**Tier 2: Site Quality Gaps** — Site design limitations
- `DESCRIPTIONS_SPEC_ONLY` — NEW: > 80% spec strings (< 40 chars)
- `RATINGS_ABSENT` — NEW: Split from `LOW_RATING_FILL`, only when `siteQualityAssessment === 'ratings-absent'`
- `FACETS_MINIMAL` — Rename `FACETS_INCOMPLETE`, fire when `facetCount < 4 AND extractionConfidence === 'high'`

**Tier 3: Structural Limitations** — Path constraints
- `PERFORMANCE_UNAVAILABLE` — Keep, document as expected on Firecrawl path
- `FACETS_COLLAPSED_UNAVAILABLE` — NEW: Firecrawl can't expand collapsed facets

**Tier 4: Data Quality Issues** — Actionable site problems
- `LOW_DESCRIPTION_FILL_CRITICAL` — NEW: < 30% any description (empty or spec), replaces old `LOW_DESCRIPTION_FILL`
- `PRICING_INCONSISTENT` — NEW: > 20% products missing price
- `LOW_CARD_CONFIDENCE` — Keep as-is (Puppeteer only)

**Deprecated:**
- `LOW_DESCRIPTION_FILL` — Replace with `DESCRIPTIONS_SPEC_ONLY` + `LOW_DESCRIPTION_FILL_CRITICAL`

### Warning Threshold Calibration Table

| Warning | B2C Threshold | B2B Threshold | DTC Threshold | Rationale |
|---------|---------------|---------------|---------------|-----------|
| `LOW_DESCRIPTION_FILL_CRITICAL` | fillRate < 0.3 | fillRate < 0.2 | fillRate < 0.4 | B2B sites often show only model numbers; DTC should have rich copy |
| `DESCRIPTIONS_SPEC_ONLY` | spec% > 0.7 | spec% > 0.95 | spec% > 0.6 | Spec strings common on B2B, unusual on DTC |
| `FACETS_MINIMAL` | count < 4 | count < 6 | count < 3 | B2B sites have complex taxonomies |
| `PRICING_INCONSISTENT` | missing% > 0.2 | missing% > 0.3 | missing% > 0.1 | B2B often "call for quote" |

**Implementation:**
```javascript
function generateWarnings(qualityReport, commerceMode) {
  const thresholds = THRESHOLD_MAP[commerceMode];
  const warnings = [];

  if (qualityReport.dimensions.descriptions.fillRate < thresholds.descriptionCritical) {
    warnings.push({
      code: 'LOW_DESCRIPTION_FILL_CRITICAL',
      severity: 'high',
      message: `Only ${Math.round(qualityReport.dimensions.descriptions.fillRate * 100)}% of products have descriptions`,
      dimension: 'descriptions'
    });
  }

  // ...additional warning logic
  return warnings;
}
```

---

## Problem 4: Graceful Degradation Contract

### Usability Tiers

Define when an acquire result is fit for purpose:

**Full (Tier 1)** — All core dimensions present with high confidence
- productCount ≥ 5
- pricing.fillRate ≥ 0.9
- descriptions.fillRate ≥ 0.5 (any tier)
- extractionConfidence === 'high'
- Use case: Full audit, competitive analysis

**Degraded (Tier 2)** — Core dimensions present, some confidence issues
- productCount ≥ 3
- pricing.fillRate ≥ 0.7
- OR extractionConfidence === 'medium'
- Use case: Audit with caveats, trends only

**Minimal (Tier 3)** — Partial data, low confidence
- productCount ≥ 1
- OR extractionConfidence === 'low'
- Use case: Signal only, re-acquisition recommended

**Failed (Tier 4)** — Unusable
- productCount === 0
- OR critical extraction error
- Use case: Return error, do not audit

### Skill Layer Contract

The auditor agent (skill layer) should adjust behavior based on tier:

**Full tier:**
- Run complete audit across all personas
- Include numeric scores
- Report with normal confidence

**Degraded tier:**
- Run audit but tag scores as `tentative: true`
- Add disclaimer: "Data quality is degraded — scores are directional only"
- Focus on present dimensions, skip missing ones

**Minimal tier:**
- Skip numeric scoring
- Report qualitative observations only
- Recommend re-acquisition with alternate scraper

**Failed tier:**
- Return error to user
- Suggest fallback URL or manual review

### Output Schema Extension

Add top-level quality marker to acquire payload:

```javascript
{
  url: "...",
  products: [...],
  facets: [...],
  dataQuality: {
    usabilityTier: 'degraded',
    extractionConfidence: 'medium',
    dimensions: { ... },
    warnings: [
      { code: 'EXTRACTION_CONFIDENCE_LOW', severity: 'medium', dimension: 'descriptions' }
    ]
  },
  // existing fields...
}
```

Skill checks `dataQuality.usabilityTier` and adjusts audit logic accordingly.

---

## Cross-Path Consistency Analysis

### Firecrawl vs. Puppeteer Characteristics

| Dimension | Firecrawl | Puppeteer | Consistency Expectation |
|-----------|-----------|-----------|-------------------------|
| Product count | LLM counts cards | DOM selector counts | Should match ± 10% |
| Title | LLM extracts | CSS selector | Should match exactly |
| Price | LLM extracts | CSS selector + regex | Should match exactly |
| Description | LLM infers | CSS selector fallback | **May differ** — LLM sees more context |
| Rating | LLM extracts | CSS selector + aria-label | Should match ± 0.5 stars |
| Badges | LLM extracts visible text | CSS selector | Should match |
| Facets | LLM extracts visible | DOM traversal | **Differs** — Puppeteer can expand collapsed |
| Performance | N/A | Chrome metrics | Structural gap |

### Recommended Cross-Path Test

Run both scrapers on 5 URLs, compute per-field agreement:

```javascript
const agreement = {
  productCount: Math.abs(fcCount - ppCount) / Math.max(fcCount, ppCount),
  titleMatch: titleExactMatches / totalProducts,
  priceMatch: priceExactMatches / totalProducts,
  // ...
};
```

**Success criteria:**
- `productCount` agreement > 0.9
- `titleMatch` > 0.95
- `priceMatch` > 0.9
- `description` agreement > 0.7 (lower due to inference differences)

If agreement is low, investigate:
1. Schema annotation issues (Firecrawl)
2. CSS selector brittleness (Puppeteer)
3. Site structure edge cases

---

## Implementation Roadmap

### Phase 1: Schema Refinement (1–2 days)
1. Update `EXTRACT_SCHEMA` annotations per patterns above
2. Add `systemPrompt` for output discipline
3. Run eval harness 10x on 4 URLs, measure variance
4. Target: `descriptionFillRate` stddev < 0.15

### Phase 2: Quality Model (2–3 days)
1. Implement tier classification functions
2. Refactor `computeDataQuality()` to new signature
3. Add `extractionMetadata` to scraper outputs
4. Update tests to validate tier logic

### Phase 3: Warning Calibration (1 day)
1. Build threshold map for B2C/B2B/DTC
2. Refactor `generateWarnings()` to use quality dimensions
3. Add new warning codes, deprecate old ones

### Phase 4: Integration (1 day)
1. Add `dataQuality.usabilityTier` to acquire response
2. Update skill layer to check tier and adjust audit behavior
3. Document graceful degradation contract

### Phase 5: Validation (2 days)
1. Run cross-path consistency tests
2. Verify warning calibration on 20+ URLs
3. A/B test old vs. new quality model on audit accuracy

**Total estimated effort:** 7–9 days

---

## Open Questions for Prototyping

1. **Firecrawl confidence API:** Does Firecrawl expose per-field confidence natively, or do we need to infer from multi-run variance?

2. **Commerce mode detection:** Should `commerceMode` be manually specified or auto-detected from site characteristics (e.g., presence of "Request Quote" buttons)?

3. **Field confidence aggregation:** When computing dimension-level `extractionConfidence`, should we use mean, min, or percentile of field confidences?

4. **Tier boundary tuning:** The proposed tier boundaries (e.g., 40 chars for spec vs. thin) are initial guesses. Should these be learned from labeled data?

5. **Skill layer API:** Does the skill accept `dataQuality.usabilityTier` as a parameter, or infer it from warnings?

---

## References

- **Structured Output Techniques:** OpenAI Structured Outputs, Anthropic tool use, Instructor library patterns
- **Data Quality Frameworks:** Deequ (AWS), Great Expectations, dbt data tests
- **Extraction Reliability:** "Automatic Extraction of Structured Data from Web Pages" (Dalvi et al.), "Schema-Guided Dialogue State Tracking" (Rastogi et al.)
- **LLM Variance:** "Quantifying Uncertainty in Neural Models" (Gal & Ghahramani), "Temperature Sampling in Language Models" (Holtzman et al.)

---

## Conclusion

The proposed data quality layer addresses all three failure modes:

1. **Extraction reliability** — Schema annotation patterns + confidence tagging reduce LLM variance and expose uncertainty
2. **Graded quality tiers** — Distinguish "no data" from "spec strings" from "rich copy"; separate extraction confidence from site quality
3. **Path-aware evaluation** — Explicit `scraper` parameter and commerce-mode tuning adjust expectations per context

The resulting system provides **transparent quality signals** to the auditor agent, enabling graceful degradation and reducing false alarms. Next step: build the eval harness and benchmark schema proposals.

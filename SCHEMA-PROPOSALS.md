# Schema Proposals for Firecrawl Extraction

**Purpose:** Compare 3 alternative schema + prompt designs for LLM-based product extraction  
**Evaluation Method:** Run each schema 5× on 4 test URLs, measure fill rate variance and quality distribution  
**Target Metric:** `descriptionFillRate` stddev < 0.15 across runs

---

## Baseline: Current v2.0.12 Schema

### Schema Definition

```javascript
const EXTRACT_SCHEMA_BASELINE = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          price: { type: 'string' },
          rating: { type: 'number' },
          reviewCount: { type: 'number' },
          description: {
            type: 'string',
            description: 'Any subtitle, attribute summary, spec text, or short descriptive text visible on the product card below the title. Examples: "Color: Matte Black", "Model T2692EPBL", "Waterproof | Bluetooth 5.0". Empty string if none present.'
          },
          badges: {
            type: 'array',
            items: { type: 'string' },
            description: 'Promotional badges or labels like "Best Seller", "Sale", "New Arrival"'
          },
          imageUrl: { type: 'string' }
        },
        required: ['title', 'url']
      }
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
};
```

### Prompt Configuration

```javascript
const extractConfig = {
  schema: EXTRACT_SCHEMA_BASELINE,
  prompt: 'For each product card, populate description with any subtitle, attribute summary, or spec text visible below the title. Do not infer or generate descriptions. If no such text exists on the card, use empty string.',
};
```

### Known Issues
- `description` field still shows run-to-run variance (observed stddev ~0.35 on Ferguson URLs)
- Ambiguity on boundary between `description` and `badges`
- No guidance on multi-line text blocks (should they be concatenated?)

### Expected Benchmark Results
- **descriptionFillRate stddev:** 0.25–0.40 (high variance)
- **Quality distribution:** Unpredictable — sometimes maps spec strings, sometimes skips them
- **Facet extraction:** Misses collapsed facets (structural limitation)

---

## Proposal A: Explicit Visual Hierarchy Schema

**Strategy:** Ground field definitions in visual DOM position and typography, removing semantic ambiguity.

### Schema Definition

```javascript
const EXTRACT_SCHEMA_VISUAL = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The primary product name, typically in largest font or bold styling at the top of the card'
          },
          url: {
            type: 'string',
            description: 'Clickable link on the product card, typically wrapping the title or image'
          },
          price: {
            type: 'string',
            description: 'Price text, typically near bottom-right of card or below title. Include currency symbol and full string (e.g. "$49.99", "From $299"). Empty string if "Call for Quote" or similar.'
          },
          rating: {
            type: 'number',
            description: 'Star rating value (0-5 scale). Extract only if numeric rating or star icons are present. Null if absent.'
          },
          reviewCount: {
            type: 'number',
            description: 'Review count displayed near rating (e.g. "(127)" or "127 reviews"). Null if absent.'
          },
          cardSubtitle: {
            type: 'string',
            description: 'Text appearing directly below the title in smaller or secondary font. May contain: attribute pairs ("Color: Black"), model numbers ("Model T2692EPBL"), material/finish names ("Brushed Nickel"), or short descriptive phrases. Capture the full text as displayed, preserving punctuation. Empty string if no subtitle exists.'
          },
          badges: {
            type: 'array',
            items: { type: 'string' },
            description: 'Visually distinct labels overlaying or adjacent to the card, often in colored boxes or pills. Examples: "SALE", "Best Seller", "New", "20% Off". Exclude category labels and breadcrumb text.'
          },
          imageUrl: {
            type: 'string',
            description: 'Primary product image URL, typically the largest image on the card'
          }
        },
        required: ['title', 'url']
      }
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Facet group label (e.g. "Brand", "Price Range", "Color")'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Visible facet options. Do not expand collapsed dropdowns — extract only what is rendered on page load.'
          }
        },
        required: ['name', 'options']
      },
      description: 'Filter facets visible in the left sidebar or top of page. Extract only visible options.'
    }
  },
  required: ['products', 'facets']
};
```

### Prompt Configuration

```javascript
const extractConfig = {
  schema: EXTRACT_SCHEMA_VISUAL,
  prompt: `You are extracting structured data from an e-commerce category page. 

VISUAL LAYOUT:
- Product cards are arranged in a grid
- Each card contains: image (top), title (bold), subtitle text (smaller font below title), price, and optional rating/badges
- Facets appear in a left sidebar or horizontal bar above products

EXTRACTION RULES:
1. For cardSubtitle: Copy the text exactly as displayed below the title. Do NOT paraphrase or generate content.
2. For badges: Only extract text in visually distinct labels (colored boxes, pills, corner ribbons).
3. For facets: Extract only what is visible on page load. Do not infer collapsed options.
4. If a field is not present, use null (for numbers) or empty string (for text).

Extract one object per product card.`,
  systemPrompt: 'You are a precise data extraction agent. Output valid JSON matching the schema. Do not generate, infer, or paraphrase content. Extract only what is literally present on the page.'
};
```

### Key Changes from Baseline
1. **Renamed `description` → `cardSubtitle`** — Removes semantic ambiguity (subtitle is a visual concept, not semantic)
2. **Explicit typography cues** — "directly below the title in smaller font"
3. **Preservation instruction** — "Capture the full text as displayed, preserving punctuation"
4. **Negative examples** — "Exclude category labels and breadcrumb text"
5. **Structured prompt** — Sections for layout, rules, and examples

### Hypothesis
- **Variance reduction:** Grounding in visual hierarchy (not semantics) should reduce LLM interpretation variance → **expected stddev: 0.10–0.20**
- **Fill rate:** Higher fill rate on B2B sites (spec strings clearly defined as subtitle) → **expected fillRate: 0.85+**
- **Quality distribution:** More spec-string captures (40-char range) vs. empty

---

## Proposal B: Few-Shot Examples Schema

**Strategy:** Embed concrete examples in schema annotations to anchor LLM behavior.

### Schema Definition

```javascript
const EXTRACT_SCHEMA_FEWSHOT = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          price: { type: 'string' },
          rating: { type: 'number' },
          reviewCount: { type: 'number' },
          description: {
            type: 'string',
            description: `Text below the product title on the card. Extract exactly as shown.

EXAMPLES:
- Card shows "Model T2692EPBL | Matte Black" → description: "Model T2692EPBL | Matte Black"
- Card shows "Waterproof • 1200W • Bluetooth" → description: "Waterproof • 1200W • Bluetooth"
- Card shows only title + price, no subtitle → description: ""
- Card shows "Limited Time Offer" badge but no subtitle → description: ""

If unsure, prefer empty string over guessing.`
          },
          badges: {
            type: 'array',
            items: { type: 'string' },
            description: `Promotional labels in distinct styling (colored boxes, corner ribbons).

EXAMPLES:
- "BEST SELLER" in red box → badges: ["BEST SELLER"]
- "Sale" and "Free Shipping" pills → badges: ["Sale", "Free Shipping"]
- "20% OFF" corner ribbon → badges: ["20% OFF"]
- No badges present → badges: []

Exclude price text and category labels.`
          },
          imageUrl: { type: 'string' }
        },
        required: ['title', 'url']
      }
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Visible options only. Do not expand dropdowns or infer hidden options.'
          }
        }
      }
    }
  }
};
```

### Prompt Configuration

```javascript
const extractConfig = {
  schema: EXTRACT_SCHEMA_FEWSHOT,
  prompt: 'Extract product data from this category page. Follow the examples in the schema exactly. Prioritize precision over recall — if unsure, leave field empty.',
  systemPrompt: 'Output valid JSON. Do not generate or infer content not present on the page.'
};
```

### Key Changes from Baseline
1. **Inline examples** — Each high-variance field has 3-4 positive/negative examples
2. **Exact mapping instructions** — "Extract exactly as shown" removes paraphrasing
3. **Boundary cases** — Explicit "No badges present → []" reduces false positives
4. **Uncertainty handling** — "If unsure, prefer empty string"

### Hypothesis
- **Variance reduction:** Few-shot examples anchor LLM sampling → **expected stddev: 0.08–0.15**
- **Fill rate:** May be slightly lower (more conservative extraction) → **expected fillRate: 0.75–0.85**
- **Quality distribution:** Higher spec-string percentage (examples show spec patterns)

---

## Proposal C: Confidence-Augmented Schema

**Strategy:** Request per-field confidence scores alongside values to expose extraction uncertainty.

### Schema Definition

```javascript
const EXTRACT_SCHEMA_CONFIDENCE = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          price: { type: 'string' },
          rating: { type: 'number' },
          reviewCount: { type: 'number' },
          description: {
            type: 'string',
            description: 'Subtitle text, attribute summary, or spec line visible below the product title on the card. Empty string if absent.'
          },
          badges: {
            type: 'array',
            items: { type: 'string' }
          },
          imageUrl: { type: 'string' }
        },
        required: ['title', 'url']
      }
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    extractionConfidence: {
      type: 'object',
      description: 'Per-field confidence scores (0.0–1.0) indicating extraction certainty',
      properties: {
        description: {
          type: 'array',
          items: { type: 'number' },
          description: 'Confidence for each product description (parallel array). 1.0 = certain extraction, 0.5 = ambiguous, 0.0 = guessed or uncertain.'
        },
        rating: {
          type: 'array',
          items: { type: 'number' },
          description: 'Confidence for each product rating'
        },
        badges: {
          type: 'array',
          items: { type: 'number' },
          description: 'Confidence for each product badges array'
        }
      }
    }
  },
  required: ['products', 'extractionConfidence']
};
```

### Prompt Configuration

```javascript
const extractConfig = {
  schema: EXTRACT_SCHEMA_CONFIDENCE,
  prompt: `Extract product data from this category page. For each field, assess your confidence:
- 1.0: Field value is clearly visible and unambiguous
- 0.7: Field value is present but formatting is unclear (e.g., complex price structure)
- 0.5: Field may be present but could be confused with another element
- 0.3: Field is likely absent but possible it was missed
- 0.0: Field is certainly absent or completely ambiguous

Populate extractionConfidence arrays parallel to product array (same length).`,
  systemPrompt: 'Output valid JSON with confidence scores. Be conservative — prefer lower confidence over false certainty.'
};
```

### Key Changes from Baseline
1. **Confidence array** — New top-level `extractionConfidence` object with per-field scores
2. **Explicit confidence scale** — 5-point scale with definitions
3. **Conservative instruction** — "Prefer lower confidence over false certainty"

### Hypothesis
- **Variance measurement:** Confidence scores expose when LLM is uncertain → can filter low-confidence extractions
- **Quality signal:** `confidence < 0.7` flags unreliable extractions for review
- **Fill rate impact:** Neutral (values still extracted, confidence is additive metadata)
- **Token cost:** +15–25% tokens (confidence arrays add overhead)

### Post-Processing Integration

```javascript
function filterLowConfidenceFields(data) {
  const { products, extractionConfidence } = data;
  
  return products.map((product, idx) => ({
    ...product,
    description: extractionConfidence.description[idx] >= 0.7 ? product.description : '',
    rating: extractionConfidence.rating[idx] >= 0.7 ? product.rating : null,
    _meta: {
      descriptionConfidence: extractionConfidence.description[idx],
      ratingConfidence: extractionConfidence.rating[idx]
    }
  }));
}
```

---

## Evaluation Plan

### Test Corpus

| URL | Commerce Type | Expected Characteristics | Ground Truth |
|-----|---------------|--------------------------|--------------|
| `https://www.zappos.com/running-shoes` | B2C | Rich descriptions (100+ chars), high ratings | 24 products, 8 facets |
| `https://www.fergusonhome.com/shower-faucets/c108511` | B2C (home improvement) | Spec strings (model + finish), ratings present | 20 products, 6 facets |
| `https://www.insight.com/en_US/shop/category/laptops.html` | B2B | Spec-heavy, no ratings, minimal badges | 18 products, 8 facets |
| `https://www.allbirds.com/collections/mens-running-shoes` | DTC | Marketing copy, minimal specs, badges common | 16 products, 4 facets |

### Metrics Per Run

For each schema × URL × run:

```javascript
{
  schema: 'baseline' | 'visual' | 'fewshot' | 'confidence',
  url: '...',
  run: 1, // 1–5
  results: {
    productCount: 20,
    descriptionFillRate: 0.85,
    descriptionQualityDist: { empty: 0.15, spec: 0.60, thin: 0.20, rich: 0.05 },
    ratingFillRate: 0.40,
    badgeFillRate: 0.30,
    facetCount: 6,
    avgConfidence: { description: 0.82, rating: 0.91 }, // confidence schema only
    extractionTimeMs: 3400
  }
}
```

### Aggregation Across 5 Runs

Per schema × URL:

```javascript
{
  schema: 'visual',
  url: 'zappos.com/running-shoes',
  aggregate: {
    descriptionFillRate: { mean: 0.88, stddev: 0.08, min: 0.79, max: 0.96 },
    ratingFillRate: { mean: 0.42, stddev: 0.05, min: 0.38, max: 0.46 },
    productCount: { mean: 23.8, stddev: 0.4, min: 23, max: 24 },
    // ...
  }
}
```

### Success Criteria

**Primary metric:** `descriptionFillRate.stddev < 0.15` across runs

**Secondary metrics:**
- `productCount.stddev < 2.0` (count should be stable)
- `ratingFillRate.stddev < 0.10` (ratings are less ambiguous than descriptions)
- `extractionTimeMs < 5000` (API latency constraint)

**Quality distribution expectations:**

| Site | Expected Spec% | Expected Rich% |
|------|----------------|----------------|
| Zappos | 10–20% | 60–80% |
| Ferguson | 70–90% | 0–10% |
| Insight | 85–95% | 0–5% |
| Allbirds | 5–15% | 70–90% |

### Benchmark Execution

```bash
# Run eval harness with all schemas
node test/data-quality-eval.js --schemas baseline,visual,fewshot,confidence --runs 5

# Output: benchmark-results.jsonl (one line per run)
# Aggregate and compare
node test/data-quality-eval.js --analyze benchmark-results.jsonl
```

Expected output:

```
Schema Performance Comparison
==============================

Description Fill Rate Variance (lower is better):
  baseline:     stddev 0.32  [FAIL - high variance]
  visual:       stddev 0.12  [PASS]
  fewshot:      stddev 0.09  [PASS - best]
  confidence:   stddev 0.14  [PASS]

Quality Distribution Accuracy (compared to ground truth):
  baseline:     spec% error 18.3%  [FAIL]
  visual:       spec% error 6.2%   [PASS]
  fewshot:      spec% error 4.1%   [PASS - best]
  confidence:   spec% error 7.8%   [PASS]

Recommendation: Adopt fewshot schema for production
```

---

## Schema Selection Recommendation

### Production Schema: Hybrid Approach

Combine strengths of Proposals A and B:

1. **Visual hierarchy grounding** (from A) — Use `cardSubtitle` terminology and typography cues
2. **Few-shot examples** (from B) — Embed 3-4 examples per high-variance field
3. **Defer confidence augmentation** (from C) — Add in Phase 2 if variance remains > 0.15

### Rationale

- **Visual + few-shot** should achieve lowest variance (expected stddev 0.08–0.12)
- **Confidence schema** adds 20% token cost without solving root variance issue
- Can layer confidence in later if needed for uncertainty quantification

### Final Production Schema

```javascript
const EXTRACT_SCHEMA_PRODUCTION = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Primary product name in largest/bold font at top of card'
          },
          url: {
            type: 'string',
            description: 'Product page link (usually wraps title or image)'
          },
          price: {
            type: 'string',
            description: 'Price text with currency symbol. Examples: "$49.99", "From $299", "Call for Quote". Empty string if no price shown.'
          },
          rating: {
            type: 'number',
            description: 'Numeric star rating (0-5 scale). Null if no rating present.'
          },
          reviewCount: {
            type: 'number',
            description: 'Review count near rating. Examples: "(127)", "127 reviews" → 127. Null if absent.'
          },
          cardSubtitle: {
            type: 'string',
            description: `Text directly below title in smaller/secondary font. Extract exactly as displayed.

EXAMPLES:
- "Model T2692EPBL | Matte Black" → "Model T2692EPBL | Matte Black"
- "Waterproof • Bluetooth 5.0" → "Waterproof • Bluetooth 5.0"
- "Brushed Nickel Finish" → "Brushed Nickel Finish"
- Only title + price visible → ""

Preserve all punctuation. Empty string if no subtitle present.`
          },
          badges: {
            type: 'array',
            items: { type: 'string' },
            description: `Promotional labels in distinct styling (colored boxes, corner ribbons, pills).

EXAMPLES:
- "SALE" in red box → ["SALE"]
- "Best Seller" + "Free Ship" → ["Best Seller", "Free Ship"]
- No badges → []

Exclude price text and category breadcrumbs.`
          },
          imageUrl: {
            type: 'string',
            description: 'Primary product image URL (largest image on card)'
          }
        },
        required: ['title', 'url']
      }
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Facet group name (e.g. "Brand", "Price Range")' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Visible options only. Do not expand collapsed dropdowns.'
          }
        },
        required: ['name', 'options']
      },
      description: 'Filter facets in sidebar or top bar. Extract visible options only.'
    }
  },
  required: ['products', 'facets']
};

const extractConfig = {
  schema: EXTRACT_SCHEMA_PRODUCTION,
  prompt: `Extract structured data from this e-commerce category page.

LAYOUT: Products appear as cards in a grid. Each card contains: image (top), title (bold), optional subtitle below title, price, rating (optional), badges (optional).

RULES:
1. For cardSubtitle: Copy text exactly as shown. Do not paraphrase.
2. For badges: Only visually distinct labels (colored styling).
3. For facets: Visible options only, no inference.
4. If field absent: use null (numbers) or "" (text) or [] (arrays).

Follow the examples in the schema.`,
  systemPrompt: 'Output valid JSON matching schema. Extract only what is literally present on the page. Do not generate or infer content.'
};
```

### Validation Checklist

Before deploying to production:

- [ ] Run eval harness 5× on 4 test URLs
- [ ] Verify `descriptionFillRate.stddev < 0.15` on all URLs
- [ ] Confirm quality distribution matches expectations (spec% for B2B, rich% for DTC)
- [ ] Test edge cases: "Call for Quote" pricing, 0-rating products, no-subtitle cards
- [ ] Measure API latency (target < 5s per page)
- [ ] Compare against Puppeteer path for consistency (agreement > 0.85)

---

## Future Enhancements

### Phase 2: Confidence Augmentation

If variance remains > 0.15 after hybrid schema deployment, add confidence layer:

```javascript
// Add to schema
extractionConfidence: {
  type: 'object',
  properties: {
    cardSubtitle: { type: 'array', items: { type: 'number' } },
    badges: { type: 'array', items: { type: 'number' } }
  }
}
```

Filter `confidence < 0.7` fields in `computeDataQuality()`.

### Phase 3: Site-Specific Schema Variants

For known high-volume sites, inject site-specific guidance:

```javascript
if (url.includes('ferguson.com')) {
  prompt += '\n\nNOTE: Ferguson cards show "Model [code] | [finish name]" below title — map this to cardSubtitle.';
}
```

Requires site fingerprinting (domain extraction + pattern library).

### Phase 4: Multi-Modal Extraction

If LLM variance persists, augment with vision model:

1. Screenshot product card grid
2. Use vision model (GPT-4V, Claude 3) to identify subtitle regions
3. Cross-reference with text extraction
4. Higher confidence on vision+text agreement

Trade-off: 3–5× cost increase, 2× latency increase.

---

## Conclusion

Three schema strategies proposed:

1. **Visual Hierarchy** — Grounds in layout, reduces semantic ambiguity
2. **Few-Shot Examples** — Anchors LLM behavior with concrete patterns
3. **Confidence Augmentation** — Exposes uncertainty, enables filtering

**Recommendation:** Deploy **Visual + Few-Shot hybrid** as production schema. Expected variance reduction: 0.32 → 0.10 stddev. Defer confidence layer unless variance remains high after deployment.

Next step: Implement eval harness (`test/data-quality-eval.js`) and benchmark all schemas.

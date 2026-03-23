/**
 * acquire.js
 * Implements the v2 "one pass, then think" architecture.
 *
 * handleAcquire() is the core handler for the `acquire` MCP tool.
 * It consolidates what previously required 4–8 sequential scrape calls into a single
 * crawl, returning a complete structured payload the plugin can analyze offline.
 *
 * Scraper routing:
 *   - FIRECRAWL_API_KEY set → Firecrawl primary (bot-evasion, fast)
 *   - No key             → Puppeteer (full analytics + network interception)
 */

import { scrapePage, scrapePdp, isValidHttpUrl } from './scraper.js';
import { computePageFingerprint } from './analyzer.js';
import { learnFromScrape, takeSnapshot, diffSnapshot, loadMemory } from './site-memory.js';
import { acquireWithFirecrawl, scrapePdpWithFirecrawl } from './firecrawl-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function parsePrice(raw) {
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseSalePercent(saleText) {
  if (!saleText) return null;
  const m = String(saleText).match(/(\d+)\s*%\s*off/i);
  return m ? parseInt(m[1], 10) : null;
}

// ─── PDP sampling ─────────────────────────────────────────────────────────────

/**
 * Pick up to `count` product URLs for PDP sampling.
 * Strategy: one mid-range (median price) + one premium (top 20%).
 * Falls back to first valid URLs if prices not parseable.
 */
export function selectPdpSamples(products, count) {
  if (!count || count <= 0) return [];

  const withUrls = products.filter(p => p.url && isValidHttpUrl(p.url));
  if (withUrls.length === 0) return [];

  const withPrices = withUrls
    .map(p => ({ url: p.url, price: parsePrice(p.price) }))
    .filter(p => p.price !== null)
    .sort((a, b) => a.price - b.price);

  if (withPrices.length === 0) {
    // No parseable prices — just take the first N unique URLs
    return [...new Set(withUrls.map(p => p.url))].slice(0, count);
  }

  const picks = new Set();

  // Mid-range: median index
  const medianIdx = Math.floor(withPrices.length / 2);
  picks.add(withPrices[medianIdx].url);

  // Premium: highest-priced product at or above 80th percentile
  if (count >= 2 && withPrices.length >= 2) {
    const p80idx = Math.floor(withPrices.length * 0.8);
    // Take the highest price that isn't already picked
    for (let i = withPrices.length - 1; i >= p80idx; i--) {
      if (!picks.has(withPrices[i].url)) {
        picks.add(withPrices[i].url);
        break;
      }
    }
    // If still need more, take from the top
    if (picks.size < 2) {
      for (let i = withPrices.length - 1; i >= 0; i--) {
        if (!picks.has(withPrices[i].url)) {
          picks.add(withPrices[i].url);
          break;
        }
      }
    }
  }

  // Fill remaining slots from the sorted list if count > 2
  if (count > 2) {
    for (const p of withPrices) {
      if (picks.size >= count) break;
      picks.add(p.url);
    }
  }

  return [...picks].slice(0, count);
}

/**
 * Map a raw scrapePdp() result (from Puppeteer or Firecrawl) to the pdpSamples[] shape.
 */
function mapRawPdpToAcquireShape(url, raw) {
  const price = parsePrice(raw.pricePrimary);
  const descriptionWordCount = raw.description ? raw.description.split(/\s+/).filter(Boolean).length : 0;
  return {
    url,
    title: raw.title || '',
    price,
    description: raw.description || '',
    descriptionIsTitle: !raw.description || raw.description === raw.title,
    descriptionWordCount,
    imageCount: raw.imageCount || 0,
    hasVideo: raw.hasVideo || false,
    rating: raw.rating || null,
    reviewCount: raw.reviewCount || 0,
    reviewsVisible: raw.hasReviews || false,
    specsPresent: raw.specTable?.present || false,
    specFields: raw.specFields || [],
    crossSellPresent: raw.crossSellModules || false,
    crossSellLabel: raw.crossSellLabel || null,
    crossSellProductCount: raw.crossSellProductCount || null,
    badges: raw.badges || [],
    ctaText: raw.ctaText || '',
  };
}

/**
 * Scrape a single PDP via Puppeteer and map to pdpSamples[] shape.
 */
export async function scrapePdpForAcquire(url, cookies = []) {
  const raw = await scrapePdp(url, cookies);
  return mapRawPdpToAcquireShape(url, raw);
}

// ─── Warning generation ───────────────────────────────────────────────────────

const QUALITY_THRESHOLDS = {
  B2C: { descCritical: 0.30, specOnly: 0.70, facetMinimal: 4, priceMissing: 0.20 },
  B2B: { descCritical: 0.20, specOnly: 0.95, facetMinimal: 6, priceMissing: 0.30 },
  Hybrid: { descCritical: 0.25, specOnly: 0.80, facetMinimal: 5, priceMissing: 0.25 },
};

/**
 * Generate warnings[] from the nearly-complete payload + scraper metadata.
 * @param {object} payload - Acquire payload (without warnings)
 * @param {object} meta    - { structureConfidence?: number, scraper: string }
 */
export function generateWarnings(payload, meta = {}) {
  const warnings = [];
  const dq = payload.dataQuality;
  const commerceMode = payload.commerce?.mode || 'B2C';
  const thresholds = QUALITY_THRESHOLDS[commerceMode] || QUALITY_THRESHOLDS.B2C;

  if (meta.scraper !== 'firecrawl' && meta.structureConfidence != null && meta.structureConfidence < 40) {
    warnings.push({
      code: 'LOW_CARD_CONFIDENCE',
      message: `Card selector confidence is ${meta.structureConfidence} — possible template mismatch. Products may be navigation tiles, not product listings.`,
      severity: 'error',
    });
  }

  if (!payload.screenshots?.mobile) {
    warnings.push({
      code: 'MOBILE_RENDER_FAILED',
      message: 'Mobile screenshot returned blank or failed. UA detection or redirect likely.',
      severity: 'warn',
    });
  }

  if (payload.performance?.fcp === 0) {
    warnings.push({
      code: 'FCP_ZERO',
      message: 'First Contentful Paint returned 0 — SPA timing issue, metric unreliable.',
      severity: 'warn',
    });
  }

  const gtm = payload.analytics?.gtmContainers;
  if (gtm && gtm.length > 0 && payload.analytics?.productImpressionsFiring === false) {
    warnings.push({
      code: 'ECOMMERCE_TRACKING_GAP',
      message: 'GTM present but productImpressions not detected on category page.',
      severity: 'warn',
    });
  }

  if ((payload.products?.length ?? 0) === 0) {
    warnings.push({
      code: 'NO_PRODUCTS_FOUND',
      message: 'No product cards detected on this page. URL may not be a category/listing page.',
      severity: 'error',
    });
  }

  if (meta.scraper === 'firecrawl' && (payload.performance?.fcp == null)) {
    warnings.push({
      code: 'PERFORMANCE_UNAVAILABLE',
      message: 'Performance metrics unavailable — Firecrawl does not capture browser timing. FCP/LCP/CLS will be null.',
      severity: 'info',
    });
  }

  if (meta.scraper === 'firecrawl' && (payload.facets?.length ?? 0) > 0 && (payload.facets?.length ?? 0) < thresholds.facetMinimal) {
    warnings.push({
      code: 'FACETS_MINIMAL',
      message: `Only ${payload.facets.length} facet(s) detected — collapsed filter panels cannot be expanded by Firecrawl. Actual facet count may be higher.`,
      severity: 'warn',
    });
  }

  if ((meta.pdpUrlCount ?? 0) > 0 && (payload.pdpSamples?.length ?? 0) === 0) {
    warnings.push({
      code: 'PDP_SAMPLES_BLOCKED',
      message: 'All PDP sample requests failed — bot protection likely blocking product page access. PDP content quality cannot be assessed.',
      severity: 'warn',
    });
  }

  if (dq && dq.productCount > 0) {
    // Keep LOW_DESCRIPTION_FILL for one release for backward compat
    if (dq.descriptionFillRate < 0.3) {
      warnings.push({
        code: 'LOW_DESCRIPTION_FILL',
        message: `Only ${Math.round(dq.descriptionFillRate * 100)}% of products have real descriptions (threshold: 30%).`,
        severity: 'warn',
      });
    }

    const descFill = dq.dimensions?.descriptions?.fillRate ?? 0;
    if (descFill < thresholds.descCritical) {
      warnings.push({
        code: 'LOW_DESCRIPTION_FILL_CRITICAL',
        message: `Only ${Math.round(descFill * 100)}% of products have any description text (threshold: ${Math.round(thresholds.descCritical * 100)}%).`,
        severity: 'warn',
      });
    }

    const specPct = dq.dimensions?.descriptions?.qualityDistribution?.spec ?? 0;
    if (specPct > thresholds.specOnly && dq.overall?.extractionConfidence === 'high') {
      warnings.push({
        code: 'DESCRIPTIONS_SPEC_ONLY',
        message: `Descriptions are heavily spec-driven (${Math.round(specPct * 100)}% of cards).`,
        severity: 'info',
      });
    }

    const ratingFill = dq.dimensions?.ratings?.fillRate ?? 0;
    if (ratingFill === 0 && dq.overall?.extractionConfidence === 'high') {
      warnings.push({
        code: 'RATINGS_ABSENT',
        message: 'No product ratings detected on cards.',
        severity: 'info',
      });
    }

    const priceFill = dq.dimensions?.pricing?.fillRate ?? 0;
    if (priceFill < (1 - thresholds.priceMissing) && dq.overall?.extractionConfidence === 'high') {
      warnings.push({
        code: 'PRICING_INCONSISTENT',
        message: `Pricing is missing on ${Math.round((1 - priceFill) * 100)}% of products.`,
        severity: 'warn',
      });
    }

    if (dq.overall?.extractionConfidence === 'low') {
      warnings.push({
        code: 'EXTRACTION_CONFIDENCE_LOW',
        message: 'Extraction confidence is low. Data quality metrics may be unreliable.',
        severity: 'info',
      });
    }
  }

  return warnings;
}

// ─── Data quality computation ─────────────────────────────────────────────────

function classifyDescriptionTier(desc) {
  if (!desc || desc.length === 0) return 'empty';
  if (desc.length <= 40) return 'spec';
  if (desc.length <= 100) return 'thin';
  return 'rich';
}

export function computeDataQuality(products, options = {}) {
  const { scraper = 'puppeteer', commerceMode = 'B2C', structureConfidence = null } = options;
  const total = products.length;
  if (total === 0) {
    return { 
      productCount: 0, productsWithRealDescriptions: 0, descriptionFillRate: 0, 
      productsWithRealRatings: 0, ratingFillRate: 0, productsWithPrices: 0, priceFillRate: 0, 
      productsWithUrls: 0, urlFillRate: 0, productsWithImages: 0, imageFillRate: 0,
      dimensions: {
        descriptions: { fillRate: 0, qualityDistribution: { empty: 0, spec: 0, thin: 0, rich: 0 }, siteQualityAssessment: 'absent' },
        ratings: { fillRate: 0, siteQualityAssessment: 'ratings-absent' },
        pricing: { fillRate: 0, siteQualityAssessment: 'pricing-hidden' },
      },
      overall: { usabilityTier: 'failed', extractionConfidence: 'low' }
    };
  }

  const withDesc = products.filter(p => p.description && p.description !== p.title && p.description.length > 30).length;
  const withRatings = products.filter(p => p.rating != null && p.rating > 0).length;
  const withPrices = products.filter(p => p.price != null).length;
  const withUrls = products.filter(p => p.url && isValidHttpUrl(p.url)).length;
  const withImages = products.filter(p => p.imageSrc || (p.imageCount && p.imageCount > 0)).length;
  const r = (n) => Math.round((n / total) * 100) / 100;

  // New: graded quality model
  const descTiers = { empty: 0, spec: 0, thin: 0, rich: 0 };
  let anyDescCount = 0;
  for (const p of products) {
    const desc = p.description && p.description !== p.title ? p.description : '';
    const tier = classifyDescriptionTier(desc);
    descTiers[tier]++;
    if (tier !== 'empty') anyDescCount++;
  }

  const descFillRate = r(anyDescCount);
  const qualityDistribution = {
    empty: r(descTiers.empty),
    spec: r(descTiers.spec),
    thin: r(descTiers.thin),
    rich: r(descTiers.rich),
  };

  let descSiteQuality = 'absent';
  if (descFillRate > 0) {
    if (qualityDistribution.rich > 0.3) descSiteQuality = 'rich-copy';
    else if (qualityDistribution.spec > 0.5) descSiteQuality = 'spec-heavy';
    else descSiteQuality = 'thin-copy';
  }

  const ratingFillRate = r(withRatings);
  const ratingSiteQuality = ratingFillRate > 0 ? 'ratings-present' : 'ratings-absent';

  const priceFillRate = r(withPrices);
  let pricingSiteQuality = 'pricing-hidden';
  if (priceFillRate >= 0.9) pricingSiteQuality = 'pricing-public';
  else if (priceFillRate > 0) pricingSiteQuality = 'pricing-mixed';

  // extractionConfidence
  let extractionConfidence = 'low';
  if (scraper === 'firecrawl') {
    if (total >= 5 && priceFillRate >= 0.8) extractionConfidence = 'high';
    else if (total >= 3) extractionConfidence = 'medium';
  } else {
    if (structureConfidence >= 60) extractionConfidence = 'high';
    else if (structureConfidence >= 40) extractionConfidence = 'medium';
  }

  // usabilityTier
  let usabilityTier = 'minimal';
  if (total >= 5 && priceFillRate >= 0.9 && descFillRate >= 0.5) {
    usabilityTier = 'full';
  } else if ((total >= 3 && priceFillRate >= 0.7) || extractionConfidence === 'medium') {
    usabilityTier = 'degraded';
  }

  return {
    productCount: total,
    productsWithRealDescriptions: withDesc,
    descriptionFillRate: r(withDesc),
    productsWithRealRatings: withRatings,
    ratingFillRate,
    productsWithPrices: withPrices,
    priceFillRate,
    productsWithUrls: withUrls,
    urlFillRate: r(withUrls),
    productsWithImages: withImages,
    imageFillRate: r(withImages),
    dimensions: {
      descriptions: {
        fillRate: descFillRate,
        qualityDistribution,
        siteQualityAssessment: descSiteQuality,
      },
      ratings: {
        fillRate: ratingFillRate,
        siteQualityAssessment: ratingSiteQuality,
      },
      pricing: {
        fillRate: priceFillRate,
        siteQualityAssessment: pricingSiteQuality,
      },
    },
    overall: {
      usabilityTier,
      extractionConfidence,
    },
  };
}

// ─── Trust signal aggregation ─────────────────────────────────────────────────

function aggregateTrustSignals(products, returnPolicyVisible = false) {
  const ratings = products.map(p => p.rating).filter(r => r != null);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  const allBadges = [...new Set(products.flatMap(p => p.badges || []))];
  const urgency = [...new Set(products.map(p => p.stockWarning).filter(Boolean))];

  const freeShippingInIndicators = products.some(p => (p.b2cIndicators || []).some(i => /free\s*(shipping|returns)/i.test(i)));
  const freeShippingInBadges = allBadges.some(b => /free\s*(shipping|returns|delivery)/i.test(b));

  return {
    ratingsOnCards: products.some(p => p.rating != null),
    avgRating: avgRating,
    reviewsOnCards: products.some(p => (p.reviewCount ?? 0) > 0),
    freeShippingPromised: freeShippingInIndicators || freeShippingInBadges,
    returnPolicyVisible,
    trustBadges: allBadges.slice(0, 10),
    urgencyMessaging: urgency,
    salePresent: products.some(p => p.onSale),
  };
}

// ─── Analytics mapping from networkIntel ─────────────────────────────────────

function mapAnalytics(networkIntel) {
  if (!networkIntel) return { platforms: [], gtmContainers: [], hasEcommerceTracking: false, productImpressionsFiring: false, addToCartEventPresent: false, userSegment: null };

  const dl = networkIntel.dataLayer || {};
  const platformNames = [];
  if (dl.analyticsPlatform) platformNames.push(dl.analyticsPlatform);
  for (const p of (networkIntel.platforms || [])) {
    const name = p.name || p.id;
    if (name && !platformNames.includes(name)) platformNames.push(name);
  }

  const events = dl.ecommerceEvents || [];
  const hasEcommerce = events.length > 0;
  const productImpressionsFiring = events.some(e => /view_item_list|productImpression|product_impression/i.test(e));
  const addToCartEventPresent = events.some(e => /add_to_cart|addToCart/i.test(e));

  return {
    platforms: platformNames,
    gtmContainers: dl.gtmContainers || [],
    hasEcommerceTracking: hasEcommerce,
    productImpressionsFiring,
    addToCartEventPresent,
    userSegment: dl.userSegment || null,
  };
}

// ─── Product normalization (Puppeteer raw → acquire shape) ───────────────────

function normalizeProduct(p) {
  const price = parsePrice(p.price);
  const ts = p.trustSignals || {};
  const salePercent = parseSalePercent(ts.saleText);
  return {
    title: p.title || '',
    price,
    originalPrice: null, // not separately captured in card extraction
    onSale: ts.onSale || false,
    salePercent,
    stockStatus: p.stockStatus || null,
    stockWarning: ts.stockWarning || null,
    url: p.url || null,
    imageCount: p.imageCount || 0,
    rating: ts.starRating || null,
    reviewCount: ts.reviewCount || null,
    description: p.description || null,
    descriptionIsTitle: !p.description || p.description === p.title,
    badges: ts.badges || [],
    b2bIndicators: p.b2bIndicators || [],
    b2cIndicators: p.b2cIndicators || [],
    // Preserve raw fields for downstream compatibility
    imageAlt: p.imageAlt || null,
    imageSrc: p.imageSrc || null,
    ctaText: p.ctaText || null,
    trustSignals: ts,
  };
}

// ─── Pro/Trade CTA detection ──────────────────────────────────────────────────

const PRO_TRADE_PATTERN = /pro\s*pric|trade\s*account|contractor\s*login|pro\s*account|get\s*pro|trade\s*pric|pro\s*rewards|trade\s*program|are\s+you\s+a\s+pro|pro\s*login|pro\s*sign[\s-]?in|become\s+a\s+pro/i;

function hasProTradeCta(scrapeResult) {
  const interactables = scrapeResult.interactables || [];
  const findings = scrapeResult.findings || [];
  return interactables.some(i => PRO_TRADE_PATTERN.test(i.text || '')) ||
    findings.some(f => PRO_TRADE_PATTERN.test(f.text || '') || PRO_TRADE_PATTERN.test(f.title || '')) ||
    PRO_TRADE_PATTERN.test(scrapeResult.pageText || '') ||
    PRO_TRADE_PATTERN.test(scrapeResult.page?.h1 || '') ||
    PRO_TRADE_PATTERN.test(scrapeResult.page?.title || '');
}

// ─── Puppeteer → acquire payload ──────────────────────────────────────────────

function mapPuppeteerToAcquirePayload(scrapeResult, pdpSamples, url) {
  const fp = computePageFingerprint(scrapeResult);
  const products = (scrapeResult.products || []).map(normalizeProduct);

  // Commerce mode — upgrade B2C to Hybrid when Pro/Trade CTAs are present
  const loginRequired = products.some(p => p.b2bIndicators.some(i => /login.*pric|login.*see/i.test(i)));

  // Sort options → simplified shape
  const so = scrapeResult.sortOptions;
  const sort = so ? { current: so.current || null, options: (so.options || []).map(o => (typeof o === 'string' ? o : o.label || o.value || String(o))) } : null;

  // Screenshots
  const desktopB64 = scrapeResult.screenshotBuffer ? scrapeResult.screenshotBuffer.toString('base64') : null;
  const mobileB64 = scrapeResult.mobileScreenshotBuffer ? scrapeResult.mobileScreenshotBuffer.toString('base64') : null;

  // Performance
  const perf = scrapeResult.performance || {};
  const performance = {
    fcp: perf.firstContentfulPaint || 0,
    lcp: null,
    cls: null,
    domContentLoaded: perf.domContentLoaded || 0,
    loadComplete: perf.loadComplete || 0,
    resourceCount: perf.resourceCount || 0,
    mobilePageSpeedScore: null,
  };

  // Analytics
  const analytics = mapAnalytics(scrapeResult.networkIntel);

  // Data quality (uses raw products before normalization for description check)
  const dataQuality = computeDataQuality(products, {
    scraper: 'puppeteer',
    commerceMode: scrapeResult.b2bMode || 'B2C',
    structureConfidence: scrapeResult.structure?.confidence ?? null,
  });

  // Trust signals aggregate
  const trustSignals = aggregateTrustSignals(products, scrapeResult.returnPolicyVisible || false);

  // Navigation
  const navigation = {
    topNavItems: [],
    hasFilterPanel: (scrapeResult.facets || []).length > 0,
    filterPanelPosition: 'left',
    hasStickyNav: null,
    hasSearchBar: (scrapeResult.interactables || []).some(i => i.type === 'input' || /search/i.test(i.text + (i.selector || ''))),
    breadcrumbPresent: (scrapeResult.breadcrumb || []).length > 0,
    returnPolicyVisible: scrapeResult.returnPolicyVisible || false,
  };

  return {
    url: scrapeResult.url || url,
    acquiredAt: new Date().toISOString(),
    scraper: 'puppeteer',
    page: {
      title: scrapeResult.title || '',
      metaDescription: scrapeResult.metaDescription || null,
      pageType: fp.pageType || null,
      breadcrumb: scrapeResult.breadcrumb || [],
      h1: scrapeResult.h1 || '',
      aboveTheFoldContent: null,
    },
    commerce: {
      mode: (scrapeResult.b2bMode === 'B2C' && hasProTradeCta(scrapeResult)) ? 'Hybrid' : (scrapeResult.b2bMode || 'B2C'),
      platform: (scrapeResult.networkIntel?.platforms || [])[0]?.name || null,
      priceTransparency: fp.priceTransparency || 'public',
      loginRequired,
      contractPricingVisible: products.some(p => p.b2bIndicators.some(i => /contract\s*pric/i.test(i))),
    },
    products,
    facets: scrapeResult.facets || [],
    sort,
    screenshots: { desktop: desktopB64, mobile: mobileB64 },
    performance,
    trustSignals,
    analytics,
    dataQuality,
    navigation,
    pdpSamples,
  };
}

// ─── Firecrawl → acquire payload ──────────────────────────────────────────────

function mapFirecrawlToAcquirePayload(fcResult, pdpSamples) {
  const raw = fcResult;
  const products = (raw.products || []).map(p => {
    const desc = p.cardSubtitle || p.description || null;
    return {
      ...p,
      description: desc,
      descriptionIsTitle: !desc || desc === p.title,
      trustSignals: {
      starRating: p.rating || null,
      reviewCount: p.reviewCount || null,
      bestSeller: (p.badges || []).some(b => /best\s*seller/i.test(b)),
      isNew: (p.badges || []).some(b => /^\s*new\s*$/i.test(b)),
      onSale: p.onSale || false,
      saleText: p.salePercent ? `${p.salePercent}% off` : null,
      stockWarning: p.stockWarning || null,
      sustainabilityLabel: null,
      badges: p.badges || [],
    },
  };
  });

  const rawCommerce = raw.commerce || {};
  const dataQuality = computeDataQuality(products, {
    scraper: 'firecrawl',
    commerceMode: rawCommerce.mode || 'B2C',
  });
  const trustSignals = aggregateTrustSignals(products);
  const nav = raw.navigation || {};

  // Upgrade B2C to Hybrid when Pro/Trade CTAs appear in nav items or full page content
  const navItems = nav.topNavItems || [];
  const commerceMode = (rawCommerce.mode === 'B2C' && (
    navItems.some(i => PRO_TRADE_PATTERN.test(i)) ||
    PRO_TRADE_PATTERN.test(raw.content || '')
  )) ? 'Hybrid' : (rawCommerce.mode || 'B2C');

  return {
    url: raw.url,
    acquiredAt: new Date().toISOString(),
    scraper: 'firecrawl',
    page: raw.page || {},
    commerce: { ...rawCommerce, mode: commerceMode },
    products,
    facets: raw.facets || [],
    sort: raw.sort || null,
    screenshots: {
      desktop: raw.desktopScreenshotB64 || null,
      mobile: raw.mobileScreenshotB64 || null,
    },
    performance: {
      fcp: null, lcp: null, cls: null,
      domContentLoaded: null, loadComplete: null, resourceCount: null, mobilePageSpeedScore: null,
    },
    trustSignals,
    analytics: { platforms: [], gtmContainers: [], hasEcommerceTracking: false, productImpressionsFiring: false, addToCartEventPresent: false, userSegment: null },
    dataQuality,
    navigation: {
      topNavItems: nav.topNavItems || [],
      hasFilterPanel: nav.hasFilterPanel ?? (raw.facets || []).length > 0,
      filterPanelPosition: nav.filterPanelPosition || null,
      hasStickyNav: nav.hasStickyNav || null,
      hasSearchBar: nav.hasSearchBar || null,
      breadcrumbPresent: nav.breadcrumbPresent ?? ((raw.page?.breadcrumb || []).length > 0),
      returnPolicyVisible: null,
    },
    pdpSamples,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * handleAcquire — called by the MCP dispatch in index.js.
 *
 * @param {object} args         - { url, pdp_sample }
 * @param {object} sessionOps   - { getSessionCookies, saveSessionCookies, getCachedPage, setCachedPage }
 */
export async function handleAcquire(args, sessionOps) {
  const { url, pdp_sample = 2 } = args;
  const { getSessionCookies, saveSessionCookies, getCachedPage, setCachedPage, sendLog } = sessionOps;
  const log = (level, msg, data) => sendLog?.(level, msg, { tool: 'acquire', url, ...data });

  if (!isValidHttpUrl(url)) {
    throw Object.assign(new Error('Invalid URL — must be http or https.'), { isValidationError: true });
  }

  const pdpCount = Math.min(Math.max(0, Math.round(pdp_sample ?? 2)), 5);
  const domain = getDomain(url);

  // Check page cache — reuse if fresh (same TTL as scrape_page)
  const cached = getCachedPage(url);
  if (cached?._acquirePayload) {
    log('debug', 'Returning cached acquire payload');
    return cached._acquirePayload;
  }

  let payload;
  let scraperMeta = {};

  if (process.env.FIRECRAWL_API_KEY) {
    // ── Firecrawl path (with Puppeteer fallback on runtime failure) ───────────
    log('info', 'Starting Firecrawl scrape');
    let fcResult = null;
    try {
      fcResult = await acquireWithFirecrawl(url);
      log('info', `Firecrawl scrape complete — ${(fcResult.products || []).length} products`);
    } catch (fcErr) {
      // Fall back to Puppeteer and note the failure in warnings
      fcResult = null;
      scraperMeta._firecrawlError = fcErr.message || String(fcErr);
      log('warn', `Firecrawl failed, falling back to Puppeteer: ${scraperMeta._firecrawlError}`);
    }

    if (fcResult) {
      // PDP sampling: try Firecrawl first (bypasses WAF); fall back to Puppeteer per-URL
      const cookies = getSessionCookies(url);
      const pdpUrls = selectPdpSamples(fcResult.products || [], pdpCount);
      if (pdpUrls.length) log('info', `Sampling ${pdpUrls.length} PDP(s) via Firecrawl`);
      const pdpSamples = await Promise.all(pdpUrls.map(async u => {
        try {
          const signal = AbortSignal.timeout(12000); // 12s per PDP — keep total under 60s
          const raw = await scrapePdpWithFirecrawl(u, { signal });
          return mapRawPdpToAcquireShape(u, raw);
        } catch {
          // Firecrawl PDP failed — try Puppeteer as last resort
          return scrapePdpForAcquire(u, cookies).catch(() => null);
        }
      })).then(r => r.filter(Boolean));
      if (pdpUrls.length) log('info', `PDP sampling complete — ${pdpSamples.length}/${pdpUrls.length} succeeded`);

      payload = mapFirecrawlToAcquirePayload(fcResult, pdpSamples);
      scraperMeta = { scraper: 'firecrawl', pdpUrlCount: pdpUrls.length };
    } else {
      // Firecrawl failed at runtime — fall through to Puppeteer path below
      // (scraperMeta._firecrawlError is set above)
    }
  }

  if (!payload) {

    // ── Puppeteer path ──────────────────────────────────────────────────────
    log('info', 'Starting Puppeteer scrape');
    const cookies = getSessionCookies(url);
    const scrapeResult = await scrapePage(url, cookies, 1, 50, true);
    saveSessionCookies(url, scrapeResult.cookies);
    log('info', `Puppeteer scrape complete — ${(scrapeResult.products || []).length} products`);

    const pdpUrls = selectPdpSamples(scrapeResult.products || [], pdpCount);
    const pdpCookies = getSessionCookies(url); // refreshed after scrape
    if (pdpUrls.length) log('info', `Sampling ${pdpUrls.length} PDP(s)`);
    const pdpSamples = await Promise.all(pdpUrls.map(u => scrapePdpForAcquire(u, pdpCookies).catch(() => null))).then(r => r.filter(Boolean));
    if (pdpUrls.length) log('info', `PDP sampling complete — ${pdpSamples.length}/${pdpUrls.length} succeeded`);

    scraperMeta = {
      scraper: 'puppeteer',
      structureConfidence: scrapeResult.structure?.confidence ?? null,
      pdpUrlCount: pdpUrls.length,
      ...(scraperMeta._firecrawlError ? { firecrawlFallback: true, firecrawlError: scraperMeta._firecrawlError } : {}),
    };
    payload = mapPuppeteerToAcquirePayload(scrapeResult, pdpSamples, url);

    // Store in page cache for tool compatibility (ask_page, interact_with_page)
    const cacheEntry = {
      ...scrapeResult,
      _acquirePayload: null, // placeholder, set below
    };
    setCachedPage(scrapeResult.url, cacheEntry);
  }

  // Generate warnings
  payload.warnings = generateWarnings(payload, scraperMeta);
  if (scraperMeta.firecrawlFallback) {
    payload.warnings.unshift({
      code: 'FIRECRAWL_FAILED',
      message: `Firecrawl timed out or errored — fell back to Puppeteer. Error: ${scraperMeta.firecrawlError}`,
      severity: 'warn',
    });
  }

  // ── Block detection ──────────────────────────────────────────────────────────
  const warnCodes = new Set(payload.warnings.map(w => w.code));
  const BLOCK_TRIGGERS = ['FIRECRAWL_FAILED', 'LOW_CARD_CONFIDENCE', 'NO_PRODUCTS_FOUND'];
  payload.blocked = BLOCK_TRIGGERS.some(c => warnCodes.has(c));

  if (payload.blocked) {
    if (warnCodes.has('FIRECRAWL_FAILED')) {
      payload.blockType = 'WAF';
    } else if (warnCodes.has('NO_PRODUCTS_FOUND') && warnCodes.has('FCP_ZERO')) {
      payload.blockType = 'TIMEOUT';
    } else if (warnCodes.has('NO_PRODUCTS_FOUND')) {
      payload.blockType = 'EMPTY_RENDER';
    } else {
      payload.blockType = 'WAF'; // LOW_CARD_CONFIDENCE alone
    }

    try {
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? '';
      payload.fallbackSuggestions = [
        `site:${u.hostname}${u.pathname}`,
        `${u.hostname} ${slug} brand add to cart`.trim(),
        `cache:${u.hostname}${u.pathname}`,
      ];
    } catch { /* non-fatal */ }
  } else {
    payload.blocked = false;
  }

  // Site memory + change detection (non-fatal)
  try {
    // Build a synthetic scrape result shape for site-memory functions
    const synthetic = {
      products: payload.products,
      facets: payload.facets,
      structure: { confidence: scraperMeta.structureConfidence ?? 100 },
      performance: payload.performance,
      b2bMode: payload.commerce?.mode,
      b2bConflictScore: null,
      sortOptions: payload.sort ? { current: payload.sort.current, options: (payload.sort.options || []).map(l => ({ label: l })) } : null,
    };

    const changes = diffSnapshot(domain, synthetic);
    takeSnapshot(domain, synthetic);
    learnFromScrape(domain, synthetic);
    const memory = loadMemory(domain);

    if (changes) payload.changes = changes;
    if (memory && (memory.scrapeCount > 1 || (memory.notes || []).length > 0)) {
      payload.siteMemory = { scrapeCount: memory.scrapeCount, notes: memory.notes || [], customFields: memory.customFields || {} };
    }
  } catch { /* non-fatal */ }

  // Cache the completed payload for same-session reuse — skip if blocked
  if (!payload.blocked) {
    try {
      const cacheEntry = getCachedPage(url) || {};
      cacheEntry._acquirePayload = payload;
      setCachedPage(payload.url, cacheEntry);
    } catch { /* non-fatal */ }
  }

  return payload;
}

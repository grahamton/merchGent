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
import { acquireWithFirecrawl } from './firecrawl-client.js';

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
 * Scrape a single PDP and map the result to the spec's pdpSamples[] shape.
 */
export async function scrapePdpForAcquire(url, cookies = []) {
  const raw = await scrapePdp(url, cookies);
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

// ─── Warning generation ───────────────────────────────────────────────────────

/**
 * Generate warnings[] from the nearly-complete payload + scraper metadata.
 * @param {object} payload - Acquire payload (without warnings)
 * @param {object} meta    - { structureConfidence?: number, scraper: string }
 */
export function generateWarnings(payload, meta = {}) {
  const warnings = [];

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

  const dq = payload.dataQuality;
  if (dq && dq.productCount > 0 && dq.descriptionFillRate < 0.3) {
    warnings.push({
      code: 'LOW_DESCRIPTION_FILL',
      message: `Only ${Math.round(dq.descriptionFillRate * 100)}% of products have real descriptions (threshold: 30%).`,
      severity: 'warn',
    });
  }

  return warnings;
}

// ─── Data quality computation ─────────────────────────────────────────────────

function computeDataQuality(products) {
  const total = products.length;
  if (total === 0) {
    return { productCount: 0, productsWithRealDescriptions: 0, descriptionFillRate: 0, productsWithRatings: 0, ratingFillRate: 0, productsWithPrices: 0, priceFillRate: 0, productsWithUrls: 0, urlFillRate: 0, productsWithImages: 0, imageFillRate: 0 };
  }
  const withDesc = products.filter(p => p.description && p.description !== p.title && p.description.length > 30).length;
  const withRatings = products.filter(p => p.rating != null).length;
  const withPrices = products.filter(p => p.price != null).length;
  const withUrls = products.filter(p => p.url && isValidHttpUrl(p.url)).length;
  const withImages = products.filter(p => p.imageSrc || (p.imageCount && p.imageCount > 0)).length;
  const r = (n) => Math.round((n / total) * 100) / 100;
  return {
    productCount: total,
    productsWithRealDescriptions: withDesc,
    descriptionFillRate: r(withDesc),
    productsWithRatings: withRatings,
    ratingFillRate: r(withRatings),
    productsWithPrices: withPrices,
    priceFillRate: r(withPrices),
    productsWithUrls: withUrls,
    urlFillRate: r(withUrls),
    productsWithImages: withImages,
    imageFillRate: r(withImages),
  };
}

// ─── Trust signal aggregation ─────────────────────────────────────────────────

function aggregateTrustSignals(products, returnPolicyVisible = false) {
  const ratings = products.map(p => p.rating).filter(r => r != null);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  const allBadges = [...new Set(products.flatMap(p => p.badges || []))];
  const urgency = [...new Set(products.map(p => p.stockWarning).filter(Boolean))];

  return {
    ratingsOnCards: products.some(p => p.rating != null),
    avgRating: avgRating,
    reviewsOnCards: products.some(p => (p.reviewCount ?? 0) > 0),
    freeShippingPromised: products.some(p => (p.b2cIndicators || []).some(i => /free\s*(shipping|returns)/i.test(i))),
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

// ─── Puppeteer → acquire payload ──────────────────────────────────────────────

function mapPuppeteerToAcquirePayload(scrapeResult, pdpSamples, url) {
  const fp = computePageFingerprint(scrapeResult);
  const products = (scrapeResult.products || []).map(normalizeProduct);

  // Commerce mode
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
  const dataQuality = computeDataQuality(products);

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
      mode: scrapeResult.b2bMode || 'B2C',
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
  const products = (raw.products || []).map(p => ({
    ...p,
    descriptionIsTitle: !p.description || p.description === p.title,
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
  }));

  const dataQuality = computeDataQuality(products);
  const trustSignals = aggregateTrustSignals(products);
  const nav = raw.navigation || {};

  return {
    url: raw.url,
    acquiredAt: new Date().toISOString(),
    scraper: 'firecrawl',
    page: raw.page || {},
    commerce: raw.commerce || {},
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
  const { getSessionCookies, saveSessionCookies, getCachedPage, setCachedPage } = sessionOps;

  if (!isValidHttpUrl(url)) {
    throw Object.assign(new Error('Invalid URL — must be http or https.'), { isValidationError: true });
  }

  const pdpCount = Math.min(Math.max(0, Math.round(pdp_sample ?? 2)), 5);
  const domain = getDomain(url);

  // Check page cache — reuse if fresh (same TTL as scrape_page)
  const cached = getCachedPage(url);
  if (cached?._acquirePayload) return cached._acquirePayload;

  let payload;
  let scraperMeta = {};

  if (process.env.FIRECRAWL_API_KEY) {
    // ── Firecrawl path (with Puppeteer fallback on runtime failure) ───────────
    let fcResult = null;
    try {
      fcResult = await acquireWithFirecrawl(url);
    } catch (fcErr) {
      // Fall back to Puppeteer and note the failure in warnings
      fcResult = null;
      scraperMeta._firecrawlError = fcErr.message || String(fcErr);
    }

    if (fcResult) {
      // PDP sampling uses Puppeteer (Firecrawl extract works poorly on PDPs without a schema tuned for them)
      const cookies = getSessionCookies(url);
      const pdpUrls = selectPdpSamples(fcResult.products || [], pdpCount);
      const pdpSamples = await Promise.all(pdpUrls.map(u => scrapePdpForAcquire(u, cookies).catch(() => null))).then(r => r.filter(Boolean));

      payload = mapFirecrawlToAcquirePayload(fcResult, pdpSamples);
      scraperMeta = { scraper: 'firecrawl' };
    } else {
      // Firecrawl failed at runtime — fall through to Puppeteer path below
      // (scraperMeta._firecrawlError is set above)
    }
  }

  if (!payload) {

    // ── Puppeteer path ──────────────────────────────────────────────────────
    const cookies = getSessionCookies(url);
    const scrapeResult = await scrapePage(url, cookies, 1, 50, true);
    saveSessionCookies(url, scrapeResult.cookies);

    const pdpUrls = selectPdpSamples(scrapeResult.products || [], pdpCount);
    const pdpCookies = getSessionCookies(url); // refreshed after scrape
    const pdpSamples = await Promise.all(pdpUrls.map(u => scrapePdpForAcquire(u, pdpCookies).catch(() => null))).then(r => r.filter(Boolean));

    scraperMeta = {
      scraper: 'puppeteer',
      structureConfidence: scrapeResult.structure?.confidence ?? null,
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

  // Cache the completed payload for same-session reuse
  try {
    const cacheEntry = getCachedPage(url) || {};
    cacheEntry._acquirePayload = payload;
    setCachedPage(payload.url, cacheEntry);
  } catch { /* non-fatal */ }

  return payload;
}

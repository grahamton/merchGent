/**
 * firecrawl-client.js
 * Thin wrapper around the Firecrawl scrape API for the acquire tool.
 * Returns a structured object that mapFirecrawlToAcquirePayload() in acquire.js can consume.
 *
 * Only used when FIRECRAWL_API_KEY is set. Falls back to Puppeteer otherwise.
 */

import FirecrawlApp from '@mendable/firecrawl-js';

// JSON Schema for Firecrawl LLM extraction — mirrors the acquire payload shape.
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    page: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        metaDescription: { type: 'string' },
        h1: { type: 'string' },
        breadcrumb: { type: 'array', items: { type: 'string' } },
        aboveTheFoldContent: { type: 'string' },
      },
    },
    commerce: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['B2C', 'B2B', 'Hybrid'] },
        platform: { type: 'string' },
        priceTransparency: { type: 'string', enum: ['public', 'hidden', 'partial'] },
        loginRequired: { type: 'boolean' },
        contractPricingVisible: { type: 'boolean' },
      },
    },
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          price: { type: 'number' },
          originalPrice: { type: 'number' },
          onSale: { type: 'boolean' },
          salePercent: { type: 'number' },
          stockStatus: { type: 'string' },
          stockWarning: { type: 'string' },
          url: { type: 'string' },
          imageCount: { type: 'number' },
          rating: { type: 'number' },
          reviewCount: { type: 'number' },
          description: { type: 'string' },
          badges: { type: 'array', items: { type: 'string' } },
          b2bIndicators: { type: 'array', items: { type: 'string' } },
          b2cIndicators: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    facets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['checkbox', 'range', 'dropdown', 'list'] },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
          min: { type: 'number' },
          max: { type: 'number' },
          selectedCount: { type: 'number' },
        },
      },
    },
    sort: {
      type: 'object',
      properties: {
        current: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
      },
    },
    navigation: {
      type: 'object',
      properties: {
        topNavItems: { type: 'array', items: { type: 'string' } },
        hasFilterPanel: { type: 'boolean' },
        filterPanelPosition: { type: 'string', enum: ['left', 'top', 'right'] },
        hasStickyNav: { type: 'boolean' },
        hasSearchBar: { type: 'boolean' },
        breadcrumbPresent: { type: 'boolean' },
      },
    },
  },
};

const PDP_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    pricePrimary: { type: 'number' },
    priceOriginal: { type: 'number' },
    imageCount: { type: 'number' },
    hasVideo: { type: 'boolean' },
    rating: { type: 'number' },
    reviewCount: { type: 'number' },
    hasReviews: { type: 'boolean' },
    specTable: {
      type: 'object',
      properties: { present: { type: 'boolean' } },
    },
    specFields: { type: 'array', items: { type: 'string' } },
    crossSellModules: { type: 'boolean' },
    crossSellLabel: { type: 'string' },
    crossSellProductCount: { type: 'number' },
    ctaText: { type: 'string' },
    badges: { type: 'array', items: { type: 'string' } },
  },
};

let _client = null;
function getClient() {
  if (!_client) {
    _client = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return _client;
}

/**
 * Acquire page data via Firecrawl.
 * Returns a Firecrawl-shaped object consumed by mapFirecrawlToAcquirePayload().
 * Analytics/performance fields are null — Firecrawl doesn't intercept network traffic.
 *
 * @param {string} url
 * @returns {Promise<object>}
 */
/**
 * Scrape a PDP via Firecrawl LLM extraction.
 * Returns the same shape as scrapePdp() in scraper.js so scrapePdpForAcquire() can consume it.
 *
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function scrapePdpWithFirecrawl(url) {
  const client = getClient();
  const result = await client.scrapeUrl(url, {
    formats: ['extract'],
    extract: { schema: PDP_EXTRACT_SCHEMA },
    timeout: 30000,
  });

  if (!result.success) {
    throw new Error(`Firecrawl PDP scrape failed: ${result.error || 'unknown error'}`);
  }

  const e = result.extract || {};
  return {
    title: e.title || '',
    description: e.description || null,
    pricePrimary: e.pricePrimary || null,
    priceOriginal: e.priceOriginal || null,
    imageCount: e.imageCount || 0,
    hasVideo: e.hasVideo || false,
    rating: e.rating || null,
    reviewCount: e.reviewCount || 0,
    hasReviews: e.hasReviews || (e.reviewCount > 0),
    hasReviewSchema: false,
    specTable: e.specTable || { present: false },
    specFields: e.specFields || [],
    crossSellModules: e.crossSellModules || false,
    crossSellLabel: e.crossSellLabel || null,
    crossSellProductCount: e.crossSellProductCount || null,
    ctaText: e.ctaText || '',
    badges: e.badges || [],
  };
}

export async function acquireWithFirecrawl(url) {
  const client = getClient();

  // Primary scrape: structured extraction + desktop screenshot
  const desktopResult = await client.scrapeUrl(url, {
    formats: ['extract', 'screenshot'],
    extract: { schema: EXTRACT_SCHEMA },
    timeout: 60000,
  });

  if (!desktopResult.success) {
    throw new Error(`Firecrawl scrape failed: ${desktopResult.error || 'unknown error'}`);
  }

  // Mobile screenshot: best-effort, failure is non-fatal
  let mobileScreenshotB64 = null;
  try {
    const mobileResult = await client.scrapeUrl(url, {
      formats: ['screenshot'],
      mobile: true,
      timeout: 30000,
    });
    if (mobileResult.success && mobileResult.screenshot) {
      mobileScreenshotB64 = mobileResult.screenshot;
    }
  } catch {
    // Non-fatal — will produce MOBILE_RENDER_FAILED warning downstream
  }

  const extracted = desktopResult.extract || {};

  return {
    url,
    scraper: 'firecrawl',
    page: extracted.page || {},
    commerce: extracted.commerce || {},
    products: extracted.products || [],
    facets: extracted.facets || [],
    sort: extracted.sort || null,
    navigation: extracted.navigation || {},
    desktopScreenshotB64: desktopResult.screenshot || null,
    mobileScreenshotB64,
    // Analytics/performance not available via Firecrawl
    analytics: null,
    performance: null,
  };
}

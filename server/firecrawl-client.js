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

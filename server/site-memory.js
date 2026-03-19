/**
 * Site Memory
 * Persistent per-domain knowledge store. Remembers quirks, timing, selectors,
 * and notes learned about a site across sessions.
 *
 * Data is stored as JSON files in a user-writable directory:
 *   - Default: ~/.merch-connector/data/
 *   - Override: set MERCH_CONNECTOR_DATA_DIR env var
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scrubEndpointPattern } from './network-intel.js';

const DATA_DIR = process.env.MERCH_CONNECTOR_DATA_DIR
  || path.join(os.homedir(), '.merch-connector', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function domainToFilename(domain) {
  return domain.replace(/[^a-zA-Z0-9.-]/g, '_') + '.json';
}

function getFilePath(domain) {
  return path.join(DATA_DIR, domainToFilename(domain));
}

/**
 * Load memory for a domain. Returns {} if none exists.
 */
export function loadMemory(domain) {
  const filePath = getFilePath(domain);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save/merge memory for a domain.
 */
export function saveMemory(domain, updates) {
  const existing = loadMemory(domain);
  const merged = {
    ...existing,
    ...updates,
    lastUpdated: new Date().toISOString(),
    domain,
  };
  fs.writeFileSync(getFilePath(domain), JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Get all stored site memories (for listing).
 */
export function listMemories() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        return { domain: data.domain, lastUpdated: data.lastUpdated, notes: data.notes || [] };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Delete memory for a domain.
 */
export function deleteMemory(domain) {
  const filePath = getFilePath(domain);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// ─── Snapshot helpers (normalized, diff-friendly) ────────────────────────────

function normalizeSnapshot(scrapeResult) {
  return {
    products: (scrapeResult.products || []).map((p) => ({
      title: p.title,
      price: p.price,
      stockStatus: p.stockStatus,
    })),
    facetNames: (scrapeResult.facets || []).map((f) => f.name),
    productCount: (scrapeResult.products || []).length,
    b2bMode: scrapeResult.b2bMode || null,
    sortOptions: scrapeResult.sortOptions?.options?.map((o) => o.label) || [],
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Store a normalized snapshot of scrape output for this domain.
 * Call this after every scrape to establish / refresh the baseline.
 */
export function takeSnapshot(domain, scrapeResult) {
  const snapshot = normalizeSnapshot(scrapeResult);
  saveMemory(domain, { snapshot });
  return snapshot;
}

/**
 * Diff current scrape against the stored snapshot.
 * Returns null if no baseline snapshot exists yet.
 */
export function diffSnapshot(domain, scrapeResult) {
  const memory = loadMemory(domain);
  const prev = memory.snapshot;
  if (!prev) return null;

  const curr = normalizeSnapshot(scrapeResult);

  const prevByTitle = new Map(prev.products.map((p) => [p.title, p]));
  const currByTitle = new Map(curr.products.map((p) => [p.title, p]));

  const newProducts     = curr.products.filter((p) => !prevByTitle.has(p.title)).map((p) => p.title);
  const removedProducts = prev.products.filter((p) => !currByTitle.has(p.title)).map((p) => p.title);
  const priceChanges    = curr.products
    .filter((p) => prevByTitle.has(p.title) && prevByTitle.get(p.title).price !== p.price && p.price)
    .map((p) => ({ title: p.title, was: prevByTitle.get(p.title).price, now: p.price }));

  const prevFacets = new Set(prev.facetNames);
  const currFacets = new Set(curr.facetNames);
  const facetsAdded   = [...currFacets].filter((f) => !prevFacets.has(f));
  const facetsRemoved = [...prevFacets].filter((f) => !currFacets.has(f));

  const sortAdded   = curr.sortOptions.filter((s) => !prev.sortOptions.includes(s));
  const sortRemoved = prev.sortOptions.filter((s) => !curr.sortOptions.includes(s));

  const hasChanges = newProducts.length > 0 || removedProducts.length > 0
    || priceChanges.length > 0 || facetsAdded.length > 0 || facetsRemoved.length > 0
    || sortAdded.length > 0 || sortRemoved.length > 0;

  return {
    hasChanges,
    baselineAt: prev.snapshotAt,
    productCount: { was: prev.productCount, now: curr.productCount },
    newProducts,
    removedProducts,
    priceChanges,
    facets: { added: facetsAdded, removed: facetsRemoved },
    sortOptions: { added: sortAdded, removed: sortRemoved },
    b2bMode: prev.b2bMode !== curr.b2bMode ? { was: prev.b2bMode, now: curr.b2bMode } : null,
  };
}

/**
 * Auto-learn from a scrape result — store timing, structural selectors,
 * and any detected quirks.
 */
export function learnFromScrape(domain, scrapeResult) {
  const existing = loadMemory(domain);

  // Build persistent networkIntel from scrape result
  let networkIntelUpdate = existing.networkIntel || null;
  const intelFromScrape = scrapeResult.networkIntel;
  if (intelFromScrape) {
    // Merge detected platform IDs (deduplicated)
    const prevPlatforms = (existing.networkIntel && existing.networkIntel.platforms) || [];
    const newPlatformIds = (intelFromScrape.platforms || []).map((p) => (typeof p === 'string' ? p : p.id));
    const mergedPlatforms = [...new Set([...prevPlatforms, ...newPlatformIds])];

    // Scrub and persist discovered API endpoint patterns
    const prevEndpoints = (existing.networkIntel && existing.networkIntel.apiEndpoints) || [];
    const newEndpoints = [];
    if (intelFromScrape.bestApiSource && intelFromScrape.platforms.length > 0) {
      const bestPlatform = intelFromScrape.platforms.find(
        (p) => (typeof p === 'object' ? p.id : p) === intelFromScrape.bestApiSource
      );
      if (bestPlatform && typeof bestPlatform === 'object' && bestPlatform.detectedAt) {
        const scrubbed = scrubEndpointPattern(bestPlatform.detectedAt);
        if (!prevEndpoints.includes(scrubbed)) newEndpoints.push(scrubbed);
      }
    }
    const mergedEndpoints = [...new Set([...prevEndpoints, ...newEndpoints])].slice(0, 20);

    // Collect GTM/GA identifiers from dataLayer
    const prevDlPlatforms = (existing.networkIntel && existing.networkIntel.dataLayerPlatforms) || [];
    const newDlPlatforms = [];
    if (intelFromScrape.dataLayer) {
      const dl = intelFromScrape.dataLayer;
      if (dl.gtmContainers) newDlPlatforms.push(...dl.gtmContainers);
      if (dl.gaProperties) newDlPlatforms.push(...dl.gaProperties);
    }
    const mergedDlPlatforms = [...new Set([...prevDlPlatforms, ...newDlPlatforms])].slice(0, 30);

    networkIntelUpdate = {
      platforms: mergedPlatforms,
      apiEndpoints: mergedEndpoints,
      dataLayerPlatforms: mergedDlPlatforms,
      lastUpdated: new Date().toISOString(),
    };
  }

  const learned = {
    // Structural fingerprint
    structure: scrapeResult.structure || existing.structure,

    // Performance baseline
    performance: scrapeResult.performance || existing.performance,

    // Facet availability
    facetNames: (scrapeResult.facets || []).map((f) => f.name),

    // How many products it typically returns
    typicalProductCount: scrapeResult.products?.length || existing.typicalProductCount,

    // Track scrape history
    scrapeCount: (existing.scrapeCount || 0) + 1,
    lastScrapedUrl: scrapeResult.url,
    lastScrapedAt: new Date().toISOString(),

    // Network intelligence (persisted across sessions)
    ...(networkIntelUpdate ? { networkIntel: networkIntelUpdate } : {}),
  };

  return saveMemory(domain, learned);
}

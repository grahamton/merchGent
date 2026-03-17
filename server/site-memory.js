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

/**
 * Auto-learn from a scrape result — store timing, structural selectors,
 * and any detected quirks.
 */
export function learnFromScrape(domain, scrapeResult) {
  const existing = loadMemory(domain);

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
  };

  return saveMemory(domain, learned);
}

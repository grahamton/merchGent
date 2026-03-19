/**
 * merch-connector — MCP Server
 *
 * Gives any agent eyes on a storefront:
 *   audit_storefront    → scrape + AI analysis in one shot (supports persona lens)
 *   scrape_page         → raw structured extraction only (badges, sort, B2B score, change detection)
 *   interact_with_page  → multi-step search/click flows then extract
 *   compare_storefronts → structured diff of two storefront URLs (facets, trust signals, perf)
 *   ask_page            → scrape + free-form Q&A
 *   site_memory         → persistent per-domain memory
 *   clear_session       → reset stored session (cookies + page cache) for a domain
 *   merch_roundtable    → multi-persona debate (Floor Walker + Auditor + Scout + Moderator)
 *
 * Session state (cookies + page cache) is stored per-domain and auto-managed.
 * Scraped page data is cached for 10 minutes — subsequent AI tools reuse it without re-scraping.
 * Connect via stdio (Claude Desktop, Claude Code MCP config, etc.)
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../.env', import.meta.url), quiet: true });
import { readFileSync } from 'fs';
const { version: PKG_VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { scrapePage, interactWithPage, isValidHttpUrl } from './scraper.js';
import { analyzePage, askPage, analyzeAsFloorWalker, analyzeAsAuditor, analyzeAsAuditorB2B, analyzeAsScout, runRoundtable, validatePriceBuckets, compareStorefronts } from './analyzer.js';
import { loadMemory, saveMemory, learnFromScrape, listMemories, deleteMemory, takeSnapshot, diffSnapshot } from './site-memory.js';

// ─── Session store (cookies + page cache, keyed by domain) ───────────────────
//
// Structure: domain → { cookies: cookie[], pages: Map(url → { data, cachedAt }), personas: Map(key → { data, cachedAt }) }
// clear_session wipes cookies, cached pages, and persona results for a domain in one call.
// Persona cache key: `${url}::${personaName}` — reused by roundtable to skip re-running personas
// that were already computed by a recent audit_storefront call.

const sessions = new Map();
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function getSession(domain) {
  if (!sessions.has(domain)) sessions.set(domain, { cookies: [], pages: new Map(), personas: new Map() });
  return sessions.get(domain);
}

function getCachedPersona(url, personaName) {
  const domain = getDomain(url);
  if (!domain) return null;
  const key = `${url}::${personaName}`;
  const entry = getSession(domain).personas.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PAGE_CACHE_TTL_MS) {
    getSession(domain).personas.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedPersona(url, personaName, data) {
  const domain = getDomain(url);
  if (!domain) return;
  const key = `${url}::${personaName}`;
  getSession(domain).personas.set(key, { data, cachedAt: Date.now() });
}

function getSessionCookies(url) {
  const domain = getDomain(url);
  return domain ? getSession(domain).cookies : [];
}

function saveSessionCookies(url, cookies) {
  const domain = getDomain(url);
  if (!domain || !cookies?.length) return;

  const session = getSession(domain);
  const merged = new Map();
  for (const c of session.cookies) merged.set(`${c.name}|${c.domain}|${c.path}`, c);
  for (const c of cookies) merged.set(`${c.name}|${c.domain}|${c.path}`, c);
  session.cookies = [...merged.values()];
}

function getCachedPage(url) {
  const domain = getDomain(url);
  if (!domain) return null;
  const entry = getSession(domain).pages.get(url);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PAGE_CACHE_TTL_MS) {
    getSession(domain).pages.delete(url);
    return null;
  }
  return entry.data;
}

function setCachedPage(url, data) {
  const domain = getDomain(url);
  if (domain) getSession(domain).pages.set(url, { data, cachedAt: Date.now() });
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────
//
// AI-dependent tools (audit, ask, roundtable) are wrapped with a configurable
// timeout. On expiry the error message guides the model to use scrape_page first.

const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS || '120000', 10);
// Roundtable runs 4 sequential AI calls — give it 4× the base timeout.
const ROUNDTABLE_TIMEOUT_MS = parseInt(process.env.ROUNDTABLE_TIMEOUT_MS || String(TOOL_TIMEOUT_MS * 4), 10);

function withTimeout(promise, label, timeoutMs = TOOL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(
          `${label} timed out after ${timeoutMs / 1000}s. ` +
          'For slower models, try calling scrape_page first and then ask_page with a specific question.'
        )),
        timeoutMs
      )
    ),
  ]);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'audit_storefront',
    description:
      'Scrape a product listing or PDP URL and run a full merchandising audit. ' +
      'Returns a diagnosis, 4-dimension audit matrix (Trust / Guidance / Persuasion / Friction), ' +
      'standards checks, and prioritized recommendations. Attaches a screenshot for visual analysis. ' +
      'Reuses cached page data if scrape_page was called on the same URL within the last 10 minutes — no re-scrape needed. ' +
      'Session cookies are stored automatically — subsequent calls to the same domain reuse the session.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full http/https URL of the page to audit.',
        },
        depth: {
          type: 'number',
          description: 'Pages of pagination to follow (1 = current page only, max 5). Default: 1.',
        },
        max_products: {
          type: 'number',
          description: 'Max products to extract per page. Default: 10.',
        },
        persona: {
          type: 'string',
          enum: ['floor_walker', 'auditor', 'scout', 'b2b_auditor'],
          description: 'Optional: run the audit through a specific persona lens instead of the default analyst. "floor_walker" gives a shopper-experience take, "auditor" runs a structured framework evaluation, "scout" provides competitive/strategic analysis, "b2b_auditor" evaluates the page for B2B procurement buyers (steps-to-PO, spec completeness, pricing transparency, self-serve viability).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'scrape_page',
    description:
      'Extract raw structured data from any storefront URL without running AI analysis. ' +
      'Returns product catalog (title, price, stock, CTA, description, B2B/B2C signals), ' +
      'facets/filters, page metadata, performance timing, data layer contents, and interactable elements. ' +
      'Also intercepts XHR/fetch network responses to fingerprint the commerce platform (Algolia, Elasticsearch, SFCC, Shopify, etc.), ' +
      'extract structured product and facet data directly from APIs when confidence is high, ' +
      'and parse dataLayer/digitalData ecommerce events (GA4, GTM, Adobe, Segment). ' +
      'Results are cached for 10 minutes — calling audit_storefront or ask_page on the same URL afterward will reuse this data. ' +
      'Session cookies are managed automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full http/https URL to scrape.',
        },
        depth: {
          type: 'number',
          description: 'Pages of pagination to follow (1 = current page only, max 5). Default: 1.',
        },
        max_products: {
          type: 'number',
          description: 'Max products to extract per page. Default: 10.',
        },
        include_screenshot: {
          type: 'boolean',
          description: 'Set true to include a base64 JPEG screenshot. Default: false.',
        },
        mobile_screenshot: {
          type: 'boolean',
          description: 'Also capture a 390×844 (iPhone 14) mobile viewport screenshot. Returned as a second image. Default: false.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'interact_with_page',
    description:
      'Execute one or more search/click actions on a storefront page in sequence, then return the resulting page data. ' +
      'Accepts a single action or an array for multi-step flows (e.g. search → filter → click). ' +
      'Session cookies are carried over automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full http/https URL to load.',
        },
        actions: {
          type: 'array',
          description: 'Ordered list of actions to execute. Use this for multi-step flows.',
          items: {
            type: 'object',
            properties: {
              action:   { type: 'string', enum: ['search', 'click'] },
              selector: { type: 'string', description: 'CSS selector. Required for "click"; optional for "search".' },
              value:    { type: 'string', description: 'Text to type. Required for "search".' },
            },
            required: ['action'],
          },
        },
        action: {
          type: 'string',
          enum: ['search', 'click'],
          description: 'Single-action shorthand. Ignored when "actions" array is provided.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for single-action shorthand.',
        },
        value: {
          type: 'string',
          description: 'Text to type for single-action shorthand.',
        },
        include_screenshot: {
          type: 'boolean',
          description: 'Include a base64 JPEG screenshot of the result page.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'compare_storefronts',
    description:
      'Scrape two storefront URLs and return a structured side-by-side diff: ' +
      'product count delta, facet gaps (what site B has that A doesn\'t and vice versa), ' +
      'trust signal coverage (ratings, reviews, badges), sort option gaps, B2B mode, and performance delta. ' +
      'Reuses cached page data if either URL was scraped in the last 10 minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        url_a: { type: 'string', description: 'First storefront URL (your site or baseline).' },
        url_b: { type: 'string', description: 'Second storefront URL (competitor or variant).' },
        max_products: { type: 'number', description: 'Max products per page. Default: 10.' },
      },
      required: ['url_a', 'url_b'],
    },
  },
  {
    name: 'ask_page',
    description:
      'Ask any natural language question about a storefront page. ' +
      'The AI sees the full product data, facets, performance metrics, and a screenshot. ' +
      'If scrape_page was called on this URL within the last 10 minutes, the cached data is reused — no re-scrape. ' +
      'Use this for ad-hoc questions like "which products are on sale?", "can users filter by size?", ' +
      '"what\'s the average price?", or "is this page fast enough?". ' +
      'Tip: for slow or local AI models, call scrape_page first, then ask_page — the scrape will be reused.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full http/https URL to scrape and ask about.',
        },
        question: {
          type: 'string',
          description: 'Your question about the page, in plain language.',
        },
        depth: {
          type: 'number',
          description: 'Pages of pagination to scrape first (default 1).',
        },
        max_products: {
          type: 'number',
          description: 'Max products per page (default 10).',
        },
      },
      required: ['url', 'question'],
    },
  },
  {
    name: 'clear_session',
    description:
      'Clear the stored session for a domain — wipes both cookies and cached page data. ' +
      'Use this to start fresh (e.g., test logged-out vs logged-in experience, or force a fresh scrape).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Any URL on the domain to clear (e.g., "https://www.zappos.com").',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'site_memory',
    description:
      'Read, write, or list persistent memory about websites. ' +
      'Memory auto-accumulates on every scrape (structure, performance, facets). ' +
      'Use this to add custom notes ("this site needs 5s wait for lazy load", ' +
      '"products use .wat-product-tile selector", "requires login cookies for pricing"). ' +
      'Memory persists across sessions and server restarts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list', 'delete'],
          description: '"read" a domain\'s memory, "write" a note, "list" all remembered sites, or "delete" a domain\'s memory.',
        },
        url: {
          type: 'string',
          description: 'Any URL on the domain (required for read/write/delete).',
        },
        note: {
          type: 'string',
          description: 'A note to add when action is "write". Will be appended to existing notes.',
        },
        key: {
          type: 'string',
          description: 'Optional key to set a specific field (e.g., "waitTime", "customSelector"). Used with "write".',
        },
        value: {
          type: 'string',
          description: 'Value for the key. Used with "write" when "key" is provided.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'merch_roundtable',
    description:
      'Run a multi-perspective merchandising analysis using three expert personas (Floor Walker, Auditor, Scout) ' +
      'that independently evaluate the page, then debate their findings to produce a consensus. ' +
      'The Floor Walker reacts as a real shopper, the Auditor evaluates against a structured framework, ' +
      'and the Scout analyzes competitive positioning. A moderator then synthesizes all three views into ' +
      'prioritized recommendations with endorsements from each persona. ' +
      'Reuses cached page data if scrape_page was called on the same URL within the last 10 minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL of the page to analyze.',
        },
        depth: {
          type: 'number',
          description: 'Pages of pagination to follow (1-5, default 1).',
        },
        max_products: {
          type: 'number',
          description: 'Max products to extract per page (default 10).',
        },
      },
      required: ['url'],
    },
  },
];

// ─── Shared output builder ───────────────────────────────────────────────────

function buildPageOutput(result) {
  const { screenshotBuffer, mobileScreenshotBuffer, cookies, ...rest } = result;

  const domain = getDomain(rest.url);

  // Diff against stored snapshot before updating it
  let changes = null;
  if (domain) {
    try { changes = diffSnapshot(domain, rest); } catch { /* non-fatal */ }
    try { takeSnapshot(domain, rest); } catch { /* non-fatal */ }
    try { learnFromScrape(domain, rest); } catch { /* non-fatal */ }
  }

  // Include any stored memory for this domain
  const memory = domain ? loadMemory(domain) : {};

  return {
    url: rest.url,
    scrapedAt: new Date().toISOString(),
    title: rest.title,
    metaDescription: rest.metaDescription,
    structure: rest.structure,
    performance: rest.performance,
    productsFound: rest.products.length,
    pagesScraped: rest.pagesScraped || 1,
    b2bMode: rest.b2bMode || null,
    b2bConflictScore: rest.b2bConflictScore ?? null,
    sortOptions: rest.sortOptions || null,
    dataSource: rest.dataSource || 'dom',
    products: rest.products,
    facets: rest.facets || [],
    findings: rest.findings,
    interactables: rest.interactables,
    dataLayersDetected: Object.keys(rest.dataLayers || {}),
    networkIntel: rest.networkIntel
      ? {
          platforms: rest.networkIntel.platforms || [],
          apiCount: rest.networkIntel.apiCount || 0,
          bestApiSource: rest.networkIntel.bestApiSource || null,
          dataLayer: rest.networkIntel.dataLayer || null,
        }
      : undefined,
    siteMemory: Object.keys(memory).length > 0
      ? { scrapeCount: memory.scrapeCount, notes: memory.notes, customFields: memory.customFields }
      : undefined,
    priceBucketAnalysis: validatePriceBuckets(rest) || undefined,
    changes: changes || undefined,
  };
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleAuditStorefront({ url, depth = 1, max_products = 10, persona }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  let pageData = getCachedPage(url);
  if (!pageData) {
    const cookies = getSessionCookies(url);
    pageData = await scrapePage(url, cookies, depth, max_products);
    saveSessionCookies(url, pageData.cookies);
    setCachedPage(pageData.url, pageData);
  } else {
    sendLog('debug', `Using cached page data for ${url}`, { tool: 'audit_storefront' });
  }

  const memory = getDomain(url) ? loadMemory(getDomain(url)) : {};

  // Resolve the canonical persona name used for cache keys (matches runRoundtable keys)
  const personaKey = persona || 'default';

  let analysis = getCachedPersona(url, personaKey);
  if (analysis) {
    sendLog('debug', `Using cached ${personaKey} persona result for ${url}`, { tool: 'audit_storefront' });
  } else {
    if (persona === 'floor_walker') {
      analysis = await analyzeAsFloorWalker(pageData, pageData.screenshotBuffer, memory);
    } else if (persona === 'auditor') {
      analysis = await analyzeAsAuditor(pageData, pageData.screenshotBuffer, memory);
    } else if (persona === 'scout') {
      analysis = await analyzeAsScout(pageData, pageData.screenshotBuffer, memory);
    } else if (persona === 'b2b_auditor') {
      analysis = await analyzeAsAuditorB2B(pageData, pageData.screenshotBuffer, memory);
    } else {
      analysis = await analyzePage(pageData, pageData.screenshotBuffer);
    }
    setCachedPersona(url, personaKey, analysis);
  }

  const output = buildPageOutput(pageData);
  return { ...output, audit: analysis, ...(persona ? { persona } : {}) };
}

async function handleScrapePage({ url, depth = 1, max_products = 10, include_screenshot = false, mobile_screenshot = false }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  const cookies = getSessionCookies(url);
  const result = await scrapePage(url, cookies, depth, max_products, mobile_screenshot);
  saveSessionCookies(url, result.cookies);
  setCachedPage(result.url, result);

  const content = [{ type: 'text', text: JSON.stringify(buildPageOutput(result), null, 2) }];

  if (include_screenshot && result.screenshotBuffer) {
    content.push({ type: 'image', data: result.screenshotBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }
  if (mobile_screenshot && result.mobileScreenshotBuffer) {
    content.push({ type: 'image', data: result.mobileScreenshotBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return content;
}

async function handleInteractWithPage({ url, actions, action, selector, value, include_screenshot = false }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  // Normalize: accept either `actions` array or legacy single-action params
  const steps = actions ?? [{ action, selector, value }];
  if (!steps[0]?.action) throw new Error('Provide either "actions" array or "action" string.');

  const cookies = getSessionCookies(url);
  const result = await interactWithPage(url, steps, cookies);
  saveSessionCookies(result.url, result.cookies);
  setCachedPage(result.url, result);

  const output = buildPageOutput(result);
  output.originalUrl = url;
  output.actionsExecuted = result.actionsExecuted;

  const content = [{ type: 'text', text: JSON.stringify(output, null, 2) }];

  if (include_screenshot && result.screenshotBuffer) {
    content.push({ type: 'image', data: result.screenshotBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return content;
}

async function handleCompareStorefronts({ url_a, url_b, max_products = 10 }) {
  if (!isValidHttpUrl(url_a)) throw new Error(`Invalid URL A: "${url_a}"`);
  if (!isValidHttpUrl(url_b)) throw new Error(`Invalid URL B: "${url_b}"`);

  const [pageDataA, pageDataB] = await Promise.all([
    (async () => {
      let data = getCachedPage(url_a);
      if (!data) {
        data = await scrapePage(url_a, getSessionCookies(url_a), 1, max_products);
        saveSessionCookies(data.url, data.cookies);
        setCachedPage(data.url, data);
      }
      return data;
    })(),
    (async () => {
      let data = getCachedPage(url_b);
      if (!data) {
        data = await scrapePage(url_b, getSessionCookies(url_b), 1, max_products);
        saveSessionCookies(data.url, data.cookies);
        setCachedPage(data.url, data);
      }
      return data;
    })(),
  ]);

  const comparison = compareStorefronts(pageDataA, pageDataB);
  return [{ type: 'text', text: JSON.stringify(comparison, null, 2) }];
}

async function handleAskPage({ url, question, depth = 1, max_products = 10 }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);
  if (!question?.trim()) throw new Error('A question is required.');

  let result = getCachedPage(url);
  if (!result) {
    const cookies = getSessionCookies(url);
    result = await scrapePage(url, cookies, depth, max_products);
    saveSessionCookies(url, result.cookies);
    setCachedPage(result.url, result);
  } else {
    sendLog('debug', `Using cached page data for ${url}`, { tool: 'ask_page' });
  }

  const answer = await askPage(result, question, result.screenshotBuffer);
  return [{ type: 'text', text: answer }];
}

function handleSiteMemory({ action, url, note, key, value }) {
  if (action === 'list') {
    const memories = listMemories();
    if (memories.length === 0) return [{ type: 'text', text: 'No site memories stored yet.' }];
    return [{ type: 'text', text: JSON.stringify(memories, null, 2) }];
  }

  const domain = getDomain(url);
  if (!domain) throw new Error(`Cannot extract domain from: "${url}"`);

  if (action === 'read') {
    const memory = loadMemory(domain);
    if (Object.keys(memory).length === 0) return [{ type: 'text', text: `No memory stored for ${domain}.` }];
    return [{ type: 'text', text: JSON.stringify(memory, null, 2) }];
  }

  if (action === 'write') {
    const existing = loadMemory(domain);

    if (key && value !== undefined) {
      const customFields = existing.customFields || {};
      customFields[key] = value;
      saveMemory(domain, { customFields });
      return [{ type: 'text', text: `Set ${domain}.${key} = "${value}"` }];
    }

    if (note) {
      const notes = existing.notes || [];
      notes.push({ text: note, addedAt: new Date().toISOString() });
      saveMemory(domain, { notes });
      return [{ type: 'text', text: `Note added for ${domain}: "${note}"` }];
    }

    throw new Error('Provide either "note" or "key"+"value" when writing.');
  }

  if (action === 'delete') {
    const deleted = deleteMemory(domain);
    return [{ type: 'text', text: deleted ? `Memory deleted for ${domain}.` : `No memory to delete for ${domain}.` }];
  }

  throw new Error(`Unknown action: "${action}". Use read, write, list, or delete.`);
}

async function handleRoundtable({ url, depth = 1, max_products = 10 }, extra) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  let pageData = getCachedPage(url);
  if (!pageData) {
    const cookies = getSessionCookies(url);
    pageData = await scrapePage(url, cookies, depth, max_products);
    saveSessionCookies(url, pageData.cookies);
    setCachedPage(pageData.url, pageData);
  } else {
    sendLog('debug', `Using cached page data for ${url}`, { tool: 'merch_roundtable' });
  }

  const memory = getDomain(url) ? loadMemory(getDomain(url)) : {};

  const progressToken = extra?._meta?.progressToken;
  const onProgress = async (progress, total, message, personaData = null) => {
    // Always emit a progress notification if a token was provided
    if (progressToken !== undefined) {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: { progressToken, progress, total, message },
      }).catch(() => {});
    }
    // Emit the persona result immediately so clients can display it without waiting
    if (personaData) {
      sendLog('info', `[roundtable] ${message}`, {
        type: 'roundtable_persona_result',
        progress,
        total,
        ...personaData,
      });
    }
  };

  // Pull any persona results already computed by prior audit_storefront calls this session
  const cached = {
    floor_walker: getCachedPersona(url, 'floor_walker'),
    auditor:      getCachedPersona(url, 'auditor'),
    scout:        getCachedPersona(url, 'scout'),
  };
  const cachedCount = Object.values(cached).filter(Boolean).length;
  if (cachedCount > 0) {
    sendLog('debug', `Reusing ${cachedCount}/3 cached persona result(s) for ${url}`, { tool: 'merch_roundtable' });
  }

  const result = await runRoundtable(pageData, pageData.screenshotBuffer, memory, onProgress, cached);

  // Cache any newly computed personas for future calls
  if (!cached.floor_walker && result.perspectives?.floorWalker) setCachedPersona(url, 'floor_walker', result.perspectives.floorWalker);
  if (!cached.auditor && result.perspectives?.auditor)           setCachedPersona(url, 'auditor', result.perspectives.auditor);
  if (!cached.scout && result.perspectives?.scout)               setCachedPersona(url, 'scout', result.perspectives.scout);

  return result;
}

function handleClearSession({ url }) {
  const domain = getDomain(url);
  if (!domain) throw new Error(`Cannot extract domain from: "${url}"`);
  const had = sessions.has(domain);
  sessions.delete(domain);
  return [{ type: 'text', text: had ? `Session cleared for ${domain}.` : `No session stored for ${domain}.` }];
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'merch-connector', version: PKG_VERSION },
  { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } }
);

// ─── Logging helper ───────────────────────────────────────────────────────────

function sendLog(level, message, data = {}) {
  server.notification({
    method: 'notifications/message',
    params: { level, logger: 'merch-connector', data: { message, ...data } },
  }).catch(() => { /* ignore if client doesn't support logging */ });
}

// ─── MCP Prompts ──────────────────────────────────────────────────────────────

const PROMPT_DEFS = [
  {
    name: 'floor-walker',
    description: 'Evaluate a storefront page from a real shopper\'s perspective — frustrations, confusion, and missed moments.',
    promptFile: 'floor-walker.md',
    arguments: [],
  },
  {
    name: 'auditor',
    description: 'Run a structured B2C merchandising audit using the Trust / Guidance / Persuasion / Friction framework.',
    promptFile: 'auditor.md',
    arguments: [],
  },
  {
    name: 'auditor-b2b',
    description: 'Evaluate a page for B2B procurement buyers: steps-to-PO, spec completeness, pricing transparency.',
    promptFile: 'auditor-b2b.md',
    arguments: [],
  },
  {
    name: 'scout',
    description: 'Analyze the page from a VP of Merchandising lens — competitive positioning and strategic gaps.',
    promptFile: 'scout.md',
    arguments: [],
  },
  {
    name: 'merch-roundtable',
    description: 'Run a full multi-persona roundtable (Floor Walker + Auditor + Scout + Moderator) for a storefront URL.',
    promptFile: 'roundtable-moderator.md',
    arguments: [
      { name: 'url', description: 'Full https URL of the storefront page to analyze.', required: true },
    ],
  },
];

function readPromptFile(filename) {
  return readFileSync(new URL(`./prompts/${filename}`, import.meta.url), 'utf8');
}

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPT_DEFS.map(({ name, description, arguments: args }) => ({ name, description, arguments: args })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const def = PROMPT_DEFS.find((p) => p.name === name);
  if (!def) throw new Error(`Unknown prompt: "${name}"`);

  let text = readPromptFile(def.promptFile);

  if (name === 'merch-roundtable' && args?.url) {
    text = `Analyze the following storefront URL using all three personas (Floor Walker, Auditor, Scout) and synthesize their findings:\n\nURL: ${args.url}\n\n---\n\n${text}`;
  }

  return {
    description: def.description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
});

// ─── MCP Resources ────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const memories = listMemories();
  return {
    resources: memories.map(({ domain, lastUpdated }) => ({
      uri: `merch-memory://${domain}`,
      name: `${domain} site memory`,
      description: `Persistent merchandising knowledge for ${domain}. Last updated: ${lastUpdated || 'unknown'}.`,
      mimeType: 'application/json',
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const match = uri.match(/^merch-memory:\/\/(.+)$/);
  if (!match) throw new Error(`Unsupported resource URI: "${uri}"`);

  const domain = match[1];
  const memory = loadMemory(domain);
  if (Object.keys(memory).length === 0) throw new Error(`No memory stored for domain: "${domain}"`);

  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(memory, null, 2),
    }],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    sendLog('info', `Tool called: ${name}`);
    switch (name) {
      case 'audit_storefront': {
        const result = await withTimeout(handleAuditStorefront(args), 'audit_storefront');
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'scrape_page':
        return { content: await handleScrapePage(args) };
      case 'interact_with_page':
        return { content: await handleInteractWithPage(args) };
      case 'compare_storefronts':
        return { content: await withTimeout(handleCompareStorefronts(args), 'compare_storefronts') };
      case 'ask_page':
        return { content: await withTimeout(handleAskPage(args), 'ask_page') };
      case 'site_memory':
        return { content: handleSiteMemory(args) };
      case 'merch_roundtable': {
        const result = await withTimeout(handleRoundtable(args, extra), 'merch_roundtable', ROUNDTABLE_TIMEOUT_MS);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'clear_session':
        return { content: handleClearSession(args) };
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    sendLog('error', `Tool error in ${name}: ${err.message}`);
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

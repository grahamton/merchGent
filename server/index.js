/**
 * merch-connector — MCP Server
 *
 * Gives any agent eyes on a storefront:
 *   audit_storefront   → scrape + AI analysis in one shot (supports persona lens)
 *   scrape_page        → raw structured extraction only
 *   interact_with_page → search/click then extract
 *   ask_page           → scrape + free-form Q&A
 *   site_memory        → persistent per-domain memory
 *   clear_session      → reset stored cookies for a domain
 *   merch_roundtable   → multi-persona debate (Floor Walker + Auditor + Scout + Moderator)
 *
 * Session cookies are stored per-domain and auto-merged on subsequent calls.
 * Connect via stdio (Claude Desktop, Claude Code MCP config, etc.)
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../.env', import.meta.url), quiet: true });
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { scrapePage, interactWithPage, isValidHttpUrl } from './scraper.js';
import { analyzePage, askPage, analyzeAsFloorWalker, analyzeAsAuditor, analyzeAsAuditorB2B, analyzeAsScout, runRoundtable, validatePriceBuckets } from './analyzer.js';
import { loadMemory, saveMemory, learnFromScrape, listMemories, deleteMemory } from './site-memory.js';

// ─── Session store (cookie jar keyed by domain) ──────────────────────────────

const sessions = new Map(); // domain → cookie[]

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function getSessionCookies(url) {
  const domain = getDomain(url);
  return domain ? (sessions.get(domain) || []) : [];
}

function saveSessionCookies(url, cookies) {
  const domain = getDomain(url);
  if (!domain || !cookies?.length) return;

  const existing = sessions.get(domain) || [];
  // Merge: newer cookies overwrite by name+domain+path
  const merged = new Map();
  for (const c of existing) merged.set(`${c.name}|${c.domain}|${c.path}`, c);
  for (const c of cookies) merged.set(`${c.name}|${c.domain}|${c.path}`, c);
  sessions.set(domain, [...merged.values()]);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'audit_storefront',
    description:
      'Scrape a product listing or PDP URL and run a full merchandising audit. ' +
      'Returns a diagnosis, 4-dimension audit matrix (Trust / Guidance / Persuasion / Friction), ' +
      'standards checks, and prioritized recommendations. Attaches a screenshot for visual analysis. ' +
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
      },
      required: ['url'],
    },
  },
  {
    name: 'interact_with_page',
    description:
      'Perform a search or click action on a storefront page, then return the resulting page data. ' +
      'Useful for navigating paginated results, triggering search queries, or following a CTA. ' +
      'Session cookies are carried over automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full http/https URL to load.',
        },
        action: {
          type: 'string',
          enum: ['search', 'click'],
          description: '"search" types a query and submits. "click" clicks a CSS selector.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector. Required for "click"; optional for "search".',
        },
        value: {
          type: 'string',
          description: 'Text to type. Required for "search".',
        },
        include_screenshot: {
          type: 'boolean',
          description: 'Include a base64 JPEG screenshot of the result page.',
        },
      },
      required: ['url', 'action'],
    },
  },
  {
    name: 'ask_page',
    description:
      'Scrape a page and then ask any natural language question about it. ' +
      'The AI sees the full product data, facets, performance metrics, and a screenshot. ' +
      'Use this for ad-hoc questions like "which products are on sale?", "can users filter by size?", ' +
      '"what\'s the average price?", or "is this page fast enough?".',
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
      'Clear stored session cookies for a domain. Use this to start fresh (e.g., test logged-out vs logged-in experience).',
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
      'prioritized recommendations with endorsements from each persona.',
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
  const { screenshotBuffer, cookies, ...rest } = result;

  // Auto-learn from every scrape
  const domain = getDomain(rest.url);
  if (domain) {
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
    products: rest.products,
    facets: rest.facets || [],
    findings: rest.findings,
    interactables: rest.interactables,
    dataLayersDetected: Object.keys(rest.dataLayers || {}),
    siteMemory: Object.keys(memory).length > 0
      ? { scrapeCount: memory.scrapeCount, notes: memory.notes, customFields: memory.customFields }
      : undefined,
    priceBucketAnalysis: validatePriceBuckets(rest) || undefined,
  };
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleAuditStorefront({ url, depth = 1, max_products = 10, persona }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  const cookies = getSessionCookies(url);
  const pageData = await scrapePage(url, cookies, depth, max_products);
  saveSessionCookies(url, pageData.cookies);

  const memory = getDomain(url) ? loadMemory(getDomain(url)) : {};

  let analysis;
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

  const output = buildPageOutput(pageData);
  return { ...output, audit: analysis, ...(persona ? { persona } : {}) };
}

async function handleScrapePage({ url, depth = 1, max_products = 10, include_screenshot = false }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);

  const cookies = getSessionCookies(url);
  const result = await scrapePage(url, cookies, depth, max_products);
  saveSessionCookies(url, result.cookies);

  const content = [{ type: 'text', text: JSON.stringify(buildPageOutput(result), null, 2) }];

  if (include_screenshot && result.screenshotBuffer) {
    content.push({ type: 'image', data: result.screenshotBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return content;
}

async function handleInteractWithPage({ url, action, selector, value, include_screenshot = false }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);
  if (action === 'search' && !value) throw new Error('"value" required for search.');
  if (action === 'click' && !selector) throw new Error('"selector" required for click.');

  const cookies = getSessionCookies(url);
  const result = await interactWithPage(url, action, selector, value, cookies);
  saveSessionCookies(result.url, result.cookies);

  const output = buildPageOutput(result);
  output.originalUrl = url;
  output.action = action;

  const content = [{ type: 'text', text: JSON.stringify(output, null, 2) }];

  if (include_screenshot && result.screenshotBuffer) {
    content.push({ type: 'image', data: result.screenshotBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return content;
}

async function handleAskPage({ url, question, depth = 1, max_products = 10 }) {
  if (!isValidHttpUrl(url)) throw new Error(`Invalid URL: "${url}"`);
  if (!question?.trim()) throw new Error('A question is required.');

  const cookies = getSessionCookies(url);
  const result = await scrapePage(url, cookies, depth, max_products);
  saveSessionCookies(url, result.cookies);

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
      // Set a custom field
      const customFields = existing.customFields || {};
      customFields[key] = value;
      saveMemory(domain, { customFields });
      return [{ type: 'text', text: `Set ${domain}.${key} = "${value}"` }];
    }

    if (note) {
      // Append a note
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

  const cookies = getSessionCookies(url);
  const pageData = await scrapePage(url, cookies, depth, max_products);
  saveSessionCookies(url, pageData.cookies);

  const memory = getDomain(url) ? loadMemory(getDomain(url)) : {};

  const progressToken = extra?._meta?.progressToken;
  const onProgress = progressToken !== undefined
    ? async (progress, total, message) => {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken, progress, total, message },
        });
      }
    : null;

  const result = await runRoundtable(pageData, pageData.screenshotBuffer, memory, onProgress);
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
  { name: 'merch-connector', version: '1.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'audit_storefront': {
        const result = await handleAuditStorefront(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'scrape_page':
        return { content: await handleScrapePage(args) };
      case 'interact_with_page':
        return { content: await handleInteractWithPage(args) };
      case 'ask_page':
        return { content: await handleAskPage(args) };
      case 'site_memory':
        return { content: handleSiteMemory(args) };
      case 'merch_roundtable': {
        const result = await handleRoundtable(args, extra);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'clear_session':
        return { content: handleClearSession(args) };
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

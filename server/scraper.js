/**
 * Scraper
 * Puppeteer-based page extraction. Exports pure async functions — no Express.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  interceptNetworkRequests,
  analyzeNetworkResponses,
  extractFromBestApi,
  parseDataLayers,
  scrubEndpointPattern,
} from './network-intel.js';

puppeteer.use(StealthPlugin());

export const isValidHttpUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// ─── Browser singleton ────────────────────────────────────────────────────────

const BrowserManager = {
  browser: null,
  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
      });
    }
    return this.browser;
  },
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  },
};

process.on('exit', () => BrowserManager.closeBrowser());
process.on('SIGINT', () => BrowserManager.closeBrowser());
process.on('SIGTERM', () => BrowserManager.closeBrowser());

// ─── Structural detection ─────────────────────────────────────────────────────

const detectStructure = async (page) => {
  return await page.evaluate(() => {
    const stableSelectors = [
      '[data-automation^="product-card-"]',
      '[data-test-id="product-card"]',
      '[itemprop="itemListElement"]',
      '.product-tile',
      '.product-item',
      '[class*="product-card"]',
    ];

    for (const selector of stableSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 2) {
        return {
          gridSelector: elements[0].parentElement
            ? elements[0].parentElement.className
              ? `.${CSS.escape(elements[0].parentElement.className.split(/\s+/)[0])}`
              : elements[0].parentElement.tagName
            : null,
          cardSelector: selector,
          confidence: 100,
        };
      }
    }

    const scoreElement = (el) => {
      let score = 0;
      const text = el.innerText;
      if (el.querySelector('img')) score += 5;
      if (/(\$|USD|EUR|GBP|JPY)/.test(text)) score += 5;
      if (/Add to Cart|Add to Quote|View Details/i.test(text)) score += 3;
      if (el.tagName === 'BODY' || el.tagName === 'MAIN') score -= 100;
      return score;
    };

    let bestGrid = null;
    let maxScore = 0;
    let bestChildSelector = null;

    for (const el of document.querySelectorAll('div, ul, section, main')) {
      const children = Array.from(el.children).filter(
        (c) => c.tagName === 'DIV' || c.tagName === 'LI' || c.tagName === 'ARTICLE'
      );
      if (children.length < 3) continue;

      const classCounts = {};
      children.forEach((c) => {
        const cls = c.className.trim();
        if (cls) classCounts[cls] = (classCounts[cls] || 0) + 1;
      });

      const dominant = Object.keys(classCounts).reduce(
        (a, b) => (classCounts[a] > classCounts[b] ? a : b),
        ''
      );

      if (classCounts[dominant] > children.length * 0.5) {
        const sample = children.find((c) => c.className.trim() === dominant);
        const totalScore = children.length * scoreElement(sample);
        if (totalScore > maxScore) {
          maxScore = totalScore;
          bestGrid = el;
          const tag = sample.tagName.toLowerCase();
          const classes = dominant.split(/\s+/).filter(Boolean).map((c) => `.${CSS.escape(c)}`).join('');
          bestChildSelector = classes ? `${tag}${classes}` : tag;
        }
      }
    }

    return {
      gridSelector: bestGrid
        ? bestGrid.className
          ? Array.from(bestGrid.classList).map((c) => `.${CSS.escape(c)}`).join('')
          : bestGrid.tagName
        : null,
      cardSelector: bestChildSelector,
      confidence: maxScore,
    };
  });
};

// ─── Facet / filter extraction ────────────────────────────────────────────────

const extractFacets = async (page) => {
  return await page.evaluate(() => {
    const facets = [];

    // Strategy 1: stable selectors used by major platforms
    const stableFacetSelectors = [
      '[data-automation*="facet"]',
      '[data-testid*="filter"]',
      '[data-testid*="facet"]',
      '.facet-group',
      '.filter-group',
      '.refinement',
      '[class*="facet"]',
      '[class*="filter-section"]',
      '[class*="refinement"]',
      // BEM c- prefix (Insight.com and similar enterprise storefronts)
      '[class*="c-facet"]',
      '[class*="c-filter"]',
      '[class*="c-refinement"]',
    ];

    for (const sel of stableFacetSelectors) {
      const groups = document.querySelectorAll(sel);
      if (groups.length > 0) {
        groups.forEach((group) => {
          // Skip parent containers that wrap multiple filter groups — only process leaf groups.
          // A container matching a selector but containing >1 heading is a sidebar wrapper, not a facet.
          const innerHeadings = group.querySelectorAll('h2, h3, h4, legend');
          if (innerHeadings.length > 1) return;

          const heading = group.querySelector('h2, h3, h4, legend, [class*="title"], [class*="heading"], [class*="label"]');
          let name = heading?.innerText?.trim() || '';
          if (!name) name = group.getAttribute('aria-label') || '';
          if (!name) name = group.getAttribute('data-facet') || group.getAttribute('data-filter-name') || group.getAttribute('data-testid') || group.getAttribute('data-label') || '';
          if (!name) {
            const parent = group.parentElement;
            if (parent) {
              const sibling = parent.querySelector('h2, h3, h4, legend');
              if (sibling && sibling !== group) name = sibling.innerText?.trim() || '';
            }
          }
          if (!name) name = group.getAttribute('title') || '';
          if (!name) name = 'Unknown Facet';

          const checkboxes = group.querySelectorAll('input[type="checkbox"], input[type="radio"]');
          const links = checkboxes.length === 0 ? group.querySelectorAll('a, button') : [];
          const swatches = group.querySelectorAll('[class*="swatch"], [class*="color-"]');

          let type = 'list';
          if (checkboxes.length > 0) type = 'checkbox';
          else if (swatches.length > 0) type = 'swatch';
          else if (group.querySelector('input[type="range"]')) type = 'range';

          const optionEls = Array.from(checkboxes.length > 0 ? checkboxes : links.length > 0 ? links : swatches)
            .filter((el) => {
              const text = (el.innerText || el.value || '').trim().toLowerCase();
              return text !== 'go' && el.type !== 'submit';
            });

          const options = optionEls.slice(0, 15).map((el) => {
            const label = el.getAttribute('aria-label')
              || el.closest('label')?.innerText?.trim()
              || el.innerText?.trim()
              || '';
            const checked = el.checked || el.getAttribute('aria-selected') === 'true'
              || el.classList.contains('selected') || el.classList.contains('active');
            return { label: label.slice(0, 60), selected: !!checked };
          }).filter((o) => o.label.length > 0);

          if (options.length > 0) {
            facets.push({ name, type, optionCount: options.length, options, selectedCount: options.filter((o) => o.selected).length });
          }
        });
        if (facets.length > 0) return facets;
      }
    }

    // Strategy 2: heuristic — find sidebar/nav with repeated checkboxes or link groups.
    // Uses heading-to-heading tree walking so obfuscated-class sites (Zappos, etc.) are
    // segmented correctly instead of collapsing all filter labels into one fake facet.
    // Candidate list also covers Shopify filter forms (form > details) and generic filter
    // containers that lack aside/nav/sidebar class names (Allbirds, many Headless Shopify sites).
    const candidates = document.querySelectorAll([
      'aside',
      'nav',
      '[role="navigation"]',
      '[class*="sidebar"]',
      '[class*="left-nav"]',
      'form[action*="filter"]',
      'form[id*="filter"]',
      'form[class*="filter"]',
      '[class*="FilterPanel"]',
      '[class*="filter-panel"]',
      '[class*="facet-panel"]',
      '[class*="FacetPanel"]',
    ].join(', '));
    for (const sidebar of candidates) {
      const headings = Array.from(sidebar.querySelectorAll('h2, h3, h4, legend, summary'));
      if (headings.length < 2) continue; // single heading → not a filter sidebar

      headings.forEach((heading, idx) => {
        const name = heading.innerText?.trim();
        if (!name || name.length > 40) return;

        const nextHeading = headings[idx + 1] || null;

        // Try a tight container first (details/fieldset wrapping just this group)
        let tightContainer = heading.closest('details, fieldset');
        if (tightContainer && nextHeading && tightContainer.contains(nextHeading)) {
          tightContainer = null; // too broad
        }

        let items = [];
        if (tightContainer) {
          items = Array.from(tightContainer.querySelectorAll('input[type="checkbox"], li a, label'));
        } else {
          // Walk the DOM tree in order, collecting interactive elements between
          // this heading and the next one — works regardless of CSS class names.
          const root = heading.parentElement || sidebar;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
          let node = walker.nextNode();
          let collecting = false;
          while (node) {
            if (node === heading) { collecting = true; node = walker.nextNode(); continue; }
            if (nextHeading && node === nextHeading) break;
            if (collecting && ['INPUT', 'A', 'LABEL', 'BUTTON'].includes(node.tagName)) {
              items.push(node);
            }
            node = walker.nextNode();
          }
        }

        if (items.length < 2) return;

        const options = items.slice(0, 15).map((el) => ({
          label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
          selected: !!el.checked || el.classList.contains('selected'),
        })).filter((o) => o.label.length > 0 && o.label !== name);

        if (options.length >= 2) {
          facets.push({ name, type: 'list', optionCount: options.length, options, selectedCount: options.filter((o) => o.selected).length });
        }
      });
      if (facets.length > 0) break; // first productive sidebar wins
    }

    // Strategy 3: Shopify <details> filter groups (Allbirds, many Headless Shopify storefronts).
    // Each filter group is a standalone <details> element with a <summary> label and
    // <input type="checkbox"> / <label> children — no shared sidebar container needed.
    if (facets.length === 0) {
      const detailsGroups = Array.from(document.querySelectorAll('details')).filter((d) => {
        const inputs = d.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        return inputs.length >= 2;
      });
      for (const details of detailsGroups) {
        const summary = details.querySelector('summary');
        const name = summary?.innerText?.trim() || details.getAttribute('aria-label') || '';
        if (!name || name.length > 60) continue;
        const inputs = Array.from(details.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
        const options = inputs.slice(0, 15).map((inp) => {
          const label = inp.closest('label') || document.querySelector(`label[for="${inp.id}"]`);
          return {
            label: (label?.innerText || inp.getAttribute('aria-label') || inp.value || '').trim().slice(0, 60),
            selected: inp.checked,
          };
        }).filter((o) => o.label.length > 0 && o.label !== name);
        if (options.length >= 2) {
          facets.push({ name, type: 'list', optionCount: options.length, options, selectedCount: options.filter((o) => o.selected).length });
        }
      }
    }

    return facets;
  });
};

// ─── B2B/B2C signal scoring ───────────────────────────────────────────────────

/**
 * Compute a machine-readable B2B/B2C conflict score from scraped products.
 * Exported so callers can branch on it without re-scraping.
 *
 * @param {Array} products - Products array from extractPageData
 * @returns {{ b2bConflictScore: number, b2bMode: 'B2B'|'B2C'|'Hybrid' }}
 */
export function computeB2BSignals(products) {
  const total = products.length;
  if (total === 0) return { b2bConflictScore: 0, b2bMode: 'B2C' };

  const b2bCount = products.filter((p) => p.b2bIndicators?.length > 0).length;
  const b2cCount = products.filter((p) => p.b2cIndicators?.length > 0).length;
  const bothCount = products.filter((p) => p.b2bIndicators?.length > 0 && p.b2cIndicators?.length > 0).length;
  const b2bConflictScore = Math.round((bothCount / total) * 100);

  let b2bMode;
  if (b2bConflictScore >= 30) {
    b2bMode = 'Hybrid';
  } else if (b2bCount > b2cCount && b2bCount / total >= 0.5) {
    b2bMode = 'B2B';
  } else {
    b2bMode = 'B2C';
  }

  return { b2bConflictScore, b2bMode };
}

/**
 * Detect products that don't belong in the page's category context.
 * Uses URL path segments + page title/h1 to infer expected category,
 * then flags products whose titles match known anti-keyword lists.
 *
 * @param {object[]} products - extracted products array
 * @param {string} url - page URL
 * @param {string} pageTitle - page <title> or <h1> text
 * @returns {{ detected: boolean, suspectCount: number, suspects: object[] }}
 */
export function detectCategoryContamination(products, url, pageTitle) {
  if (!products?.length) return { detected: false, suspectCount: 0, suspects: [] };

  // Extract category signal words from URL + title
  const IGNORE_WORDS = new Set([
    'shop', 'product', 'products', 'category', 'en_us', 'en_gb', 'www',
    'http', 'https', 'com', 'net', 'org', 'html', 'aspx', 'php',
    'the', 'and', 'for', 'with', 'new', 'sale', 'buy', 'best',
    'page', 'view', 'all', 'items', 'results', 'search',
  ]);

  const urlTokens = (url || '')
    .toLowerCase()
    .split(/[/?=&#+_\-./]/)
    .filter(t => t.length > 2 && !IGNORE_WORDS.has(t) && !/^\d+$/.test(t));

  const titleTokens = (pageTitle || '')
    .toLowerCase()
    .split(/\s+|[-/|]/)
    .filter(t => t.length > 2 && !IGNORE_WORDS.has(t));

  const categorySignals = new Set([...urlTokens, ...titleTokens]);

  // Category family → anti-keywords (products that don't belong)
  // Keyed by signal word → array of title keywords that indicate contamination
  const ANTI_KEYWORDS = {
    laptop:   ['ddr4', 'ddr5', 'dimm', 'sodimm', 'ram ', 'memory module', 'hard drive', 'hdd', 'ssd', 'graphics card', 'gpu', 'video card', 'power supply', 'psu', 'cpu cooler', 'case fan'],
    laptops:  ['ddr4', 'ddr5', 'dimm', 'sodimm', 'ram ', 'memory module', 'hard drive', 'hdd', 'ssd', 'graphics card', 'gpu', 'video card', 'power supply', 'psu', 'cpu cooler', 'case fan'],
    monitor:  ['keyboard', 'mouse', 'headset', 'webcam', 'speaker'],
    monitors: ['keyboard', 'mouse', 'headset', 'webcam', 'speaker'],
    keyboard: ['monitor', 'headset', 'webcam', 'graphics card'],
    printer:  ['laptop', 'desktop', 'monitor', 'keyboard'],
    printers: ['laptop', 'desktop', 'monitor', 'keyboard'],
    shoe:     ['jacket', 'pants', 'shirt', 'hat', 'bag'],
    shoes:    ['jacket', 'pants', 'shirt', 'hat', 'bag'],
    shirt:    ['shoe', 'boots', 'sneaker', 'sandal'],
    shirts:   ['shoe', 'boots', 'sneaker', 'sandal'],
  };

  // Find which anti-keyword lists apply based on detected category signals
  const activeAntiKeywords = [];
  for (const signal of categorySignals) {
    if (ANTI_KEYWORDS[signal]) {
      activeAntiKeywords.push(...ANTI_KEYWORDS[signal]);
    }
  }

  if (activeAntiKeywords.length === 0) {
    return { detected: false, suspectCount: 0, suspects: [] };
  }

  const suspects = [];
  products.forEach((product, index) => {
    const titleLower = (product.title || '').toLowerCase();
    for (const antiKw of activeAntiKeywords) {
      if (titleLower.includes(antiKw)) {
        suspects.push({
          index,
          title: product.title,
          reason: `Title contains "${antiKw}" which is unexpected in a "${[...categorySignals].slice(0, 3).join('/')}" category`,
        });
        break; // one match per product is enough
      }
    }
  });

  return {
    detected: suspects.length > 0,
    suspectCount: suspects.length,
    suspects,
  };
}

// ─── Sort order extraction ────────────────────────────────────────────────────

const extractSortOptions = async (page) => {
  return await page.evaluate(() => {
    const SORT_LABEL_RE = /sort|order\s+by|display/i;
    const SORT_OPTION_RE = /relevance|featured|best\s*sell|top\s*rat|price|newest|popular|review|recommend/i;

    // Strategy 1: <select> whose label or id/name mentions "sort"
    for (const sel of document.querySelectorAll('select')) {
      const id = sel.id || sel.name || '';
      const label = document.querySelector(`label[for="${id}"]`)?.innerText || '';
      const ariaLabel = sel.getAttribute('aria-label') || '';
      if (!SORT_LABEL_RE.test(id + label + ariaLabel)) continue;

      const options = Array.from(sel.options).map((o) => ({
        label: o.text.trim(),
        value: o.value,
        selected: o.selected,
      })).filter((o) => o.label.length > 0);

      if (options.length > 1) {
        const current = options.find((o) => o.selected) || options[0];
        return { type: 'select', current: current.label, options };
      }
    }

    // Strategy 2: stable data-* and aria sort patterns
    const stableSortSelectors = [
      '[data-automation*="sort"]',
      '[data-testid*="sort"]',
      '[data-test*="sort"]',
      '[aria-label*="sort" i]',
      '[class*="sort-by"]',
      '[class*="sortby"]',
      '[class*="sort-options"]',
    ];
    for (const sel of stableSortSelectors) {
      const container = document.querySelector(sel);
      if (!container) continue;

      const items = Array.from(container.querySelectorAll('a, button, li, option, [role="option"], [role="menuitem"]'))
        .filter((el) => el.innerText?.trim().length > 0 && el.innerText.trim().length < 60);

      if (items.length < 2) continue;

      const options = items.map((el) => ({
        label: el.innerText.trim(),
        selected: el.getAttribute('aria-selected') === 'true'
          || el.classList.contains('selected') || el.classList.contains('active')
          || el.getAttribute('aria-current') === 'true',
      }));

      const current = options.find((o) => o.selected)?.label || options[0].label;
      return { type: 'dropdown', current, options: options.map(({ label, selected }) => ({ label, selected })) };
    }

    // Strategy 3: heuristic — find any button/link group whose text matches sort terms
    const allGroups = document.querySelectorAll('ul, [role="listbox"], [role="menu"], [role="tablist"]');
    for (const group of allGroups) {
      const items = Array.from(group.querySelectorAll('li, a, button, [role="option"], [role="tab"]'))
        .filter((el) => el.innerText?.trim().length > 0 && el.innerText.trim().length < 60);
      if (items.length < 2 || items.length > 12) continue;

      const labels = items.map((el) => el.innerText.trim());
      const matchCount = labels.filter((l) => SORT_OPTION_RE.test(l)).length;
      if (matchCount < 2) continue;

      const options = items.map((el) => ({
        label: el.innerText.trim(),
        selected: el.getAttribute('aria-selected') === 'true'
          || el.classList.contains('selected') || el.classList.contains('active'),
      }));

      const current = options.find((o) => o.selected)?.label || null;
      return { type: 'button-group', current, options };
    }

    return null; // no sort UI detected
  });
};

// ─── Page data extraction ─────────────────────────────────────────────────────

const extractPageData = async (page, maxProducts = 10) => {
  const title = await page.title();
  const metaDescription = await page.evaluate(
    () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
  );

  try {
    await page.waitForSelector(
      '[data-automation^="product-card-"], .product-tile, .result-item, .card',
      { timeout: 15000 }
    );
  } catch {
    // proceed with whatever is rendered
  }

  const structure = await detectStructure(page);
  const [facets, sortOptions] = await Promise.all([extractFacets(page), extractSortOptions(page)]);

  const intelligence = await page.evaluate(() => {
    const getDataLayer = () => {
      const layers = {};
      if (window.dataLayer) layers.dataLayer = window.dataLayer;
      if (window.digitalData) layers.digitalData = window.digitalData;
      if (window.utag_data) layers.utag_data = window.utag_data;
      return layers;
    };

    const getInteractables = () =>
      Array.from(document.querySelectorAll('a, button, input[type="submit"], [role="button"]'))
        .slice(0, 50)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;
          return {
            type: el.tagName.toLowerCase(),
            text: (el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 50).trim(),
            selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
            href: (el.href || '').slice(0, 100),
          };
        })
        .filter((item) => item && item.text.length > 2);

    const getFindings = () => {
      const findings = [];
      const ts = new Date().toISOString();

      const missingAlt = document.querySelectorAll('img:not([alt]), img[alt=""]');
      if (missingAlt.length > 5) {
        findings.push({
          severity: 'warning',
          category: 'accessibility',
          title: 'High Volume of Missing Alt Text',
          description: `${missingAlt.length} images without alt text.`,
          timestamp: ts,
        });
      }

      const emptyLinks = document.querySelectorAll('a[href=""], a:not([href])');
      if (emptyLinks.length > 0) {
        findings.push({
          severity: 'warning',
          category: 'technical',
          title: 'Empty/Broken Links',
          description: `${emptyLinks.length} anchor tags with no href.`,
          timestamp: ts,
        });
      }

      const text = document.body.innerText;
      if (/Login for Pricing/i.test(text) && /Add to Cart/i.test(text)) {
        findings.push({
          severity: 'info',
          category: 'merch',
          title: 'Hybrid B2B/B2C Signals',
          description: 'Page has both "Login for Pricing" and "Add to Cart" CTAs.',
          timestamp: ts,
        });
      }

      return findings;
    };

    const getBreadcrumb = () => {
      const items = document.querySelectorAll(
        '[aria-label="breadcrumb"] a, [aria-label="breadcrumb"] span, [aria-label="breadcrumb"] li, ' +
        '.breadcrumb a, .breadcrumb span, .breadcrumb li, ' +
        '[class*="breadcrumb"] a, [class*="breadcrumb"] span, ' +
        '[itemtype*="BreadcrumbList"] [itemprop="name"], ' +
        'nav ol li a, nav ol li span'
      );
      const separators = /^[>\/\\|»›\-–·•]+$/;
      const seen = new Set();
      const result = [];
      for (const el of items) {
        const text = el.innerText.trim();
        if (!text || separators.test(text) || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
      }
      return result.slice(0, 8);
    };
    const getReturnPolicyVisible = () =>
      /free returns|return policy|easy returns|30.?day return/i.test(document.body.innerText);

    return { dataLayers: getDataLayer(), interactables: getInteractables(), findings: getFindings(), breadcrumb: getBreadcrumb(), returnPolicyVisible: getReturnPolicyVisible() };
  });

  const products = await page.evaluate(({ cardSelector, maxProducts, b2bKeywords, b2cKeywords }) => {
    const fallback = '.product-tile, .result-item, .card, .product-item';
    const selector = cardSelector || fallback;
    const elements = Array.from(document.querySelectorAll(selector));

    const descSelectors = [
      '.product-description', '.product-summary', '.description', '.summary',
      '[class*="description"]', '[class*="summary"]',
    ];

    return elements.slice(0, maxProducts).map((el) => {
      const img = el.querySelector('img');
      const link = el.querySelector('h1 a, h2 a, h3 a, .title a') || el.querySelector('a');
      const button = el.querySelector('button, input[type="submit"], a[class*="btn"]');
      const rawText = el.innerText;

      const titleEl = el.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
      const title = titleEl?.innerText?.trim() || link?.innerText || img?.alt || 'Unknown Product';

      const priceEl = el.querySelector('.price, .amount, span[class*="price"], div[class*="price"]');
      const priceMatch = (rawText.match(/(\$|USD|EUR|GBP|JPY)\s?\d+([.,]\d{2})?/) || [])[0];
      const priceText = priceEl ? (priceEl.innerText?.trim() || priceMatch || null) : priceMatch || null;
      const price = priceText || (/Call for Price|Login for Pricing|See Price/i.test(rawText) ? 'Hidden/Action Required' : null);

      const stockEl = el.querySelector('.stock, .availability, [class*="stock"], [class*="availability"]');
      const stockStatus = stockEl
        ? (stockEl.innerText?.trim() || 'Unknown')
        : (/In Stock|Out of Stock|Backorder/i.test(rawText)
            ? (rawText.match(/In Stock|Out of Stock|Backorder/i) || [])[0]
            : 'Unknown');

      const ctaText =
        button?.innerText?.trim() ||
        (rawText.match(/Add to Cart|Add to Quote|View Details|Buy Now/i) || [])[0] ||
        'View Details';

      const descEl = descSelectors.map((s) => el.querySelector(s)).find(Boolean);
      const description = descEl ? descEl.innerText.trim().slice(0, 240) : null;

      const b2bIndicators = b2bKeywords.filter((kw) => new RegExp(kw, 'i').test(rawText));
      const b2cIndicators = b2cKeywords.filter((kw) => new RegExp(kw, 'i').test(rawText));

      // ── Badge & trust signal extraction ──────────────────────────────────────
      const ratingEl = el.querySelector(
        '[class*="rating"], [class*="star"], [aria-label*="rating"], [itemprop="ratingValue"]'
      );
      let starRating = null;
      if (ratingEl) {
        const ratingText = ratingEl.getAttribute('aria-label') || ratingEl.innerText || '';
        const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*\d+|(\d+(?:\.\d+)?)\s*star/i);
        if (ratingMatch) {
          starRating = parseFloat(ratingMatch[1] ?? ratingMatch[2]);
        } else {
          const numMatch = ratingText.match(/\d+(?:\.\d+)?/);
          if (numMatch) starRating = parseFloat(numMatch[0]);
        }
      }

      const reviewEl = el.querySelector('[class*="review"], [class*="rating-count"], [itemprop="reviewCount"]');
      let reviewCount = null;
      if (reviewEl) {
        const reviewMatch = (reviewEl.innerText || '').match(/\d[\d,]*/);
        if (reviewMatch) reviewCount = parseInt(reviewMatch[0].replace(/,/g, ''), 10);
      }
      if (reviewCount === null) {
        const reviewMatch = rawText.match(/(\d[\d,]*)\s*(?:review|rating|customer)/i);
        if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
      }

      const badgeEls = el.querySelectorAll(
        '[class*="badge"], [class*="label"], [class*="tag"], [class*="flag"], [class*="sticker"], [class*="banner"]'
      );
      const badgeTexts = Array.from(badgeEls)
        .map((b) => b.innerText?.trim() ?? '')
        .filter((t) => t.length > 0 && t.length < 50);

      const bestSeller = /best\s*seller/i.test(rawText) || badgeTexts.some((t) => /best\s*seller/i.test(t));
      const isNew = badgeTexts.some((t) => /^\s*new\s*$/i.test(t)) || /\bnew\s+arrival/i.test(rawText);
      const saleText = (() => {
        for (const t of badgeTexts) {
          if (/sale|save|\d+%\s*off|deal/i.test(t)) return t;
        }
        const m = rawText.match(/(\d+%\s*off|save\s+\$[\d.]+|\bsale\b)/i);
        return m ? m[0] : null;
      })();

      const stockWarning = (() => {
        const m = rawText.match(/only\s+\d+\s+left|low\s+stock|limited\s+(?:stock|quantity)|selling\s+fast/i);
        return m ? m[0].trim() : null;
      })();

      const sustainabilityKeywords = ['eco-friendly', 'sustainable', 'carbon neutral', 'recycled', 'organic', 'fair trade'];
      const sustainabilityLabel = (() => {
        for (const kw of sustainabilityKeywords) {
          if (new RegExp(kw, 'i').test(rawText)) {
            return badgeTexts.find((t) => new RegExp(kw, 'i').test(t)) || kw;
          }
        }
        return null;
      })();

      const trustSignals = {
        starRating,
        reviewCount,
        bestSeller,
        isNew,
        onSale: saleText !== null,
        saleText,
        stockWarning,
        sustainabilityLabel,
        badges: badgeTexts.slice(0, 8),
      };

      return {
        title, price, stockStatus,
        url: link?.href || null,
        imageAlt: img?.alt || null,
        imageSrc: img?.src || null,
        imageCount: el.querySelectorAll('img').length,
        ctaText, description, b2bIndicators, b2cIndicators, trustSignals,
      };
    });
  }, {
    cardSelector: structure.cardSelector,
    maxProducts,
    b2bKeywords: ['Request Quote', 'Get Quote', 'Login for Pricing', 'Login to see price', 'Contract Pricing', 'Contract price', 'Account price', 'Account pricing', 'Your price', 'Bulk Order', 'Wholesale', 'Volume Pricing', 'Volume discount', 'MOQ', 'Net 30', 'Net 60', 'PO Number', 'Purchase Order', 'Call for price', 'Tax exempt', 'RFQ', 'Punch-out', 'Requisition'],
    b2cKeywords: ['Add to Cart', 'Add to Bag', 'Buy Now', 'Free Shipping', 'Ships free', 'Free Returns', 'Gift', 'Wishlist', 'Save for Later'],
  });

  const { b2bConflictScore, b2bMode } = computeB2BSignals(products);

  // Category contamination detection
  const h1 = await page.$eval('h1', el => el.innerText.trim()).catch(() => '');
  const pageTitle = h1 || await page.title().catch(() => '');
  const contamination = detectCategoryContamination(products, page.url(), pageTitle);

  return { title, metaDescription, h1, products, structure, facets, sortOptions, b2bConflictScore, b2bMode, contamination, ...intelligence };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape a product listing page.
 * Returns structured page data + a JPEG screenshot buffer.
 *
 * @param {string}  url
 * @param {Array}   cookies
 * @param {number}  depth           - Pages to scrape (1 = current page only, 2+ = follow pagination)
 * @param {number}  maxProducts     - Max products per page (default 10)
 * @param {boolean} mobileScreenshot - Also capture a 390×844 mobile viewport screenshot
 */
export async function scrapePage(url, cookies = [], depth = 1, maxProducts = 10, mobileScreenshot = false) {
  if (!isValidHttpUrl(url)) throw new Error('Invalid URL — must be http or https.');

  let page;
  try {
    const browser = await BrowserManager.getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    if (cookies.length > 0) {
      try { await page.setCookie(...cookies); } catch { /* non-fatal */ }
    }

    // Set up network interception BEFORE navigation so no responses are missed
    try { await interceptNetworkRequests(page); } catch { /* non-fatal */ }

    // Inject paint timing observer before navigation — entries fire early and may be missed post-load
    await page.evaluateOnNewDocument(() => {
      window.__paintTimings = {};
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__paintTimings[entry.name] = entry.startTime;
          }
        }).observe({ type: 'paint', buffered: true });
      } catch (e) { /* non-fatal */ }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, Math.random() * 1000 + 1000));

    // Collect network intelligence after page settles
    let networkIntel = { platforms: [], apiCount: 0, dataLayer: null, bestApiSource: null };
    let apiExtraction = null;
    try {
      const [parsedDataLayers, analyzedNetwork] = await Promise.all([
        parseDataLayers(page),
        Promise.resolve(analyzeNetworkResponses(page._networkResponses || [])),
      ]);

      const bestApi = extractFromBestApi(analyzedNetwork, 'plp');
      apiExtraction = bestApi && bestApi.confidence >= 70 ? bestApi : null;

      networkIntel = {
        platforms: analyzedNetwork.platforms || [],
        apiCount: (page._networkResponses || []).length,
        dataLayer: parsedDataLayers,
        bestApiSource: apiExtraction ? apiExtraction.source : null,
      };
    } catch { /* non-fatal — degrade gracefully */ }

    const data = await extractPageData(page, maxProducts);

    // Merge API-sourced products/facets when confidence is high enough
    if (apiExtraction) {
      data.dataSource = 'api';
      if (apiExtraction.products.length > 0) {
        data.products = apiExtraction.products;
      }
      // Merge API facets — replace "Unknown Facet" DOM entries with real names from XHR (MCP-002)
      if (apiExtraction.facets.length > 0) {
        const knownDomFacets = (data.facets || []).filter((f) => f.name !== 'Unknown Facet');
        const hasUnknown = knownDomFacets.length < (data.facets || []).length;
        if (hasUnknown) {
          // DOM facets had no resolvable labels — use API-sourced facets entirely
          const apiNames = new Set(apiExtraction.facets.map((f) => f.name));
          data.facets = [...knownDomFacets.filter((f) => !apiNames.has(f.name)), ...apiExtraction.facets];
        } else {
          const existingNames = new Set(knownDomFacets.map((f) => f.name));
          const newFacets = apiExtraction.facets.filter((f) => !existingNames.has(f.name));
          data.facets = [...(data.facets || []), ...newFacets];
        }
      }
    } else {
      data.dataSource = 'dom';
    }

    data.networkIntel = networkIntel;
    let allProducts = [...data.products];

    // Pagination: follow "next" links for additional pages
    const maxDepth = Math.min(depth, 5); // safety cap
    for (let p = 1; p < maxDepth; p++) {
      const nextLink = await page.evaluate(() => {
        const selectors = [
          'a[aria-label*="Next"]',
          'a[aria-label*="next"]',
          'a.next',
          '[class*="pagination"] a:last-child',
          '[class*="pager"] a:last-child',
          'a[rel="next"]',
          'button[aria-label*="Next"]',
          'button[aria-label*="next"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && (el.href || el.tagName === 'BUTTON')) {
            return { selector: sel, href: el.href || null };
          }
        }
        return null;
      });

      if (!nextLink) break;

      try {
        if (nextLink.href) {
          await page.goto(nextLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          await page.click(nextLink.selector);
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 1500));

        const nextData = await extractPageData(page, maxProducts);
        if (nextData.products.length === 0) break;
        allProducts = allProducts.concat(nextData.products);
      } catch {
        break; // pagination failed, return what we have
      }
    }

    data.products = allProducts;
    const currentCookies = await page.cookies();
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });

    let mobileScreenshotBuffer = null;
    if (mobileScreenshot) {
      // Open a fresh page with mobile UA+viewport set BEFORE navigation so the server
      // serves mobile-specific content (JS bundle, layout) from the start (MCP-005)
      const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
      let mobilePage;
      try {
        mobilePage = await browser.newPage();
        await mobilePage.setUserAgent(mobileUA);
        await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        if (currentCookies.length > 0) {
          try { await mobilePage.setCookie(...currentCookies); } catch { /* non-fatal */ }
        }
        await mobilePage.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        // Dismiss common consent modals (OneTrust, Cookiebot, TrustArc, generic accept buttons)
        // On mobile these often render as full-screen overlays that blank the viewport (MCP-005)
        await mobilePage.evaluate(() => {
          const selectors = [
            '#onetrust-accept-btn-handler',
            '#accept-recommended-btn-handler',
            '[id*="cookie"] button[id*="accept"]',
            '[class*="cookie"] button[class*="accept"]',
            'button[data-cookiebanner="accept_button"]',
            '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
            '.truste_overlay .truste_popframe',
            'button[aria-label*="Accept all" i]',
            'button[aria-label*="Accept"][aria-label*="cookie" i]',
          ];
          for (const sel of selectors) {
            try { document.querySelector(sel)?.click(); } catch { /* ignore */ }
          }
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1200));
        const buf = await mobilePage.screenshot({ type: 'jpeg', quality: 70 });
        // Reject blank white images — a real page at 390x844 quality:70 should exceed 20KB;
        // a pure-white or consent-blocked frame is typically under 5KB
        mobileScreenshotBuffer = buf && buf.length > 20000 ? buf : null;
      } catch { /* non-fatal — mobile screenshot is best-effort */ }
      finally {
        if (mobilePage) await mobilePage.close().catch(() => {});
      }
    }
    const performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const pt = window.__paintTimings || {};
      const paintFallback = performance.getEntriesByType('paint');
      return {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(nav?.loadEventEnd || 0),
        firstPaint: Math.round(pt['first-paint'] || paintFallback.find((p) => p.name === 'first-paint')?.startTime || 0),
        firstContentfulPaint: Math.round(pt['first-contentful-paint'] || paintFallback.find((p) => p.name === 'first-contentful-paint')?.startTime || 0),
        resourceCount: performance.getEntriesByType('resource').length,
      };
    });

    return { url: page.url(), ...data, performance, cookies: currentCookies, screenshotBuffer, mobileScreenshotBuffer, pagesScraped: Math.min(depth, maxDepth) };
  } finally {
    if (page) await page.close();
  }
}

/**
 * Execute one or more actions on a page sequentially, then return the resulting page data.
 *
 * @param {string} url
 * @param {Array}  actions  - Array of { action: 'search'|'click', selector?, value? }
 * @param {Array}  cookies
 */
export async function interactWithPage(url, actions, cookies = []) {
  if (!isValidHttpUrl(url)) throw new Error('Invalid URL — must be http or https.');
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('"actions" must be a non-empty array.');

  for (const step of actions) {
    if (!['search', 'click'].includes(step.action)) throw new Error(`action must be "search" or "click", got "${step.action}".`);
    if (step.action === 'search' && !step.value) throw new Error('"value" required for search action.');
    if (step.action === 'click' && !step.selector) throw new Error('"selector" required for click action.');
  }

  let page;
  try {
    const browser = await BrowserManager.getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    if (cookies.length > 0) {
      try { await page.setCookie(...cookies); } catch { /* non-fatal */ }
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    for (const step of actions) {
      if (step.action === 'search') {
        const searchSel = step.selector || 'input[type="search"], input[name="q"], input[name="search"]';
        await page.waitForSelector(searchSel, { timeout: 5000 });
        await page.type(searchSel, step.value);
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      } else if (step.action === 'click') {
        await page.waitForSelector(step.selector, { timeout: 5000 });
        await page.click(step.selector);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const data = await extractPageData(page);
    const currentCookies = await page.cookies();
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });

    return { url: page.url(), ...data, cookies: currentCookies, screenshotBuffer, actionsExecuted: actions.length };
  } finally {
    if (page) await page.close();
  }
}

/**
 * Scrape a product detail page (PDP).
 * Returns PDP-specific signals: description fill rate, image count, reviews, spec table, cross-sell, etc.
 *
 * @param {string} url
 * @param {Array}  cookies
 */
export async function scrapePdp(url, cookies = []) {
  if (!isValidHttpUrl(url)) throw new Error('Invalid URL — must be http or https.');

  let page;
  try {
    const browser = await BrowserManager.getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    if (cookies.length > 0) {
      try { await page.setCookie(...cookies); } catch { /* non-fatal */ }
    }

    // Inject paint timing observer before navigation — entries fire early and may be missed post-load
    await page.evaluateOnNewDocument(() => {
      window.__paintTimings = {};
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__paintTimings[entry.name] = entry.startTime;
          }
        }).observe({ type: 'paint', buffered: true });
      } catch (e) { /* non-fatal */ }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, Math.random() * 500 + 1000));

    const pdpData = await page.evaluate(() => {
      const productArea = document.querySelector('[class*="product"], [class*="pdp"], main, #product') || document.body;

      // title
      const title = document.querySelector('h1')?.innerText?.trim() || '';

      // description
      const descEl = document.querySelector('[itemprop="description"]');
      let description = descEl?.innerText?.trim() || '';
      if (!description) {
        const paragraphs = Array.from(productArea.querySelectorAll('p'))
          .map((p) => p.innerText?.trim() || '')
          .filter((t) => t.length > 50);
        description = paragraphs.sort((a, b) => b.length - a.length)[0] || '';
      }

      const descriptionFillRate = (!description || description === title || description.length < 30) ? 0 : 1;

      // imageCount
      const imageCount = productArea.querySelectorAll('img').length;

      // reviews
      const reviewContainerEl = document.querySelector('[itemprop="reviewRating"], [class*="star-rating"], #reviews, [class*="review"]');
      let reviewCount = 0;
      const reviewCountEl = document.querySelector('[itemprop="reviewCount"]');
      if (reviewCountEl) {
        reviewCount = parseInt(reviewCountEl.innerText?.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const reviewText = document.body.innerText;
        const m = reviewText.match(/\((\d[\d,]*)\s*reviews?\)/i);
        if (m) reviewCount = parseInt(m[1].replace(/,/g, ''), 10) || 0;
      }
      // Only report hasReviews: true when there is a confirmed count — avoids container-present/count-zero contradiction
      const hasReviews = !!(reviewContainerEl && reviewCount > 0);

      // hasReviewSchema
      let hasReviewSchema = false;
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const data = JSON.parse(s.textContent);
          const check = (obj) => {
            if (!obj) return;
            if (obj.aggregateRating) { hasReviewSchema = true; return; }
            if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(check);
          };
          check(data);
        } catch { /* ignore */ }
      });

      // specTable
      const specEl = document.querySelector('table, dl, [class*="spec"], [class*="specification"]');
      let specRowCount = 0;
      if (specEl) {
        specRowCount = specEl.querySelectorAll('tr, dt, li').length;
      }
      const specTable = { present: specRowCount > 0, rowCount: specRowCount };
      const specFields = specEl ? Array.from(specEl.querySelectorAll('th, dt')).map(el => el.innerText.trim()).filter(Boolean).slice(0, 20) : [];

      // crossSellModules
      const crossSellSection = Array.from(document.querySelectorAll('section, div')).find(el => {
        const heading = el.querySelector('h2, h3, h4');
        return heading && /you may also like|customers also bought|related products|frequently bought/i.test(heading.innerText || '');
      });
      const crossSellModules = crossSellSection
        ? true
        : /you may also like|customers also bought|related products|frequently bought/i.test(document.body.innerText);
      const crossSellLabel = crossSellSection ? (crossSellSection.querySelector('h2, h3, h4')?.innerText?.trim() || null) : null;
      const crossSellProductCount = crossSellSection ? crossSellSection.querySelectorAll('a[href], li').length : null;

      // hasVideo
      const hasVideo = !!(productArea.querySelector('video, [class*="video"], iframe[src*="youtube"], iframe[src*="vimeo"]'));

      // rating
      const ratingEl = document.querySelector('[itemprop="ratingValue"], [class*="rating-value"], [class*="star-rating"]');
      let pdpRating = null;
      if (ratingEl) {
        const ratingText = ratingEl.getAttribute('content') || ratingEl.innerText || '';
        const m = ratingText.match(/(\d+(?:\.\d+)?)/);
        if (m) pdpRating = parseFloat(m[1]);
      }

      // ctaText — class-based selectors are trusted as-is; generic `button` requires text pattern
      const classCtaSels = ['[class*="add-to-cart"]', '[class*="addtocart"]', '[class*="add-to-bag"]'];
      let ctaText = '';
      for (const sel of classCtaSels) {
        const el = document.querySelector(sel);
        if (el) { ctaText = el.innerText?.trim() || ''; break; }
      }
      if (!ctaText) {
        const btns = Array.from(document.querySelectorAll('button'));
        const match = btns.find((b) => /add to (cart|bag)|buy now/i.test(b.innerText || ''));
        if (match) ctaText = match.innerText?.trim() || '';
      }

      // price fields
      let pricePrimary = '';
      let priceOriginal = '';
      const priceEl = document.querySelector('[itemprop="price"], [class*="price-current"], [class*="price__current"], [class*="sale-price"], [class*="our-price"]');
      if (priceEl) pricePrimary = priceEl.innerText?.trim() || '';
      const origEl = document.querySelector('[class*="price-was"], [class*="original-price"], [class*="price__original"], s[class*="price"], del[class*="price"]');
      if (origEl) priceOriginal = origEl.innerText?.trim() || '';
      // Fallback: extract price from CTA text (e.g. "Add to Cart - $100")
      if (!pricePrimary && ctaText) {
        const m = ctaText.match(/[\$£€]\s?\d+(?:[.,]\d{2})?/);
        if (m) pricePrimary = m[0];
      }

      // badges
      const badgeEls = document.querySelectorAll('[class*="badge"], [class*="tag"], [class*="label"], [class*="flag"]');
      const badges = Array.from(badgeEls)
        .map((el) => el.innerText?.trim())
        .filter((t) => t && t.length > 0 && t.length < 40)
        .slice(0, 10);

      return { title, description, descriptionFillRate, imageCount, hasReviews, reviewCount, hasReviewSchema, specTable, specFields, crossSellModules, crossSellLabel, crossSellProductCount, hasVideo, rating: pdpRating, ctaText, pricePrimary, priceOriginal, badges };
    });

    const performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const pt = window.__paintTimings || {};
      const paintFallback = performance.getEntriesByType('paint');
      return {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(nav?.loadEventEnd || 0),
        firstContentfulPaint: Math.round(pt['first-contentful-paint'] || paintFallback.find((p) => p.name === 'first-contentful-paint')?.startTime || 0),
        resourceCount: performance.getEntriesByType('resource').length,
      };
    });

    return { url: page.url(), scrapedAt: new Date().toISOString(), ...pdpData, performance };
  } finally {
    if (page) await page.close();
  }
}

export async function fetchPageSpeed(url) {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const data = await res.json();
    const metrics = data?.lighthouseResult?.audits;
    if (!metrics) return null;
    return {
      performanceScore: Math.round((data.lighthouseResult.categories?.performance?.score ?? 0) * 100),
      lcp: metrics['largest-contentful-paint']?.numericValue ?? null,
      cls: metrics['cumulative-layout-shift']?.numericValue ?? null,
      fid: metrics['max-potential-fid']?.numericValue ?? null,
      fcp: metrics['first-contentful-paint']?.numericValue ?? null,
      ttfb: metrics['server-response-time']?.numericValue ?? null,
    };
  } catch {
    return null;
  }
}

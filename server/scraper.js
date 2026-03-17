/**
 * Scraper
 * Puppeteer-based page extraction. Exports pure async functions — no Express.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

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
        headless: 'new',
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
              ? `.${elements[0].parentElement.className.split(/\s+/)[0]}`
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
          const classes = dominant.split(/\s+/).filter(Boolean).map((c) => `.${c}`).join('');
          bestChildSelector = classes ? `${tag}${classes}` : tag;
        }
      }
    }

    return {
      gridSelector: bestGrid
        ? bestGrid.className
          ? `.${bestGrid.className.split(/\s+/).join('.')}`
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
    ];

    for (const sel of stableFacetSelectors) {
      const groups = document.querySelectorAll(sel);
      if (groups.length > 0) {
        groups.forEach((group) => {
          const heading = group.querySelector('h2, h3, h4, legend, [class*="title"], [class*="heading"], [class*="label"]');
          const name = heading?.innerText?.trim() || 'Unknown Facet';

          const checkboxes = group.querySelectorAll('input[type="checkbox"], input[type="radio"]');
          const links = checkboxes.length === 0 ? group.querySelectorAll('a, button') : [];
          const swatches = group.querySelectorAll('[class*="swatch"], [class*="color-"]');

          let type = 'list';
          if (checkboxes.length > 0) type = 'checkbox';
          else if (swatches.length > 0) type = 'swatch';
          else if (group.querySelector('input[type="range"]')) type = 'range';

          const optionEls = checkboxes.length > 0 ? checkboxes : links.length > 0 ? links : swatches;
          const options = Array.from(optionEls).slice(0, 15).map((el) => {
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

    // Strategy 2: heuristic — find sidebar/nav with repeated checkboxes or link groups
    const candidates = document.querySelectorAll('aside, nav, [role="navigation"], [class*="sidebar"], [class*="left-nav"]');
    for (const sidebar of candidates) {
      const headings = sidebar.querySelectorAll('h2, h3, h4, legend, summary');
      headings.forEach((heading) => {
        const name = heading.innerText?.trim();
        if (!name || name.length > 40) return;

        // Look for the next sibling or parent container with options
        const container = heading.closest('details, fieldset, [class*="facet"], [class*="filter"]')
          || heading.parentElement;
        if (!container) return;

        const items = container.querySelectorAll('input[type="checkbox"], li a, label');
        if (items.length < 2) return;

        const options = Array.from(items).slice(0, 15).map((el) => ({
          label: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
          selected: !!el.checked || el.classList.contains('selected'),
        })).filter((o) => o.label.length > 0 && o.label !== name);

        if (options.length >= 2) {
          facets.push({ name, type: 'list', optionCount: options.length, options, selectedCount: options.filter((o) => o.selected).length });
        }
      });
    }

    return facets;
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
  const facets = await extractFacets(page);

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

    return { dataLayers: getDataLayer(), interactables: getInteractables(), findings: getFindings() };
  });

  const products = await page.evaluate(({ cardSelector, maxProducts }) => {
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
      const priceText = priceEl ? priceEl.innerText.trim() : priceMatch || null;
      const price = priceText || (/Call for Price|Login for Pricing|See Price/i.test(rawText) ? 'Hidden/Action Required' : null);

      const stockEl = el.querySelector('.stock, .availability, [class*="stock"], [class*="availability"]');
      const stockStatus = stockEl
        ? stockEl.innerText.trim()
        : (/In Stock|Out of Stock|Backorder/i.test(rawText)
            ? (rawText.match(/In Stock|Out of Stock|Backorder/i) || [])[0]
            : 'Unknown');

      const ctaText =
        button?.innerText?.trim() ||
        (rawText.match(/Add to Cart|Add to Quote|View Details|Buy Now/i) || [])[0] ||
        'View Details';

      const descEl = descSelectors.map((s) => el.querySelector(s)).find(Boolean);
      const description = descEl ? descEl.innerText.trim().slice(0, 240) : null;

      const b2bIndicators = /Request Quote|Login for Pricing|Contract Pricing|Bulk Order|Wholesale/i.test(rawText)
        ? ['Detected B2B Text'] : [];
      const b2cIndicators = /Add to Cart|Buy Now|Checkout/i.test(rawText)
        ? ['Detected B2C Text'] : [];

      return {
        title, price, stockStatus,
        imageAlt: img?.alt || null,
        imageSrc: img?.src || null,
        ctaText, description, b2bIndicators, b2cIndicators,
      };
    });
  }, { cardSelector: structure.cardSelector, maxProducts });

  return { title, metaDescription, products, structure, facets, ...intelligence };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape a product listing page.
 * Returns structured page data + a JPEG screenshot buffer.
 *
 * @param {string} url
 * @param {Array}  cookies
 * @param {number} depth        - Pages to scrape (1 = current page only, 2+ = follow pagination)
 * @param {number} maxProducts  - Max products per page (default 10)
 */
export async function scrapePage(url, cookies = [], depth = 1, maxProducts = 10) {
  if (!isValidHttpUrl(url)) throw new Error('Invalid URL — must be http or https.');

  let page;
  try {
    const browser = await BrowserManager.getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    if (cookies.length > 0) {
      try { await page.setCookie(...cookies); } catch { /* non-fatal */ }
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, Math.random() * 1000 + 1000));

    const data = await extractPageData(page, maxProducts);
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
    const performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      return {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(nav?.loadEventEnd || 0),
        firstPaint: Math.round(paint.find((p) => p.name === 'first-paint')?.startTime || 0),
        firstContentfulPaint: Math.round(paint.find((p) => p.name === 'first-contentful-paint')?.startTime || 0),
        resourceCount: performance.getEntriesByType('resource').length,
      };
    });

    return { url: page.url(), ...data, performance, cookies: currentCookies, screenshotBuffer, pagesScraped: Math.min(depth, maxDepth) };
  } finally {
    if (page) await page.close();
  }
}

/**
 * Perform a search or click action on a page, then return the resulting page data.
 */
export async function interactWithPage(url, action, selector, value, cookies = []) {
  if (!isValidHttpUrl(url)) throw new Error('Invalid URL — must be http or https.');
  if (!['search', 'click'].includes(action)) throw new Error('Action must be "search" or "click".');

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

    if (action === 'search') {
      const searchSel = selector || 'input[type="search"], input[name="q"], input[name="search"]';
      await page.waitForSelector(searchSel, { timeout: 5000 });
      await page.type(searchSel, value);
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    } else if (action === 'click') {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      await new Promise((r) => setTimeout(r, 2000));
    }

    const data = await extractPageData(page);
    const currentCookies = await page.cookies();
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });

    return { url: page.url(), ...data, cookies: currentCookies, screenshotBuffer };
  } finally {
    if (page) await page.close();
  }
}

/**
 * WEB AGENT (Surface Inspector)
 * Role: Public crawling, screen-based analysis, raw extraction.
 * Forbidden: Recommendations, intent interpretation.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const isValidHttpUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Dynamic Structural Scout
const heuristicElementDetection = async (page) => {
  return await page.evaluate(() => {
    // --- Strategy 1: Stable Scout (High Reliability) ---
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
            ? (elements[0].parentElement.className
                ? `.${elements[0].parentElement.className.split(/\s+/)[0]}`
                : elements[0].parentElement.tagName)
            : null,
          cardSelector: selector,
          confidence: 100,
        };
      }
    }

    // --- Strategy 2: Pattern Scout (Heuristic Deprioritized) ---
    const scoreElement = (el) => {
      let score = 0;
      const text = el.innerText;

      if (el.querySelector('img')) score += 5;
      if (/(\$|USD|EUR|GBP|JPY)/.test(text)) score += 5;
      if (/Add to Cart|Add to Quote|View Details/i.test(text)) score += 3;

      if (el.tagName === 'BODY' || el.tagName === 'MAIN') score -= 100;

      return score;
    };

    const allElements = document.querySelectorAll('div, ul, section, main');
    let bestGrid = null;
    let maxRepeatedScore = 0;
    let bestChildSelector = null;

    for (const el of allElements) {
      const children = Array.from(el.children).filter(
        (c) => c.tagName === 'DIV' || c.tagName === 'LI' || c.tagName === 'ARTICLE'
      );

      if (children.length < 3) continue;

      const classCounts = {};
      children.forEach((c) => {
        const cls = c.className.trim();
        if (cls) classCounts[cls] = (classCounts[cls] || 0) + 1;
      });

      const dominantClass = Object.keys(classCounts).reduce(
        (a, b) => (classCounts[a] > classCounts[b] ? a : b),
        ''
      );

      if (classCounts[dominantClass] > children.length * 0.5) {
        const sampleChild = children.find((c) => c.className.trim() === dominantClass);
        const contentScore = scoreElement(sampleChild);
        const totalScore = children.length * contentScore;

        if (totalScore > maxRepeatedScore) {
          maxRepeatedScore = totalScore;
          bestGrid = el;
          const tagName = sampleChild.tagName.toLowerCase();
          const classes = dominantClass
            .split(/\s+/)
            .filter((c) => c)
            .map((c) => `.${c}`)
            .join('');

          bestChildSelector = classes ? `${tagName}${classes}` : `${tagName}`;
        }
      }
    }

    return {
      gridSelector: bestGrid
        ? (bestGrid.className
            ? `.${bestGrid.className.split(/\s+/).join('.')}`
            : bestGrid.tagName)
        : null,
      cardSelector: bestChildSelector,
      confidence: maxRepeatedScore,
    };
  });
};

const extractData = async (page) => {
  const title = await page.title();
  const metaDescription = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : null;
  });

  try {
    await page.waitForSelector(
      '[data-automation^="product-card-"], .product-tile, .result-item, .card',
      { timeout: 15000 }
    );
  } catch (e) {
    console.log('Timeout waiting for product selectors, proceeding with what is available.');
  }

  const structure = await heuristicElementDetection(page);
  console.log('[Scout] Detected Structure:', structure);

  const intelligence = await page.evaluate(() => {
    // --- 1. Data Layer Extraction ---
    const getDataLayer = () => {
        const layers = {};
        if (window.dataLayer) layers.dataLayer = window.dataLayer;
        if (window.digitalData) layers.digitalData = window.digitalData;
        if (window.adobe) layers.adobe = window.adobe;
        if (window.utag_data) layers.utag_data = window.utag_data;
        return layers;
    };

    // --- 2. Interaction Map (What can the agent do?) ---
    const getInteractables = () => {
        const candidates = document.querySelectorAll('a, button, input[type="submit"], [role="button"]');
        return Array.from(candidates).slice(0, 50).map(el => {
            const rect = el.getBoundingClientRect();
            // Filter invisible
            if (rect.width === 0 || rect.height === 0) return null;

            return {
                type: el.tagName.toLowerCase(),
                text: (el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 50).trim(),
                selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase(),
                href: (el.href || '').slice(0, 100)
            };
        }).filter(item => item && item.text.length > 2); // Filter empty/junk
    };

    // --- 3. Findings Scout (Rule-Based Risks) ---
    const getFindings = () => {
        const findings = [];
        const timestamp = new Date().toISOString();

        // Rule: Missing Alt Text
        const imagesWithoutAlt = document.querySelectorAll('img:not([alt]), img[alt=""]');
        if (imagesWithoutAlt.length > 5) {
            findings.push({
                id: 'missing-alt-' + Math.random(),
                severity: 'warning',
                category: 'usability',
                title: 'High Volume of Missing Alt Text',
                description: `Detected ${imagesWithoutAlt.length} images without alt text, impacting accessibility and SEO.`,
                timestamp
            });
        }

        // Rule: Broken Links (Dummy check for empty hrefs)
        const emptyLinks = document.querySelectorAll('a[href=""], a:not([href])');
        if (emptyLinks.length > 0) {
            findings.push({
                 id: 'empty-links-' + Math.random(),
                 severity: 'warning',
                 category: 'technical',
                 title: 'Empty/Broken Links Detected',
                 description: `Found ${emptyLinks.length} anchor tags with no href attribute.`,
                 timestamp
            });
        }

        // Rule: Mixed Signals (Merch)
        const text = document.body.innerText;
        if (/Login for Pricing/i.test(text) && /Add to Cart/i.test(text)) {
            findings.push({
                id: 'mixed-signals-' + Math.random(),
                severity: 'info',
                category: 'merch',
                title: 'Hybrid B2B/B2C Signals',
                description: 'Page contains both "Login for Pricing" and "Add to Cart" calls to action.',
                timestamp
            });
        }

        return findings;
    };

    return {
        dataLayers: getDataLayer(),
        interactables: getInteractables(),
        findings: getFindings()
    };
  });
  console.log('[Scout] Intelligence:', Object.keys(intelligence.dataLayers));

  const products = await page.evaluate((structure) => {
    const fallbackSelectors = [
      '.product-tile',
      '.result-item',
      '.wat-product-tile',
      '.card',
      '.product-item',
    ];

    const selectorToUse = structure.cardSelector || fallbackSelectors.join(', ');
    const elements = Array.from(document.querySelectorAll(selectorToUse));

    const descriptionSelectors = [
      '.product-description',
      '.product-summary',
      '.description',
      '.summary',
      '.desc',
      '[class*="description"]',
      '[class*="summary"]',
    ];

    return elements.slice(0, 10).map((el) => {
      const img = el.querySelector('img');
      const link =
        el.querySelector('h1 a, h2 a, h3 a, .title a, a.name') || el.querySelector('a');
      const button = el.querySelector('button, input[type="submit"], a[class*="btn"]');
      const rawText = el.innerText;

      const titleEl = el.querySelector(
        'h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]'
      );
      const linkTitle = link ? link.innerText : '';
      const imgAlt = img ? img.alt : '';
      const title = titleEl?.innerText?.trim() || linkTitle || imgAlt || 'Unknown Product';

      const priceEl = el.querySelector(
        '.price, .amount, span[class*="price"], div[class*="price"]'
      );
      const priceRegex = /(\$|USD|EUR|GBP|JPY)\s?\d+([.,]\d{2})?/;
      const priceText = priceEl ? priceEl.innerText.trim() : (rawText.match(priceRegex) || [])[0] || null;
      // Capture "Call for Price" or "Login to View" as explicit price signals if numeric price is missing
      const price = priceText || ((/Call for Price|Login for Pricing|See Price/i.test(rawText)) ? 'Hidden/Action Required' : null);

      const stockEl = el.querySelector('.stock, .availability, .inventory, [class*="stock"], [class*="availability"]');
      const stockStatus = stockEl ? stockEl.innerText.trim() : (/In Stock|Out of Stock|Backorder/i.test(rawText) ? (rawText.match(/In Stock|Out of Stock|Backorder/i) || [])[0] : 'Unknown');

      const buttonText = button ? button.innerText.trim() : '';

      const ctaText =
        buttonText.length > 0
          ? buttonText
          : (el.innerText.match(/Add to Cart|Add to Quote|View Details|Buy Now/i) || [])[0] ||
            'View Details';

      const descriptionEl = descriptionSelectors
        .map((selector) => el.querySelector(selector))
        .find((node) => node);
      const descriptionRaw = descriptionEl ? descriptionEl.innerText.trim() : null;
      const description =
        descriptionRaw && descriptionRaw.length > 0
          ? descriptionRaw.slice(0, 240)
          : null;

      const b2bIndicators = [];
      const b2cIndicators = [];

      if (/Request Quote|Login for Pricing|Contract Pricing|Bulk Order|Wholesale/i.test(rawText)) {
        b2bIndicators.push('Detected B2B Text');
      }
      if (/Add to Cart|Buy Now|Checkout/i.test(rawText)) {
        b2cIndicators.push('Detected B2C Text');
      }

      return {
        title,
        price, // Now handles 'Hidden/Action Required'
        stockStatus, // New Field
        imageAlt: imgAlt || null,
        imageSrc: img ? img.src : null,
        ctaText,
        description,
        b2bIndicators,
        b2cIndicators,
      };
    });
  }, structure);

  return {
    title,
    metaDescription,
    products,
    structure,
    dataLayers: intelligence.dataLayers,
    interactables: intelligence.interactables,
    findings: intelligence.findings
  };
};

const BrowserManager = {
  browser: null,
  async getBrowser() {
    if (!this.browser) {
      console.log('[BrowserManager] Initializing new browser instance...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
        ],
      });
      console.log('[BrowserManager] Browser initialized.');
    }
    return this.browser;
  },
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[BrowserManager] Browser closed.');
    }
  },
};

// Graceful shutdown
process.on('exit', () => BrowserManager.closeBrowser());
process.on('SIGINT', () => BrowserManager.closeBrowser());
process.on('SIGTERM', () => BrowserManager.closeBrowser());

export function registerWebAgentRoutes(app) {
  app.post('/api/scrape', async (req, res) => {
    const { url, cookies } = req.body;

    if (!url || !isValidHttpUrl(url)) {
      return res.status(400).json({ error: 'Valid http/https URL is required' });
    }

    console.log(`[Scraper] Stealth analysis for: ${url} (Cookies provided: ${cookies ? 'Yes' : 'No'})`);
    let page;
    try {
      const browser = await BrowserManager.getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      if (cookies && Array.isArray(cookies) && cookies.length > 0) {
        try {
            await page.setCookie(...cookies);
        } catch (cookieError) {
            console.warn('[Scraper] Cookie injection failed (non-fatal):', cookieError.message);
        }
      }

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise((r) => setTimeout(r, Math.random() * 1000 + 1000));

      const data = await extractData(page);
      const currentCookies = await page.cookies();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotFilename = `screenshot-${timestamp}.jpg`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
      await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 70 });

      const result = {
        url,
        ...data,
        cookies: currentCookies,
        screenshotPath,
        viewportWidth: 1920,
      };

      console.log(`[Scraper] Success: ${url} (Detected ${data.products.length} products)`);
      res.json(result);
    } catch (error) {
      console.error('[Scraper] Stealth Scrape Failed:', error.message);
      res.status(500).json({
        error: `Scrape blocked or failed: ${error.message}`,
        fallbackSuggestion: 'Try a different URL or check if the site blocks headless browsers.',
      });
    } finally {
      if (page) await page.close();
    }
  });

  app.post('/api/interact', async (req, res) => {
      const { url, cookies, action, selector, value } = req.body;

      if (!url || !action) {
          return res.status(400).json({ error: 'URL and Action are required' });
      }

      console.log(`[Interact] executing '${action}' on ${url}`);
      let page;
      try {
          const browser = await BrowserManager.getBrowser();
          page = await browser.newPage();
          await page.setViewport({ width: 1920, height: 1080 });

          if (cookies && Array.isArray(cookies)) {
              await page.setCookie(...cookies);
          }

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 1000));

          if (action === 'search') {
              const searchSelector = selector || 'input[type="search"], input[name="q"], input[name="search"], input[aria-label="Search"]';
              await page.waitForSelector(searchSelector, { timeout: 5000 });
              await page.type(searchSelector, value);
              await page.keyboard.press('Enter');
              await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => console.log('Navigation timeout (SPA?)'));
          } else if (action === 'click') {
              await page.waitForSelector(selector, { timeout: 5000 });
              await page.click(selector);
              await new Promise(r => setTimeout(r, 2000));
          }

          const data = await extractData(page);
          const currentCookies = await page.cookies();
          const newUrl = page.url();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const screenshotFilename = `screenshot-interact-${timestamp}.jpg`;
          const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
          await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 70 });

          res.json({
              url: newUrl,
              ...data,
              cookies: currentCookies,
              screenshotPath,
              viewportWidth: 1920
          });

      } catch (error) {
          console.error('[Interact] Failed:', error.message);
          res.status(500).json({ error: error.message });
      } finally {
        if (page) await page.close();
      }
  });
}

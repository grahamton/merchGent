/**
 * WEB AGENT (Surface Inspector)
 * Role: Public and authenticated crawling, screen-based rendering analysis, raw extraction.
 * Forbidden: Recommendations, Intent interpretation.
 * v2.0 Upgrade: Puppeteer Stealth + Fallback Mechanism
 */
import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Ensure screenshots directory exists
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR);
}

// Dynamic Structural Scout
const heuristicElementDetection = async (page) => {
    return await page.evaluate(() => {
        // --- Strategy 1: Stable Scout (High Reliability) ---
        // Look for explicit data attributes often used in e-commerce
        const stableSelectors = [
            '[data-automation^="product-card-"]', // Ferguson/Build.com
            '[data-test-id="product-card"]',
            '[itemprop="itemListElement"]',
            '.product-tile',
            '.product-item'
        ];

        for (const selector of stableSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 2) { // Threshold for validity
                return {
                    gridSelector: elements[0].parentElement ? (elements[0].parentElement.className ? `.${elements[0].parentElement.className.split(/\s+/)[0]}` : elements[0].parentElement.tagName) : null,
                    cardSelector: selector,
                    confidence: 100 // Maximum confidence for stable selectors
                };
            }
        }

        // --- Strategy 2: Pattern Scout (Heuristic Deprioritized) ---
        // Helper: Calculate node score based on content
        const scoreElement = (el) => {
            let score = 0;
            const text = el.innerText;
            const html = el.innerHTML;

            // Critical Signals
            if (el.querySelector('img')) score += 5;
            if (/[\$£€]/.test(text)) score += 5;
            if (/Add to Cart|Add to Quote|View Details/i.test(text)) score += 3;

            // Negative signals (too large, likely layout)
            if (el.tagName === 'BODY' || el.tagName === 'MAIN') score -= 100;

            return score;
        };

        // Find the Grid (Container with most similar repeated children)
        const allElements = document.querySelectorAll('div, ul, section, main');
        let bestGrid = null;
        let maxRepeatedScore = 0;
        let bestChildSelector = null;

        for (const el of allElements) {
            const children = Array.from(el.children).filter(c =>
                c.tagName === 'DIV' || c.tagName === 'LI' || c.tagName === 'ARTICLE'
            );

            if (children.length < 3) continue; // Lowered noise filter

            // Check consistency (classes)
            const classCounts = {};
            children.forEach(c => {
                const cls = c.className.trim();
                if (cls) classCounts[cls] = (classCounts[cls] || 0) + 1;
            });

            // Find dominant class
            const dominantClass = Object.keys(classCounts).reduce((a, b) =>
                classCounts[a] > classCounts[b] ? a : b, ''
            );

            if (classCounts[dominantClass] > children.length * 0.5) { // Lowered threshold (50%)
                // We found a repetitive container. Is it products?
                const sampleChild = children.find(c => c.className.trim() === dominantClass);
                const contentScore = scoreElement(sampleChild);

                // Multiplier: Density * Content Score
                const totalScore = children.length * contentScore;

                if (totalScore > maxRepeatedScore) {
                    maxRepeatedScore = totalScore;
                    bestGrid = el;
                    // Generate a selector for the child
                    const tagName = sampleChild.tagName.toLowerCase();
                    const classes = dominantClass.split(/\s+/).filter(c => c).map(c => `.${c}`).join('');

                    if (classes) {
                        bestChildSelector = `${tagName}${classes}`;
                    } else {
                        bestChildSelector = `${tagName}`; // Fallback to tag if no classes
                    }
                }
            }
        }

        return {
            gridSelector: bestGrid ? (bestGrid.className ? `.${bestGrid.className.split(/\s+/).join('.')}` : bestGrid.tagName) : null,
            cardSelector: bestChildSelector,
            confidence: maxRepeatedScore
        };
    });
};

// Function to extract page data using Scout Intelligence
const extractData = async (page) => {
    const title = await page.title();
    const metaDescription = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="description"]');
        return meta ? meta.getAttribute('content') : null;
    });

    // Wait for content to hydrate (critical for SPA sites like Ferguson)
    try {
        // Wait for ANY robust indicator
        await page.waitForSelector('[data-automation^="product-card-"], .product-tile, .result-item, .card', { timeout: 15000 });
    } catch (e) {
        console.log("Timeout waiting for product selectors, proceeding with what is available.");
    }

    // Run the Scout
    const structure = await heuristicElementDetection(page);
    console.log(`[Scout] Detected Structure:`, structure);

    const products = await page.evaluate((structure) => {
        // Fallback selectors if Scout failed (Safety Net)
        const fallbackSelectors = [
            '.product-tile', '.result-item', '.wat-product-tile', '.card', '.product-item'
        ];

        const selectorToUse = structure.cardSelector || fallbackSelectors.join(', ');
        const elements = Array.from(document.querySelectorAll(selectorToUse));

        return elements.slice(0, 10).map(el => { // Expanded sample size
            const img = el.querySelector('img');

            // Smart Link Detection: Look for the title link specifically
            const link = el.querySelector('h1 a, h2 a, h3 a, .title a, a.name') || el.querySelector('a');

            const button = el.querySelector('button, input[type="submit"], a[class*="btn"]');
            const rawText = el.innerText;

            // Smart Title Detection
            const titleEl = el.querySelector('h1, h2, h3, h4, .title, .name, [class*="title"], [class*="name"]');
            const linkTitle = link ? link.innerText : '';
            const imgAlt = img ? img.alt : '';
            const title = titleEl?.innerText?.trim() || linkTitle || imgAlt || "Unknown Product";

            // Smart Price Detection (Regex weighted)
            const priceEl = el.querySelector('.price, .amount, span[class*="price"], div[class*="price"]');
            const priceRegex = /[\$£€]\d+([.,]\d{2})?/;
            const price = priceEl ? priceEl.innerText.trim() : (rawText.match(priceRegex) || [])[0] || null;

            const ctaText = button ? button.innerText.trim() : (el.innerText.match(/Add to Cart|Add to Quote|View Details/i) || [])[0] || "View Details";

            const b2bIndicators = [];
            const b2cIndicators = [];

            if (/Request Quote|Login for Pricing|Contract Pricing|Bulk Order|Wholesale/i.test(rawText)) b2bIndicators.push("Detected B2B Text");
            if (/Add to Cart|Buy Now|Checkout/i.test(rawText)) b2cIndicators.push("Detected B2C Text");

            return {
                title,
                price: price || null,
                imageAlt: imgAlt || null,
                imageSrc: img ? img.src : null,
                ctaText,
                description: null,
                b2bIndicators,
                b2cIndicators
            };
        });
    }, structure);

    return { title, metaDescription, products, structure };
};

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`[Scraper] Stealth analysis for: ${url}`);
  let browser;

  try {
    browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"'
        ]
    });

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate with better timeout handling
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Random "human" pause
    await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));

    // Extract data
    const data = await extractData(page);

    // Screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotFilename = `screenshot-${timestamp}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
    await page.screenshot({ path: screenshotPath });

    await browser.close();

    const result = {
      url,
      ...data,
      screenshotPath,
      viewportWidth: 1920
    };

    console.log(`[Scraper] Success: ${url} (Detected ${data.products.length} products)`);
    res.json(result);

  } catch (error) {
    console.error(`[Scraper] Stealth Scrape Failed:`, error.message);
    if (browser) await browser.close();

    // Fallback: If stealth fails, try stripped down mode (future: use raw fetch or different proxy)
    // For now, return a helpful error so the UI handles it gracefully
    res.status(500).json({
        error: `Scrape blocked or failed: ${error.message}`,
        fallbackSuggestion: "Try a different URL or check if the site blocks headless browsers."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (v2.0 Stealth Mode)`);
});

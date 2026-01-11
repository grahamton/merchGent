/**
 * WEB AGENT (Surface Inspector)
 * Role: Public and authenticated crawling, screen-based rendering analysis, raw extraction.
 * Forbidden: Recommendations, Intent interpretation.
 */
import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`[Scraper] Starting analysis for: ${url}`);
  let browser;

  try {
    // Stealth: Launch with automation flags disabled
    browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    // Stealth: Create context with realistic User-Agent and viewport
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'America/New_York'
    });

    const page = await context.newPage();

    // Spec Requirement: 3.1 "The component launches a headless Chromium browser instance"
    // Stealth: Add random delay to mimic human behavior
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000); // 2s "human" pause

    const title = await page.title();

    // Spec Requirement: Extract meta description
    const metaDescription = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="description"]');
        return meta ? meta.getAttribute('content') : null;
    });

    // Spec Requirement: 3.1 "Heuristic Product Identification"
    // Heuristics: .product-tile, .result-item, .wat-product-tile, .card (as per spec)
    const products = await page.evaluate(() => {
        const productSelectors = [
            '.product-tile',
            '.result-item',
            '.wat-product-tile',
            '.card',
            '.product-item', // Common enough to include as backup
            'div[data-component-type="s-search-result"]' // Amazon heuristic backup
        ];

        let foundElements = [];
        for (const selector of productSelectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            if (elements.length > 0) {
                foundElements = elements;
                break; // Use the first selector that works
            }
        }

        // Fallback: If no known class logic works, look for repeated structures with price/image/button
        if (foundElements.length === 0) {
            // Very simple fallback: look for list items with images and prices
            // This is "best effort" if specific classes fail
            const lis = Array.from(document.querySelectorAll('li, div.col'));
            foundElements = lis.filter(el =>
                el.querySelector('img') && (el.innerText.includes('$') || el.innerText.includes('Price'))
            );
        }

        return foundElements.slice(0, 5).map(el => {
            const img = el.querySelector('img');
            const link = el.querySelector('a');
            const button = el.querySelector('button, input[type="submit"], a[class*="btn"]');

            const rawText = el.innerText;
            const linkTitle = link ? link.innerText : '';
            const imgAlt = img ? img.alt : '';
            const title = (el.querySelector('h1, h2, h3, h4, .title, .name') || link)?.innerText?.trim() || linkTitle || imgAlt || "Unknown Product";

            const priceEl = el.querySelector('.price, .amount, span[class*="price"]');
            const price = priceEl ? priceEl.innerText.trim() : (rawText.match(/\$\d+([.,]\d{2})?/) || [])[0] || null;

            const ctaText = button ? button.innerText.trim() : (el.innerText.match(/Add to Cart|Add to Quote|View Details/i) || [])[0] || "View Details";

            // Spec Requirement: 3.1 B2B vs B2C Signal Detection
            // "Request Quote" or "Login for Pricing" -> B2B
            // "Add to Cart" -> B2C
            const b2bIndicators = [];
            const b2cIndicators = [];

            if (/Request Quote|Login for Pricing|Contract Pricing|Bulk Order/i.test(rawText)) {
                b2bIndicators.push("Detected B2B Text");
            }
            if (/Add to Cart|Buy Now|Checkout/i.test(rawText)) {
                b2cIndicators.push("Detected B2C Text");
            }
            if (/Request Quote|Login for Pricing/i.test(ctaText)) {
                b2bIndicators.push(`CTA: ${ctaText}`);
            }
            if (/Add to Cart/i.test(ctaText)) {
                b2cIndicators.push(`CTA: ${ctaText}`);
            }

            return {
                title,
                price: price || null,
                imageAlt: imgAlt || null,
                imageSrc: img ? img.src : null,
                ctaText,
                description: null, // Hard to reliably extract short description from card without specific selector
                b2bIndicators,
                b2cIndicators
            };
        });
    });

    // Spec Requirement: 3.1 "The scraper captures a screenshot"
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotFilename = `screenshot-${timestamp}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
    await page.screenshot({ path: screenshotPath });

    await browser.close();

    const result = {
      url,
      title,
      products,
      metaDescription,
      screenshotPath, // Passing local path
      viewportWidth: 1280
    };

    console.log(`[Scraper] Successfully analyzed ${url}`);
    res.json(result);
  } catch (error) {
    console.error(`[Scraper] Error:`, error);
    if (browser) await browser.close();
    res.status(500).json({ error: `Failed to scrape URL: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

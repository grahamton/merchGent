#!/usr/bin/env node
/**
 * Smoke test — calls merch-connector tools directly, no MCP overhead.
 *
 * Usage:
 *   node test/smoke.js                   # runs scrape-only (no API key needed)
 *   node test/smoke.js --audit           # scrape + default audit
 *   node test/smoke.js --persona scout   # scrape + persona audit
 *   node test/smoke.js --roundtable      # full roundtable (3 personas + moderator)
 *   node test/smoke.js --ask "what colors are available?"
 *   node test/smoke.js --url https://www.nike.com/w/mens-shoes
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../.env', import.meta.url), override: true });
import { scrapePage } from '../server/scraper.js';
import { analyzePage, askPage, analyzeAsFloorWalker, analyzeAsAuditor, analyzeAsAuditorB2B, analyzeAsScout, runRoundtable } from '../server/analyzer.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const flagVal = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

const b2bMode = flag('b2b');
const url = flagVal('url') || (b2bMode ? 'https://www.insight.com/en_US/shop/product/laptops/laptops.html' : 'https://www.zappos.com/running-shoes');
const depth = 1;
const maxProducts = 5;

console.log(`\n🔍 Scraping: ${url}\n`);

const t0 = Date.now();
const result = await scrapePage(url, [], depth, maxProducts);
const scrapeMs = Date.now() - t0;

console.log(`✅ Scraped in ${(scrapeMs / 1000).toFixed(1)}s`);
console.log(`   Title: ${result.title}`);
console.log(`   Products: ${result.products.length}`);
console.log(`   Facets: ${(result.facets || []).length}`);
console.log(`   Structure: ${result.structure?.confidence || 'unknown'} confidence`);
console.log(`   Screenshot: ${result.screenshotBuffer ? `${(result.screenshotBuffer.length / 1024).toFixed(0)}KB` : 'none'}`);
console.log(`   B2B mode: ${result.b2bMode} (conflict score: ${result.b2bConflictScore}/100)`);
if (result.sortOptions) {
  console.log(`   Sort: "${result.sortOptions.current}" (${result.sortOptions.options.length} options)`);
}

if (result.products.length > 0) {
  console.log(`\n📦 First 3 products:`);
  for (const p of result.products.slice(0, 3)) {
    console.log(`   • ${p.title} — ${p.price || 'no price'}`);
  }
}

if ((result.facets || []).length > 0) {
  console.log(`\n🏷️  Facets:`);
  for (const f of result.facets.slice(0, 5)) {
    console.log(`   • ${f.name} (${f.optionCount} options)`);
  }
}

// ─── AI-powered tests (need API key) ───────────────────────────────────────

if (flag('audit')) {
  console.log(`\n🤖 Running default audit...`);
  const t1 = Date.now();
  const audit = await analyzePage(result, result.screenshotBuffer);
  console.log(`✅ Audit complete in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`   Mode: ${audit.siteMode}`);
  console.log(`   Diagnosis: ${audit.diagnosisTitle}`);
  console.log(`   Matrix: T=${audit.auditMatrix.trust.status} G=${audit.auditMatrix.guidance.status} P=${audit.auditMatrix.persuasion.status} F=${audit.auditMatrix.friction.status}`);
  for (const r of audit.recommendations) {
    console.log(`   → [${r.impact}] ${r.title}`);
  }
}

const persona = flagVal('persona') || (b2bMode ? 'b2b_auditor' : null);
if (persona) {
  const fn = { floor_walker: analyzeAsFloorWalker, auditor: analyzeAsAuditor, scout: analyzeAsScout, b2b_auditor: analyzeAsAuditorB2B }[persona];
  if (!fn) { console.error(`Unknown persona: ${persona}`); process.exit(1); }
  console.log(`\n🎭 Running ${persona} analysis...`);
  const t1 = Date.now();
  const out = await fn(result, result.screenshotBuffer);
  console.log(`✅ ${persona} complete in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(out, null, 2));
}

if (flag('roundtable')) {
  console.log(`\n🎪 Running roundtable (this calls 4 AI models sequentially)...`);
  const t1 = Date.now();
  const rt = await runRoundtable(result, result.screenshotBuffer);
  console.log(`✅ Roundtable complete in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`\n── Floor Walker ──`);
  console.log(`   Top concern: ${rt.perspectives.floorWalker.topConcern}`);
  console.log(`\n── Auditor ──`);
  console.log(`   Top concern: ${rt.perspectives.auditor.topConcern}`);
  console.log(`\n── Scout ──`);
  console.log(`   Top concern: ${rt.perspectives.scout.topConcern}`);
  console.log(`\n── Consensus ──`);
  console.log(`   ${rt.debate.consensus}`);
  console.log(`\n── Recommendations ──`);
  for (const r of rt.debate.finalRecommendations) {
    console.log(`   → [${r.impact}] ${r.title} (endorsed by: ${r.endorsedBy.join(', ')})`);
  }
}

const question = flagVal('ask');
if (question) {
  console.log(`\n💬 Asking: "${question}"`);
  const t1 = Date.now();
  const answer = await askPage(result, question, result.screenshotBuffer);
  console.log(`✅ Answer in ${((Date.now() - t1) / 1000).toFixed(1)}s\n`);
  console.log(answer);
}

// If no AI flags, just show the scrape summary
if (!flag('audit') && !persona && !flag('roundtable') && !question && !b2bMode) {
  console.log(`\n💡 Scrape-only test passed. Add flags to test AI features:`);
  console.log(`   --audit              Full merchandising audit`);
  console.log(`   --persona scout      Single persona (floor_walker | auditor | scout | b2b_auditor)`);
  console.log(`   --roundtable         All 3 personas + moderator debate`);
  console.log(`   --ask "question"     Ask anything about the page`);
  console.log(`   --url https://...    Override the default URL`);
  console.log(`   --b2b                B2B validation: Insight.com laptops + b2b_auditor persona (#13)`);
}

console.log('');
process.exit(0);

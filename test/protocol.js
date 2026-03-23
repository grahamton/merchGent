#!/usr/bin/env node
/**
 * Protocol compliance test — verifies MCP Resources, Prompts, and Logging
 * by communicating with the server over stdio using JSON-RPC.
 * Does not require a browser or AI provider.
 *
 * Usage:
 *   node test/protocol.js
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { computeDataQuality } from '../server/acquire.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../');
const SERVER = path.join(ROOT, 'bin', 'merch-connector.js');

let id = 1;
const nextId = () => id++;

function rpc(method, params = {}) {
  return { jsonrpc: '2.0', id: nextId(), method, params };
}

async function runProtocolTests() {
  const server = spawn('node', [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
  });

  const results = [];
  let buf = '';

  server.stdout.on('data', (chunk) => { buf += chunk.toString(); });
  server.stderr.on('data', () => { /* suppress server logs */ });

  async function send(msg) {
    const line = JSON.stringify(msg) + '\n';
    server.stdin.write(line);
    // Wait for a response line
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const newline = buf.indexOf('\n');
        if (newline !== -1) {
          const raw = buf.slice(0, newline);
          buf = buf.slice(newline + 1);
          clearInterval(interval);
          try { resolve(JSON.parse(raw)); } catch { resolve(null); }
        }
      }, 20);
      setTimeout(() => { clearInterval(interval); resolve(null); }, 5000);
    });
  }

  function pass(name) { results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  function fail(name, reason) { results.push({ name, ok: false, reason }); console.log(`  ✗ ${name}: ${reason}`); }

  console.log('\nMCP Protocol Compliance Tests\n');

  // 1. Initialize
  console.log('--- Handshake ---');
  const initResp = await send(rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  }));

  if (!initResp?.result) { fail('initialize', 'no result'); }
  else {
    const caps = initResp.result.capabilities || {};
    pass('initialize');
    caps.tools      ? pass('capability: tools')     : fail('capability: tools', 'not declared');
    caps.prompts    ? pass('capability: prompts')   : fail('capability: prompts', 'not declared');
    caps.resources  ? pass('capability: resources') : fail('capability: resources', 'not declared');
    caps.logging    ? pass('capability: logging')   : fail('capability: logging', 'not declared');
  }

  // Initialized notification (required by spec)
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  // 2. Tools
  console.log('\n--- Tools ---');
  const toolsResp = await send(rpc('tools/list'));
  if (!toolsResp?.result?.tools?.length) { fail('tools/list', 'no tools returned'); }
  else {
    pass(`tools/list (${toolsResp.result.tools.length} tools)`);
    const names = toolsResp.result.tools.map((t) => t.name);
    // v2: acquire is the new primary tool; audit_storefront is retired (not in tools/list)
    const expected = ['acquire', 'scrape_page', 'scrape_pdp', 'get_category_sample', 'interact_with_page', 'compare_storefronts', 'ask_page', 'site_memory', 'merch_roundtable', 'clear_session', 'save_eval', 'list_evals', 'get_logs'];
    for (const t of expected) {
      names.includes(t) ? pass(`  tool: ${t}`) : fail(`  tool: ${t}`, 'missing');
    }
    // audit_storefront should be retired from the tool list
    !names.includes('audit_storefront')
      ? pass('  audit_storefront retired from tools/list')
      : fail('  audit_storefront retired', 'still present in tools/list — should have been removed in v2');
    // scrape_page should be deprecated (description contains DEPRECATED)
    const scrapePageTool = toolsResp.result.tools.find(t => t.name === 'scrape_page');
    scrapePageTool?.description?.includes('DEPRECATED')
      ? pass('  scrape_page has DEPRECATED in description')
      : fail('  scrape_page deprecation', 'description does not contain DEPRECATED');
  }

  // 3. Prompts
  console.log('\n--- Prompts ---');
  const promptsResp = await send(rpc('prompts/list'));
  if (!promptsResp?.result?.prompts) { fail('prompts/list', JSON.stringify(promptsResp)); }
  else {
    const prompts = promptsResp.result.prompts;
    pass(`prompts/list (${prompts.length} prompts)`);
    const expectedPrompts = ['floor-walker', 'auditor', 'auditor-b2b', 'scout', 'merch-roundtable'];
    for (const name of expectedPrompts) {
      prompts.find((p) => p.name === name)
        ? pass(`  prompt: ${name}`)
        : fail(`  prompt: ${name}`, 'missing');
    }

    // Get a prompt
    const getResp = await send(rpc('prompts/get', { name: 'floor-walker', arguments: {} }));
    if (!getResp?.result?.messages?.[0]?.content?.text) {
      fail('prompts/get: floor-walker', JSON.stringify(getResp));
    } else {
      pass('prompts/get: floor-walker (has content)');
    }

    // Get merch-roundtable with url argument
    const rtResp = await send(rpc('prompts/get', { name: 'merch-roundtable', arguments: { url: 'https://example.com/shop' } }));
    if (!rtResp?.result?.messages?.[0]?.content?.text?.includes('https://example.com/shop')) {
      fail('prompts/get: merch-roundtable with url arg', 'URL not injected into prompt');
    } else {
      pass('prompts/get: merch-roundtable with url arg');
    }

    // Unknown prompt should error
    const unknownResp = await send(rpc('prompts/get', { name: 'nonexistent' }));
    unknownResp?.error
      ? pass('prompts/get: unknown prompt returns error')
      : fail('prompts/get: unknown prompt', 'expected error, got none');
  }

  // 4. Resources
  console.log('\n--- Resources ---');
  const resourcesResp = await send(rpc('resources/list'));
  if (!resourcesResp?.result) { fail('resources/list', JSON.stringify(resourcesResp)); }
  else {
    const resources = resourcesResp.result.resources || [];
    pass(`resources/list (${resources.length} stored domains)`);
    if (resources.length > 0) {
      const uri = resources[0].uri;
      uri.startsWith('merch-memory://')
        ? pass(`  resource URI scheme: ${uri}`)
        : fail('resource URI scheme', `expected merch-memory://, got ${uri}`);

      const readResp = await send(rpc('resources/read', { uri }));
      readResp?.result?.contents?.[0]?.text
        ? pass(`  resources/read: ${uri}`)
        : fail(`  resources/read: ${uri}`, JSON.stringify(readResp));
    } else {
      pass('  resources/list: empty (no site memory yet — run scrape_page to populate)');
    }

    // Bad URI should error
    const badRead = await send(rpc('resources/read', { uri: 'merch-memory://no-such-domain.example' }));
    badRead?.error
      ? pass('resources/read: unknown domain returns error')
      : fail('resources/read: unknown domain', 'expected error, got none');
  }

  // 5. Data Quality Model (Unit Test)
  console.log('\n--- Data Quality Model ---');
  try {
    const mockProducts = [
      { title: 'Product 1', description: 'A very long description that exceeds the forty character limit for spec and goes into thin or rich territory.', price: 10, url: 'http://example.com/1', rating: 4 },
      { title: 'Product 2', description: 'Short spec', price: 20, url: 'http://example.com/2' },
      { title: 'Product 3', description: '', price: 30, url: 'http://example.com/3' }
    ];
    const dq = computeDataQuality(mockProducts, { scraper: 'puppeteer', structureConfidence: 80 });
    
    const validTiers = ['full', 'degraded', 'minimal', 'failed'];
    validTiers.includes(dq.overall?.usabilityTier)
      ? pass('dataQuality.overall.usabilityTier is valid')
      : fail('dataQuality.overall.usabilityTier', `got ${dq.overall?.usabilityTier}`);
      
    dq.dimensions?.descriptions?.fillRate !== undefined
      ? pass('dataQuality.dimensions.descriptions has fillRate')
      : fail('dataQuality.dimensions.descriptions', 'missing fillRate');
      
    dq.dimensions?.descriptions?.qualityDistribution
      ? pass('dataQuality.dimensions.descriptions has qualityDistribution')
      : fail('dataQuality.dimensions.descriptions', 'missing qualityDistribution');
      
    dq.dimensions?.descriptions?.siteQualityAssessment
      ? pass('dataQuality.dimensions.descriptions has siteQualityAssessment')
      : fail('dataQuality.dimensions.descriptions', 'missing siteQualityAssessment');
      
    (dq.descriptionFillRate !== undefined && dq.priceFillRate !== undefined)
      ? pass('dataQuality retains existing flat fields')
      : fail('dataQuality flat fields', 'missing descriptionFillRate or priceFillRate');
  } catch (err) {
    fail('Data Quality Model', err.message);
  }

  server.stdin.end();
  server.kill();

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runProtocolTests().catch((err) => { console.error(err); process.exit(1); });

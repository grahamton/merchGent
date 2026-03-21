/**
 * Analyzer
 * Model-agnostic merchandising analysis. Auto-detects provider from env vars.
 *
 * Provider selection (in order):
 *   1. MODEL_PROVIDER env var ('anthropic' | 'gemini' | 'openai')
 *   2. ANTHROPIC_API_KEY present → anthropic
 *   3. GEMINI_API_KEY present    → gemini
 *   4. OPENAI_API_KEY present    → openai
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getModelName(provider, defaultModel) {
  const explicit = process.env.MODEL_PROVIDER?.toLowerCase();
  if (explicit === provider && process.env.MODEL_NAME) return process.env.MODEL_NAME;
  return defaultModel;
}

// ─── Shared: prompt loaders ─────────────────────────────────────────────────

const loadPrompt = (filename) =>
  fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf8');

const getSystemPrompt = () => loadPrompt('SYSTEM_PROMPT_V2.md');

// ─── Shared: output schemas ──────────────────────────────────────────────────

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['trustTrace', 'siteMode', 'diagnosisTitle', 'diagnosisDescription', 'hybridTrapCheck', 'auditMatrix', 'standardsCheck', 'recommendations'],
  properties: {
    trustTrace:           { type: 'string' },
    siteMode:             { type: 'string', enum: ['B2B', 'B2C', 'Hybrid'] },
    diagnosisTitle:       { type: 'string' },
    diagnosisDescription: { type: 'string' },
    hybridTrapCheck:      { type: 'string' },
    auditMatrix: {
      type: 'object',
      additionalProperties: false,
      required: ['trust', 'guidance', 'persuasion', 'friction'],
      properties: {
        trust:      { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        guidance:   { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        persuasion: { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        friction:   { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
      },
    },
    standardsCheck: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'status', 'evidence'],
        properties: {
          criterion: { type: 'string' },
          status:    { type: 'string' },
          evidence:  { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'impact'],
        properties: {
          title:       { type: 'string' },
          description: { type: 'string' },
          impact:      { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

const FLOOR_WALKER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['firstImpression', 'scan', 'hunt', 'gutTrust', 'topConcern', 'summary', 'score', 'severity', 'findings', 'uniqueInsight'],
  properties: {
    firstImpression: { type: 'string' },
    scan:            { type: 'string' },
    hunt:            { type: 'string' },
    gutTrust:        { type: 'string' },
    topConcern:      { type: 'string' },
    summary:         { type: 'string' },
    score:           { type: 'integer', minimum: 0, maximum: 100 },
    severity:        { type: 'integer', minimum: 1, maximum: 5 },
    findings:        { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    uniqueInsight:   { type: 'string' },
  },
};

const AUDITOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['siteMode', 'matrix', 'standardsChecks', 'topConcern', 'dataPoint', 'summary', 'score', 'severity', 'findings', 'uniqueInsight'],
  properties: {
    siteMode: { type: 'string', enum: ['B2B', 'B2C', 'Hybrid'] },
    matrix: {
      type: 'object',
      additionalProperties: false,
      required: ['trust', 'guidance', 'persuasion', 'friction'],
      properties: {
        trust:      { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        guidance:   { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        persuasion: { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
        friction:   { type: 'object', additionalProperties: false, required: ['status', 'finding'], properties: { status: { type: 'string', enum: ['pass', 'fail', 'check'] }, finding: { type: 'string' } } },
      },
    },
    standardsChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'status', 'evidence'],
        properties: {
          criterion: { type: 'string' },
          status:    { type: 'string' },
          evidence:  { type: 'string' },
        },
      },
    },
    topConcern:    { type: 'string' },
    dataPoint:     { type: 'string' },
    summary:       { type: 'string' },
    score:         { type: 'integer', minimum: 0, maximum: 100 },
    severity:      { type: 'integer', minimum: 1, maximum: 5 },
    findings:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    uniqueInsight: { type: 'string' },
  },
};

const SCOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryFitness', 'assortmentStrategy', 'discoveryTools', 'competitiveGaps', 'strategicRead', 'topConcern', 'summary', 'score', 'severity', 'findings', 'uniqueInsight'],
  properties: {
    categoryFitness:    { type: 'string' },
    assortmentStrategy: { type: 'string' },
    discoveryTools:     { type: 'string' },
    competitiveGaps:    { type: 'string' },
    strategicRead:      { type: 'string' },
    topConcern:         { type: 'string' },
    summary:            { type: 'string' },
    score:              { type: 'integer', minimum: 0, maximum: 100 },
    severity:           { type: 'integer', minimum: 1, maximum: 5 },
    findings:           { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    uniqueInsight:      { type: 'string' },
  },
};

const B2B_AUDITOR_DIMENSION = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'finding', 'b2bImpact'],
  properties: {
    status:    { type: 'string', enum: ['pass', 'fail', 'check'] },
    finding:   { type: 'string' },
    b2bImpact: { type: 'string' },
  },
};

const B2B_AUDITOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matrix', 'procurementFrictionScore', 'topConcern', 'selfServeViability', 'summary', 'score', 'severity', 'findings', 'uniqueInsight'],
  properties: {
    matrix: {
      type: 'object',
      additionalProperties: false,
      required: ['trust', 'guidance', 'persuasion', 'friction'],
      properties: {
        trust:      B2B_AUDITOR_DIMENSION,
        guidance:   B2B_AUDITOR_DIMENSION,
        persuasion: B2B_AUDITOR_DIMENSION,
        friction:   B2B_AUDITOR_DIMENSION,
      },
    },
    procurementFrictionScore: { type: 'number' },
    topConcern:    { type: 'string' },
    selfServeViability: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'evidence'],
      properties: {
        status:   { type: 'string', enum: ['pass', 'partial', 'fail'] },
        evidence: { type: 'string' },
      },
    },
    summary:       { type: 'string' },
    score:         { type: 'integer', minimum: 0, maximum: 100 },
    severity:      { type: 'integer', minimum: 1, maximum: 5 },
    findings:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    uniqueInsight: { type: 'string' },
  },
};

const CONVERSION_ARCHITECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['funnelMap', 'frictionInventory', 'topDropOffRisk', 'quickWins', 'topConcern', 'summary', 'score', 'severity', 'findings', 'uniqueInsight'],
  properties: {
    funnelMap:        { type: 'string' },
    frictionInventory:{ type: 'string' },
    topDropOffRisk:   { type: 'string' },
    quickWins:        { type: 'string' },
    topConcern:       { type: 'string' },
    summary:          { type: 'string' },
    score:            { type: 'integer', minimum: 0, maximum: 100 },
    severity:         { type: 'integer', minimum: 1, maximum: 5 },
    findings:         { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    uniqueInsight:    { type: 'string' },
  },
};

const ROUNDTABLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['consensus', 'disagreements', 'finalRecommendations'],
  properties: {
    consensus: { type: 'string' },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'floorWalkerPosition', 'auditorPosition', 'scoutPosition'],
        properties: {
          topic:               { type: 'string' },
          floorWalkerPosition: { type: 'string' },
          auditorPosition:     { type: 'string' },
          scoutPosition:       { type: 'string' },
        },
      },
    },
    finalRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'impact', 'endorsedBy'],
        properties: {
          title:       { type: 'string' },
          description: { type: 'string' },
          impact:      { type: 'string', enum: ['high', 'medium', 'low'] },
          endorsedBy:  { type: 'array', items: { type: 'string', enum: ['floorWalker', 'auditor', 'scout', 'b2bAuditor'] } },
        },
      },
    },
  },
};

// ─── Shared: validation + normalization ───────────────────────────────────────

const normalize = (raw) => ({
  siteMode:             raw.siteMode,
  diagnosisTitle:       raw.diagnosisTitle.trim(),
  diagnosisDescription: raw.diagnosisDescription.trim(),
  hybridTrapCheck:      raw.hybridTrapCheck.trim(),
  trustTrace:           raw.trustTrace.trim(),
  auditMatrix:          raw.auditMatrix,
  standardsCheck: (raw.standardsCheck || [])
    .slice(0, 3)
    .map((c) => ({
      criterion: String(c.criterion || '').trim(),
      status:    ['pass', 'partial', 'fail'].includes(String(c.status).toLowerCase()) ? String(c.status).toLowerCase() : 'unknown',
      evidence:  String(c.evidence || '').trim(),
    }))
    .filter((c) => c.criterion.length > 0),
  recommendations: (raw.recommendations || [])
    .map((r) => ({
      title:       String(r.title || '').trim(),
      description: String(r.description || '').trim(),
      impact:      ['high', 'medium', 'low'].includes(r.impact) ? r.impact : 'medium',
    }))
    .filter((r) => r.description.length > 0),
});

// ─── Generic provider call helpers ────────────────────────────────────────

async function callAnthropicGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = getModelName('anthropic', 'claude-3-5-sonnet-latest');

  const userContent = [{ type: 'text', text: contextText }];
  if (screenshot) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: screenshot.toString('base64') },
    });
  }

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    tools: [{
      name: toolName,
      description: `Return the structured ${toolName} result.`,
      input_schema: outputSchema,
    }],
    tool_choice: { type: 'tool', name: toolName },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error(`Claude did not return a tool_use block for ${toolName}.`);
  return toolUse.input;
}

async function callGeminiGeneric(systemPrompt, contextText, screenshot, geminiSchema) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY });
  const model = getModelName('gemini', 'gemini-2.0-flash-exp');

  const promptParts = [{ text: contextText }];
  if (screenshot) {
    promptParts.push({ inlineData: { data: screenshot.toString('base64'), mimeType: 'image/jpeg' } });
  }

  const response = await ai.models.generateContent({
    model,
    contents: promptParts,
    config: {
      temperature: 0.2,
      responseOptions: {
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
      },
      systemInstruction: systemPrompt,
    },
  });

  const text = (response.text || '{}').replace(/^```json\s*\n?/i, '').replace(/\n?```$/, '').trim();
  return JSON.parse(text);
}

async function callOpenAIGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  const model = getModelName('openai', null);
  if (!model) throw new Error('MODEL_NAME is required for the openai provider.');

  const useVision = process.env.OPENAI_VISION === 'true' && !!screenshot;
  const userContent = useVision
    ? [
        { type: 'text', text: contextText },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshot.toString('base64')}` } },
      ]
    : contextText;

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      tools: [{
        type: 'function',
        function: { name: toolName, description: `Return the structured ${toolName} result.`, parameters: outputSchema },
      }],
      tool_choice: { type: 'function', function: { name: toolName } },
    });
    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) return JSON.parse(toolCall.function.arguments);
  } catch { /* fallback to JSON mode */ }

  const schemaInstructions = `\n\nRespond with a valid JSON object matching this exact schema:\n${JSON.stringify(outputSchema, null, 2)}`;
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt + schemaInstructions },
      { role: 'user', content: userContent },
    ],
  });
  const text = (response.choices[0]?.message?.content || '{}')
    .replace(/^```json\s*\n?/i, '').replace(/\n?```$/, '').trim();
  return JSON.parse(text);
}

// ─── Provider detection ───────────────────────────────────────────────────────

function detectProvider() {
  const explicit = process.env.MODEL_PROVIDER?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'gemini' || explicit === 'openai') return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return 'openai';
  throw new Error('No AI API key found.');
}

/**
 * Convert a JSON Schema object to Gemini Type schema format.
 */
function toGeminiSchema(jsonSchema, Type) {
  function convert(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const result = {};
    switch (schema.type) {
      case 'object':
        result.type = Type.OBJECT;
        if (schema.properties) {
          result.properties = {};
          for (const [key, val] of Object.entries(schema.properties)) result.properties[key] = convert(val);
        }
        if (schema.required) result.required = schema.required;
        break;
      case 'array':
        result.type = Type.ARRAY;
        if (schema.items) result.items = convert(schema.items);
        break;
      case 'string':
        result.type = Type.STRING;
        if (schema.enum) result.enum = schema.enum;
        break;
      case 'integer':
      case 'number':
        result.type = Type.NUMBER;
        break;
      case 'boolean':
        result.type = Type.BOOLEAN;
        break;
      default:
        return schema;
    }
    return result;
  }
  return convert(jsonSchema);
}

/**
 * Universal persona caller. Routes to Anthropic or Gemini based on env.
 */
async function callWithPersona(systemPrompt, contextText, screenshot, outputSchema, toolName) {
  const provider = detectProvider();
  if (provider === 'anthropic') {
    return callAnthropicGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName);
  } else if (provider === 'openai') {
    return callOpenAIGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName);
  } else {
    const { Type } = await import('@google/genai');
    const geminiSchema = toGeminiSchema(outputSchema, Type);
    return callGeminiGeneric(systemPrompt, contextText, screenshot, geminiSchema);
  }
}

// ─── Persona analysis functions ───────────────────────────────────────────

function buildMemoryBlock(memory) {
  if (!memory || Object.keys(memory).length === 0) return '';
  const lines = ['## Site Memory (learned from prior scrapes)'];
  if (memory.scrapeCount) lines.push(`Scrape count: ${memory.scrapeCount}`);
  if (memory.facetNames?.length) lines.push(`Known facets: ${memory.facetNames.join(', ')}`);
  if (memory.performance) lines.push(`Perf baseline — DOM: ${memory.performance.domContentLoaded}ms, FCP: ${memory.performance.firstContentfulPaint}ms`);
  if (memory.notes?.length) lines.push(`Notes:\n${memory.notes.map((n) => `  - ${n}`).join('\n')}`);
  return lines.join('\n');
}

function buildPageDataBlock(pageData, memory = {}) {
  const withDesc = pageData.products.filter((p) => p.description && p.description.length > 20).length;
  const facetSummary = (pageData.facets || []).length > 0
    ? pageData.facets.map((f) => `${f.name} (${f.type}, ${f.optionCount} options): ${f.options.slice(0, 5).map((o) => o.label).join(', ')}`).join('\n')
    : 'None detected';

  return `## Scraped Page Data
URL: ${pageData.url}
Title: ${pageData.title}
Products found: ${pageData.products.length}
Description coverage: ${withDesc}/${pageData.products.length}

## Structural Detection
Grid selector: ${pageData.structure?.gridSelector || 'N/A'}
Card selector: ${pageData.structure?.cardSelector || 'N/A'}

## All Products
${JSON.stringify(pageData.products, null, 2)}

## Facets/Filters
${facetSummary}

## B2B/B2C Signal Analysis
Mode: ${pageData.b2bMode ?? 'Unknown'} | Conflict score: ${pageData.b2bConflictScore ?? 0}/100

${buildMemoryBlock(memory)}`.trim();
}

export function buildPersonaContext(fingerprint, memory = {}) {
  if (!fingerprint) return '';
  const lines = ['## Page Intelligence (pre-scan)'];
  if (fingerprint.pageType) lines.push(`- Page type: ${fingerprint.pageType}`);
  if (fingerprint.commerceMode) {
    const cm = fingerprint.commerceMode;
    lines.push(`- Commerce mode: ${cm.mode} (conflict: ${cm.conflictScore}/100)`);
  }
  if (fingerprint.priceTransparency) lines.push(`- Price transparency: ${fingerprint.priceTransparency}`);
  if (fingerprint.trustSignalInventory) {
    const ts = fingerprint.trustSignalInventory;
    lines.push(`- Trust signal inventory: ${ts.totalSignalTypes} types detected`);
  }
  if (fingerprint.funnelReadiness) lines.push(`- Funnel readiness: ${fingerprint.funnelReadiness}`);
  if (fingerprint.recommendedPersonas?.length) lines.push(`- Recommended personas: ${fingerprint.recommendedPersonas.join(', ')}`);
  return lines.join('\n');
}

export async function analyzeAsFloorWalker(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('floor-walker.md');
  const context = `${buildPersonaContext(pageData.fingerprint, memory)}\n\n${buildPageDataBlock(pageData, memory)}`;
  return callWithPersona(systemPrompt, context, screenshot, FLOOR_WALKER_SCHEMA, 'floor_walker_result');
}

export async function analyzeAsAuditor(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('auditor.md');
  const context = `${buildPersonaContext(pageData.fingerprint, memory)}\n\n${buildPageDataBlock(pageData, memory)}`;
  return callWithPersona(systemPrompt, context, screenshot, AUDITOR_SCHEMA, 'auditor_result');
}

export async function analyzeAsScout(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('scout.md');
  const context = `${buildPersonaContext(pageData.fingerprint, memory)}\n\n${buildPageDataBlock(pageData, memory)}`;
  return callWithPersona(systemPrompt, context, screenshot, SCOUT_SCHEMA, 'scout_result');
}

export async function analyzeAsAuditorB2B(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('auditor-b2b.md');
  const context = `${buildPersonaContext(pageData.fingerprint, memory)}\n\n${buildPageDataBlock(pageData, memory)}`;
  return callWithPersona(systemPrompt, context, screenshot, B2B_AUDITOR_SCHEMA, 'b2b_auditor_result');
}

export async function analyzeAsConversionArchitect(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('conversion-architect.md');
  const context = `${buildPersonaContext(pageData.fingerprint, memory)}\n\n${buildPageDataBlock(pageData, memory)}`;
  return callWithPersona(systemPrompt, context, screenshot, CONVERSION_ARCHITECT_SCHEMA, 'conversion_architect_result');
}

export async function runRoundtable(pageData, screenshot = null, memory = {}, onProgress = null, cached = {}, onPersonaCached = null) {
  if (!pageData.products?.length) return { url: pageData.url, error: 'No products found.', perspectives: null, debate: null };

  const isB2B = pageData.b2bMode === 'B2B' || (pageData.b2bConflictScore || 0) > 60;
  const auditorKey = isB2B ? 'b2b_auditor' : 'auditor';
  const auditorLabel = isB2B ? 'B2B Auditor' : 'Auditor';

  await onProgress?.(0, 8, `Starting parallel analysis (${isB2B ? 'B2B' : 'B2C'})...`);

  const [floorWalker, auditorResult, scout] = await Promise.all([
    cached.floor_walker ? Promise.resolve(cached.floor_walker) : analyzeAsFloorWalker(pageData, screenshot, memory).then(r => { onPersonaCached?.('floor_walker', r); return r; }),
    cached[auditorKey] ? Promise.resolve(cached[auditorKey]) : (isB2B ? analyzeAsAuditorB2B(pageData, screenshot, memory) : analyzeAsAuditor(pageData, screenshot, memory)).then(r => { onPersonaCached?.(auditorKey, r); return r; }),
    cached.scout ? Promise.resolve(cached.scout) : analyzeAsScout(pageData, screenshot, memory).then(r => { onPersonaCached?.('scout', r); return r; }),
  ]);

  const moderatorPrompt = loadPrompt('roundtable-moderator.md');
  const debateBrief = `Floor Walker: ${JSON.stringify(floorWalker)}\n${auditorLabel}: ${JSON.stringify(auditorResult)}\nScout: ${JSON.stringify(scout)}`;

  const perspectives = { floorWalker, [isB2B ? 'b2bAuditor' : 'auditor']: auditorResult, scout };
  const partialResult = { url: pageData.url, perspectives, debate: null };

  await onProgress?.(6, 8, 'Moderator synthesizing...');
  let debate = null;
  try {
    debate = await callWithPersona(moderatorPrompt, debateBrief, null, ROUNDTABLE_SCHEMA, 'roundtable_moderator_result');
    onPersonaCached?.('debate', debate);
  } catch (err) {
    await onProgress?.(7, 8, `Moderator failed: ${err.message}`);
  }

  return { ...partialResult, debate };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function compareStorefronts(pageDataA, pageDataB) {
  const trustCoverage = (products) => ({
    total: products.length,
    withRatings: products.filter((p) => p.trustSignals?.starRating != null).length,
    onSale: products.filter((p) => p.trustSignals?.onSale).length,
  });

  return {
    urls: { a: pageDataA.url, b: pageDataB.url },
    productCounts: { a: pageDataA.products.length, b: pageDataB.products.length, delta: pageDataB.products.length - pageDataA.products.length },
    trustSignals: { a: trustCoverage(pageDataA.products), b: trustCoverage(pageDataB.products) },
    b2bMode: { a: { mode: pageDataA.b2bMode, score: pageDataA.b2bConflictScore }, b: { mode: pageDataB.b2bMode, score: pageDataB.b2bConflictScore } },
  };
}

export function computePageFingerprint(pageData) {
  const url = pageData.url || '';
  const products = pageData.products || [];
  
  let pageType = 'unknown';
  if (products.length === 1) pageType = 'pdp';
  else if (products.length > 1) pageType = (pageData.facets?.length > 0) ? 'plp' : 'category';

  const commerceMode = { mode: pageData.b2bMode || 'B2C', conflictScore: pageData.b2bConflictScore ?? 0 };
  
  const ts = {
    ratingsPresent: products.some((p) => p.trustSignals?.starRating),
    onSalePresent: products.some((p) => p.trustSignals?.onSale),
  };
  ts.totalSignalTypes = Object.values(ts).filter(Boolean).length;

  let priceTransparency = 'public';
  if (products.some(p => /login|quote/i.test(p.price))) priceTransparency = 'hidden';

  const ctaRatio = products.length > 0 ? products.filter((p) => p.ctaText?.trim()).length / products.length : 0;
  const funnelReadiness = (ctaRatio > 0.5 && priceTransparency === 'public') ? 'ready' : 'partial';

  const recommended = new Set();
  if (commerceMode.mode === 'B2B' || commerceMode.conflictScore > 60) recommended.add('b2b_auditor');
  if (pageType === 'plp') recommended.add('scout');
  if (commerceMode.conflictScore > 30) recommended.add('conversion_architect');
  if (!ts.ratingsPresent) recommended.add('floor_walker');
  
  const recommendedPersonas = [...recommended].slice(0, 3);
  if (recommendedPersonas.length < 2) {
    if (!recommended.has('floor_walker')) recommendedPersonas.push('floor_walker');
    if (!recommended.has('auditor')) recommendedPersonas.push('auditor');
  }

  return { pageType, commerceMode, priceTransparency, trustSignalInventory: ts, funnelReadiness, recommendedPersonas: recommendedPersonas.slice(0, 3) };
}

export function selectPersonas(fingerprint) {
  return fingerprint?.recommendedPersonas || ['floor_walker', 'auditor', 'scout'];
}

export async function analyzePage(pageData, screenshot = null) {
  if (!pageData.products?.length) return { siteMode: 'Unknown', diagnosisTitle: 'No Products Found' };
  const provider = detectProvider();
  const contextText = `Audit this storefront page:\n${JSON.stringify(pageData.products.slice(0, 10))}`;
  
  let raw;
  if (provider === 'anthropic') raw = await callAnthropicGeneric(getSystemPrompt(), contextText, screenshot, AUDIT_SCHEMA, 'audit_result');
  else if (provider === 'openai') raw = await callOpenAIGeneric(getSystemPrompt(), contextText, screenshot, AUDIT_SCHEMA, 'audit_result');
  else {
    const { Type } = await import('@google/genai');
    raw = await callGeminiGeneric(getSystemPrompt(), contextText, screenshot, toGeminiSchema(AUDIT_SCHEMA, Type));
  }
  return normalize(raw);
}

const PAGE_QA_SYSTEM = `You are a merchandising expert. Answer the user's question about this storefront.`;

export async function askPage(pageData, question, screenshot = null) {
  const provider = detectProvider();
  const context = `URL: ${pageData.url}\nProducts: ${JSON.stringify(pageData.products.slice(0, 10))}\nQuestion: ${question}`;
  
  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: getModelName('anthropic', 'claude-3-5-sonnet-latest'),
      max_tokens: 2048,
      system: PAGE_QA_SYSTEM,
      messages: [{ role: 'user', content: context }],
    });
    return response.content[0].text;
  }
  return "QA result placeholder (OpenAI/Gemini support pending)";
}

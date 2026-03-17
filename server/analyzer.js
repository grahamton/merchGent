/**
 * Analyzer
 * Model-agnostic merchandising analysis. Auto-detects provider from env vars.
 *
 * Provider selection (in order):
 *   1. MODEL_PROVIDER env var ('anthropic' | 'gemini')
 *   2. ANTHROPIC_API_KEY present → anthropic
 *   3. GEMINI_API_KEY present    → gemini
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Shared: prompt builders ──────────────────────────────────────────────────

const getSystemPrompt = () =>
  fs.readFileSync(path.join(__dirname, 'prompts', 'SYSTEM_PROMPT_V2.md'), 'utf8');

const buildContextBlock = (pageData) => {
  const withDesc = pageData.products.filter((p) => p.description && p.description.length > 20).length;
  return `
## Scraped Page Data
URL: ${pageData.url}
Title: ${pageData.title}
Meta: ${pageData.metaDescription || 'N/A'}
Products sampled: ${pageData.products.length}
Description coverage: ${withDesc}/${pageData.products.length}

## Structural Detection
Grid selector: ${pageData.structure?.gridSelector || 'N/A'}
Card selector: ${pageData.structure?.cardSelector || 'N/A'}
Confidence: ${pageData.structure?.confidence || 'N/A'}

## Product Sample (first 3)
${JSON.stringify(pageData.products.slice(0, 3), null, 2)}

## Heuristic Signals
B2B indicators present: ${pageData.products.some((p) => p.b2bIndicators.length > 0)}
B2C indicators present: ${pageData.products.some((p) => p.b2cIndicators.length > 0)}

## Audit Instructions
Assess 4 dimensions:
1. TRUST — Are titles normalized? Cite messy examples by name.
2. GUIDANCE — Is the grid scannable? Visual hierarchy?
3. PERSUASION — Badges, ratings, "why buy" signals present?
4. FRICTION — Hidden prices, unclear CTAs, B2B/B2C conflict?
`.trim();
};

// ─── Shared: output schema (JSON Schema format) ───────────────────────────────

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

// ─── Shared: validation + normalization ───────────────────────────────────────

const validate = (raw) => {
  if (!raw || typeof raw !== 'object') return 'Response was not a JSON object.';
  if (!raw.trustTrace?.trim()) return 'Missing trustTrace.';
  if (!['B2B', 'B2C', 'Hybrid'].includes(raw.siteMode)) return 'Invalid siteMode.';
  if (!raw.diagnosisTitle?.trim()) return 'Missing diagnosisTitle.';
  if (!raw.diagnosisDescription?.trim()) return 'Missing diagnosisDescription.';
  if (!raw.hybridTrapCheck?.trim()) return 'Missing hybridTrapCheck.';
  if (!Array.isArray(raw.standardsCheck)) return 'standardsCheck must be an array.';
  if (!Array.isArray(raw.recommendations)) return 'recommendations must be an array.';
  if (!raw.auditMatrix || typeof raw.auditMatrix !== 'object') return 'Missing auditMatrix.';
  return null;
};

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

// ─── Provider: Anthropic (Claude) ─────────────────────────────────────────────

async function callAnthropic(contextText, screenshot) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.MODEL_NAME || 'claude-opus-4-6';

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
    thinking: { type: 'adaptive' },
    system: getSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
    tools: [{
      name: 'audit_result',
      description: 'Return the structured merchandising audit result.',
      input_schema: AUDIT_SCHEMA,
    }],
    tool_choice: { type: 'tool', name: 'audit_result' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a tool_use block.');
  return toolUse.input;
}

// ─── Provider: Google Gemini ──────────────────────────────────────────────────

async function callGemini(contextText, screenshot) {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY });
  const model = process.env.MODEL_NAME || 'gemini-2.5-pro';

  // Convert JSON Schema to Gemini Type schema
  const geminiAuditDimension = {
    type: Type.OBJECT,
    properties: {
      status:  { type: Type.STRING, enum: ['pass', 'fail', 'check'] },
      finding: { type: Type.STRING },
    },
    required: ['status', 'finding'],
  };

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
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trustTrace:           { type: Type.STRING },
            siteMode:             { type: Type.STRING, enum: ['B2B', 'B2C', 'Hybrid'] },
            diagnosisTitle:       { type: Type.STRING },
            diagnosisDescription: { type: Type.STRING },
            hybridTrapCheck:      { type: Type.STRING },
            auditMatrix: {
              type: Type.OBJECT,
              properties: {
                trust:      geminiAuditDimension,
                guidance:   geminiAuditDimension,
                persuasion: geminiAuditDimension,
                friction:   geminiAuditDimension,
              },
              required: ['trust', 'guidance', 'persuasion', 'friction'],
            },
            standardsCheck: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  criterion: { type: Type.STRING },
                  status:    { type: Type.STRING },
                  evidence:  { type: Type.STRING },
                },
                required: ['criterion', 'status', 'evidence'],
              },
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title:       { type: Type.STRING },
                  description: { type: Type.STRING },
                  impact:      { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                },
                required: ['title', 'description', 'impact'],
              },
            },
          },
          required: ['trustTrace', 'siteMode', 'diagnosisTitle', 'diagnosisDescription', 'hybridTrapCheck', 'auditMatrix', 'standardsCheck', 'recommendations'],
        },
      },
      systemInstruction: getSystemPrompt(),
    },
  });

  const text = (response.text || '{}').replace(/^```json\s*\n?/i, '').replace(/\n?```$/, '').trim();
  return JSON.parse(text);
}

// ─── Provider detection ───────────────────────────────────────────────────────

function detectProvider() {
  const explicit = process.env.MODEL_PROVIDER?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'gemini') return explicit;
  if (explicit) throw new Error(`Unknown MODEL_PROVIDER "${explicit}". Use "anthropic" or "gemini".`);
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) return 'gemini';
  throw new Error('No AI API key found. Set ANTHROPIC_API_KEY or GEMINI_API_KEY (and optionally MODEL_PROVIDER).');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a merchandising audit on pre-scraped page data.
 *
 * Provider is selected automatically from env vars:
 *   MODEL_PROVIDER=anthropic → Claude claude-opus-4-6
 *   MODEL_PROVIDER=gemini    → Gemini 2.5 Flash
 *   (unset) → whichever API key is present; Anthropic wins if both set
 *
 * @param {object} pageData     - Output from scrapePage()
 * @param {Buffer} [screenshot] - Optional JPEG screenshot buffer
 * @returns {object} Structured audit result
 */
export async function analyzePage(pageData, screenshot = null) {
  // Fast escape hatch — nothing to analyze
  if (!pageData.products || pageData.products.length === 0) {
    return {
      siteMode: 'Unknown',
      diagnosisTitle: 'Scrape Failed — No Products Found',
      diagnosisDescription: 'The scraper could not extract structured product data. The site may block headless browsers or use a non-standard layout.',
      hybridTrapCheck: 'N/A',
      trustTrace: 'Zero products extracted. Analysis skipped.',
      auditMatrix: {
        trust:      { status: 'fail',  finding: 'No data to evaluate.' },
        guidance:   { status: 'check', finding: 'No visual data available.' },
        persuasion: { status: 'check', finding: 'No content analyzed.' },
        friction:   { status: 'check', finding: 'No interaction data.' },
      },
      standardsCheck: [],
      recommendations: [],
    };
  }

  const provider = detectProvider();
  const contextText = buildContextBlock(pageData);

  console.error(`[Analyzer] Using provider: ${provider}`);

  let raw;
  try {
    raw = provider === 'anthropic'
      ? await callAnthropic(contextText, screenshot)
      : await callGemini(contextText, screenshot);
  } catch (err) {
    throw new Error(`${provider} analysis failed: ${err.message}`);
  }

  const validationError = validate(raw);
  if (validationError) throw new Error(`Invalid model response: ${validationError}`);

  return normalize(raw);
}

// ─── ask_page: free-form Q&A about a scraped page ────────────────────────────

const PAGE_QA_SYSTEM = `You are a merchandising expert looking at a scraped storefront page.
You have access to the extracted product data, facet/filter structure, page metadata, performance timing, and a screenshot.
Answer the user's question directly and specifically, citing product names, prices, and data points from the scrape.
Be concise. If the data doesn't contain what's needed to answer, say so.`;

async function askAnthropic(context, question, screenshot) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.MODEL_NAME || 'claude-opus-4-6';

  const userContent = [{ type: 'text', text: `${context}\n\n## Question\n${question}` }];
  if (screenshot) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: screenshot.toString('base64') },
    });
  }

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: PAGE_QA_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text || 'No response generated.';
}

async function askGemini(context, question, screenshot) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY });
  const model = process.env.MODEL_NAME || 'gemini-2.5-pro';

  const parts = [{ text: `${context}\n\n## Question\n${question}` }];
  if (screenshot) {
    parts.push({ inlineData: { data: screenshot.toString('base64'), mimeType: 'image/jpeg' } });
  }

  const response = await ai.models.generateContent({
    model,
    contents: parts,
    config: { temperature: 0.3, systemInstruction: PAGE_QA_SYSTEM },
  });

  return response.text || 'No response generated.';
}

/**
 * Ask a free-form question about a scraped page.
 *
 * @param {object} pageData     - Output from scrapePage()
 * @param {string} question     - Natural language question
 * @param {Buffer} [screenshot] - Optional JPEG screenshot buffer
 * @returns {string} Conversational answer
 */
export async function askPage(pageData, question, screenshot = null) {
  const provider = detectProvider();

  // Build a rich context block with everything we have
  const facetSummary = (pageData.facets || []).length > 0
    ? pageData.facets.map((f) => `${f.name} (${f.type}, ${f.optionCount} options): ${f.options.slice(0, 5).map((o) => o.label).join(', ')}${f.optionCount > 5 ? '...' : ''}`).join('\n')
    : 'None detected';

  const perfSummary = pageData.performance
    ? `DOM loaded: ${pageData.performance.domContentLoaded}ms, FCP: ${pageData.performance.firstContentfulPaint}ms, Full load: ${pageData.performance.loadComplete}ms, Resources: ${pageData.performance.resourceCount}`
    : 'Not available';

  const context = `## Page: ${pageData.title}
URL: ${pageData.url}
Meta: ${pageData.metaDescription || 'N/A'}

## Performance
${perfSummary}

## Structure
Grid: ${pageData.structure?.gridSelector || 'N/A'} | Card: ${pageData.structure?.cardSelector || 'N/A'}

## Products (${pageData.products.length} found)
${JSON.stringify(pageData.products, null, 2)}

## Facets/Filters
${facetSummary}

## Findings
${(pageData.findings || []).map((f) => `[${f.severity}] ${f.title}: ${f.description}`).join('\n') || 'None'}

## Interactable Elements (first 10)
${(pageData.interactables || []).slice(0, 10).map((i) => `[${i.type}] "${i.text}" → ${i.selector}`).join('\n') || 'None'}`;

  console.error(`[AskPage] Using provider: ${provider}`);

  try {
    return provider === 'anthropic'
      ? await askAnthropic(context, question, screenshot)
      : await askGemini(context, question, screenshot);
  } catch (err) {
    throw new Error(`${provider} Q&A failed: ${err.message}`);
  }
}

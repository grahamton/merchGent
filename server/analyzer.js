/**
 * Analyzer
 * Model-agnostic merchandising analysis. Auto-detects provider from env vars.
 *
 * Provider selection (in order):
 *   1. MODEL_PROVIDER env var ('anthropic' | 'gemini')
 *   2. ANTHROPIC_API_KEY present → anthropic
 *   3. GEMINI_API_KEY present    → gemini
 *
 * Personas:
 *   - Floor Walker: shopper-experience lens
 *   - Auditor: structured framework evaluation
 *   - Scout: competitive / strategic analysis
 *   - Roundtable: all three + moderator debate synthesis
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Only apply MODEL_NAME when MODEL_PROVIDER is explicitly set and matches the active provider.
// Prevents MODEL_NAME=qwen/qwen3.5-9b leaking into Anthropic API calls when provider auto-detects.
function getModelName(provider, defaultModel) {
  const explicit = process.env.MODEL_PROVIDER?.toLowerCase();
  if (explicit === provider && process.env.MODEL_NAME) return process.env.MODEL_NAME;
  return defaultModel;
}

// ─── Shared: prompt loaders ─────────────────────────────────────────────────

const loadPrompt = (filename) =>
  fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf8');

const getSystemPrompt = () => loadPrompt('SYSTEM_PROMPT_V2.md');

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
  const model = getModelName('anthropic', 'claude-sonnet-4-6');

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
  const model = getModelName('gemini', 'gemini-2.5-pro');

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
  if (explicit === 'anthropic' || explicit === 'gemini' || explicit === 'openai') return explicit;
  if (explicit) throw new Error(`Unknown MODEL_PROVIDER "${explicit}". Use "anthropic", "gemini", or "openai".`);
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return 'openai';
  throw new Error('No AI API key found. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY (and optionally MODEL_PROVIDER).');
}

// ─── Persona schemas ──────────────────────────────────────────────────────

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
    score:           { type: 'integer', minimum: 0, maximum: 100, description: 'Overall page score 0–100 from this persona\'s perspective' },
    severity:        { type: 'integer', minimum: 1, maximum: 5, description: 'Urgency of the top concern: 5=emergency blocking conversion, 1=minor polish' },
    findings:        { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5, description: 'Concrete specific observations (not recommendations) — things observed, measured, or felt' },
    uniqueInsight:   { type: 'string', description: 'The one observation only this persona would make that the others likely missed' },
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
    score:         { type: 'integer', minimum: 0, maximum: 100, description: 'Overall page score 0–100 from this persona\'s perspective' },
    severity:      { type: 'integer', minimum: 1, maximum: 5, description: 'Urgency of the top concern: 5=emergency blocking conversion, 1=minor polish' },
    findings:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5, description: 'Concrete specific observations (not recommendations) — things observed, measured, or felt' },
    uniqueInsight: { type: 'string', description: 'The one observation only this persona would make that the others likely missed' },
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
    score:              { type: 'integer', minimum: 0, maximum: 100, description: 'Overall page score 0–100 from this persona\'s perspective' },
    severity:           { type: 'integer', minimum: 1, maximum: 5, description: 'Urgency of the top concern: 5=emergency blocking conversion, 1=minor polish' },
    findings:           { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5, description: 'Concrete specific observations (not recommendations) — things observed, measured, or felt' },
    uniqueInsight:      { type: 'string', description: 'The one observation only this persona would make that the others likely missed' },
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
    score:         { type: 'integer', minimum: 0, maximum: 100, description: 'Overall page score 0–100 from this persona\'s perspective' },
    severity:      { type: 'integer', minimum: 1, maximum: 5, description: 'Urgency of the top concern: 5=emergency blocking conversion, 1=minor polish' },
    findings:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5, description: 'Concrete specific observations (not recommendations) — things observed, measured, or felt' },
    uniqueInsight: { type: 'string', description: 'The one observation only this persona would make that the others likely missed' },
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
          endorsedBy:  { type: 'array', items: { type: 'string', enum: ['floorWalker', 'auditor', 'scout'] } },
        },
      },
    },
  },
};

// ─── Generic provider call helpers ────────────────────────────────────────

/**
 * Call Anthropic with a custom system prompt and output schema.
 * Uses tool_choice forcing to guarantee structured output.
 */
async function callAnthropicGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = getModelName('anthropic', 'claude-sonnet-4-6');

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

/**
 * Call Gemini with a custom system prompt and output schema.
 * Uses responseSchema for structured JSON output.
 */
async function callGeminiGeneric(systemPrompt, contextText, screenshot, geminiSchema) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY });
  const model = getModelName('gemini', 'gemini-2.5-pro');

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

// ─── Provider: OpenAI-compatible (Groq, Together AI, OpenAI, etc.) ────────────

/**
 * Call any OpenAI-compatible endpoint with tool_choice forcing, falling back to
 * JSON prompt mode for models that don't support function calling.
 *
 * Key env vars:
 *   OPENAI_API_KEY   — API key (required)
 *   OPENAI_BASE_URL  — Base URL (optional; defaults to https://api.openai.com/v1)
 *   MODEL_NAME       — Required: model identifier as the endpoint expects it
 *   OPENAI_VISION    — Set "true" to include screenshot as image_url (vision-capable models only)
 */
async function callOpenAIGeneric(systemPrompt, contextText, screenshot, outputSchema, toolName) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  const model = getModelName('openai', null);
  if (!model) throw new Error('MODEL_NAME is required for the openai provider (e.g., MODEL_NAME=llama-3.1-8b-instruct).');

  const useVision = process.env.OPENAI_VISION === 'true' && !!screenshot;
  const userContent = useVision
    ? [
        { type: 'text', text: contextText },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshot.toString('base64')}` } },
      ]
    : contextText;

  // Attempt 1: structured tool calling (works on most capable models)
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
  } catch { /* fall through to JSON prompt mode */ }

  // Attempt 2: JSON prompt mode (works on all instruction-following models)
  const schemaInstructions = `\n\nRespond with a valid JSON object matching this exact schema. Output only the JSON, no other text:\n${JSON.stringify(outputSchema, null, 2)}`;
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

async function callOpenAI(contextText, screenshot) {
  return callOpenAIGeneric(getSystemPrompt(), contextText, screenshot, AUDIT_SCHEMA, 'audit_result');
}

async function askOpenAI(context, question, screenshot) {
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
        { type: 'text', text: `${context}\n\n## Question\n${question}` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshot.toString('base64')}` } },
      ]
    : `${context}\n\n## Question\n${question}`;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: PAGE_QA_SYSTEM },
      { role: 'user', content: userContent },
    ],
  });
  return response.choices[0]?.message?.content || 'No response generated.';
}

/**
 * Convert a JSON Schema object to Gemini Type schema format.
 * @param {object} jsonSchema - Standard JSON Schema
 * @param {object} Type - Gemini Type enum
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
          for (const [key, val] of Object.entries(schema.properties)) {
            result.properties[key] = convert(val);
          }
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
  console.error(`[Persona:${toolName}] Using provider: ${provider}`);

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
  if (memory.customFields && Object.keys(memory.customFields).length > 0) {
    for (const [k, v] of Object.entries(memory.customFields)) lines.push(`  ${k}: ${v}`);
  }
  return lines.join('\n');
}

/**
 * Build a rich context block for persona analysis (includes more detail than the audit context).
 */
function buildPageDataBlock(pageData, memory = {}) {
  const withDesc = pageData.products.filter((p) => p.description && p.description.length > 20).length;

  const facetSummary = (pageData.facets || []).length > 0
    ? pageData.facets.map((f) => `${f.name} (${f.type}, ${f.optionCount} options): ${f.options.slice(0, 5).map((o) => o.label).join(', ')}${f.optionCount > 5 ? '...' : ''}`).join('\n')
    : 'None detected';

  const perfSummary = pageData.performance
    ? `DOM loaded: ${pageData.performance.domContentLoaded}ms, FCP: ${pageData.performance.firstContentfulPaint}ms, Full load: ${pageData.performance.loadComplete}ms, Resources: ${pageData.performance.resourceCount}`
    : 'Not available';

  return `## Scraped Page Data
URL: ${pageData.url}
Title: ${pageData.title}
Meta: ${pageData.metaDescription || 'N/A'}
Products found: ${pageData.products.length}
Description coverage: ${withDesc}/${pageData.products.length}

## Performance
${perfSummary}

## Structural Detection
Grid selector: ${pageData.structure?.gridSelector || 'N/A'}
Card selector: ${pageData.structure?.cardSelector || 'N/A'}
Confidence: ${pageData.structure?.confidence || 'N/A'}

## All Products
${JSON.stringify(pageData.products, null, 2)}

## Facets/Filters
${facetSummary}

## B2B/B2C Signal Analysis
${(() => {
  const total = pageData.products.length;
  const b2bCount = pageData.products.filter((p) => p.b2bIndicators?.length > 0).length;
  const b2cCount = pageData.products.filter((p) => p.b2cIndicators?.length > 0).length;
  const bothCount = pageData.products.filter((p) => p.b2bIndicators?.length > 0 && p.b2cIndicators?.length > 0).length;
  const allB2bKw = [...new Set(pageData.products.flatMap((p) => p.b2bIndicators || []))];
  const allB2cKw = [...new Set(pageData.products.flatMap((p) => p.b2cIndicators || []))];
  const conflictScore = pageData.b2bConflictScore ?? (total > 0 ? Math.round((bothCount / total) * 100) : 0);
  const mode = pageData.b2bMode ?? 'Unknown';
  return `Mode: ${mode} | Conflict score: ${conflictScore}/100
Products with B2B signals: ${b2bCount}/${total} — keywords: ${allB2bKw.join(', ') || 'none'}
Products with B2C signals: ${b2cCount}/${total} — keywords: ${allB2cKw.join(', ') || 'none'}
Products with both (conflict): ${bothCount}`;
})()}

## Findings
${(pageData.findings || []).map((f) => `[${f.severity}] ${f.title}: ${f.description}`).join('\n') || 'None'}

## Interactable Elements (first 10)
${(pageData.interactables || []).slice(0, 10).map((i) => `[${i.type}] "${i.text}" → ${i.selector}`).join('\n') || 'None'}

${buildMemoryBlock(memory)}`.trim();
}

/**
 * Format a pre-computed PageFingerprint into a concise orientation block.
 * Prepended to each persona's user-message prompt so the AI has structural
 * context before reading the full product data.
 *
 * @param {object|null} fingerprint - PageFingerprint from computePageFingerprint()
 * @param {object}      [memory]    - Site memory object (optional)
 * @returns {string} Formatted context block, or empty string if fingerprint is absent
 */
export function buildPersonaContext(fingerprint, memory = {}) {
  if (!fingerprint) return '';

  const lines = ['## Page Intelligence (pre-scan)'];

  if (fingerprint.pageType)          lines.push(`- Page type: ${fingerprint.pageType}`);
  if (fingerprint.platform)          lines.push(`- Platform: ${fingerprint.platform}`);
  if (fingerprint.commerceMode) {
    const cm = fingerprint.commerceMode;
    const modeStr = cm.mode || cm;
    const conflictStr = typeof cm.conflictScore === 'number' ? ` (conflict score: ${cm.conflictScore}/100)` : '';
    lines.push(`- Commerce mode: ${modeStr}${conflictStr}`);
  }
  if (fingerprint.priceTransparency)  lines.push(`- Price transparency: ${fingerprint.priceTransparency}`);
  if (fingerprint.trustSignalInventory) {
    const ts = fingerprint.trustSignalInventory;
    const present = Object.entries(ts)
      .filter(([k, v]) => k !== 'totalSignalTypes' && v === true)
      .map(([k]) => k.replace(/Present$/, '').replace(/([A-Z])/g, ' $1').toLowerCase().trim());
    const signalStr = present.length > 0 ? present.join(', ') : 'none';
    lines.push(`- Trust signal inventory: ${ts.totalSignalTypes ?? 0} type(s) — ${signalStr}`);
  }
  if (fingerprint.discoveryQuality) {
    const dq = fingerprint.discoveryQuality;
    const parts = [];
    if (typeof dq.facetCount === 'number')      parts.push(`${dq.facetCount} facets`);
    if (typeof dq.sortOptionCount === 'number') parts.push(`${dq.sortOptionCount} sort options`);
    if (dq.hasSearch)                           parts.push('search present');
    lines.push(`- Discovery quality: ${parts.join(', ') || 'unknown'}`);
  }
  if (fingerprint.funnelReadiness)    lines.push(`- Funnel readiness: ${fingerprint.funnelReadiness}`);
  if (fingerprint.topRisks?.length)   lines.push(`- Top risks: ${fingerprint.topRisks.join(', ')}`);
  if (fingerprint.recommendedPersonas?.length) {
    lines.push(`- Recommended personas: ${fingerprint.recommendedPersonas.join(', ')}`);
  }

  const block = lines.join('\n');

  // Append brief site memory section if notes or summary are present
  const memLines = [];
  if (memory?.notes?.length)   memLines.push(`Notes: ${memory.notes.slice(0, 3).map((n) => `"${n}"`).join('; ')}`);
  if (memory?.summary?.trim()) memLines.push(`Summary: ${memory.summary.trim()}`);
  const memBlock = memLines.length > 0
    ? `\n\n## Site Memory\n${memLines.map((l) => `- ${l}`).join('\n')}`
    : '';

  return `${block}${memBlock}`;
}

/**
 * Analyze a page as the Floor Walker persona.
 * Returns a shopper-experience focused assessment.
 */
export async function analyzeAsFloorWalker(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('floor-walker.md');
  const fingerprintContext = buildPersonaContext(pageData.fingerprint, memory);
  const pageDataContext = buildPageDataBlock(pageData, memory);
  const contextText = fingerprintContext ? `${fingerprintContext}\n\n${pageDataContext}` : pageDataContext;
  return callWithPersona(systemPrompt, contextText, screenshot, FLOOR_WALKER_SCHEMA, 'floor_walker_result');
}

/**
 * Analyze a page as the Auditor persona.
 * Returns a structured framework evaluation.
 */
export async function analyzeAsAuditor(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('auditor.md');
  const fingerprintContext = buildPersonaContext(pageData.fingerprint, memory);
  const pageDataContext = buildPageDataBlock(pageData, memory);
  const contextText = fingerprintContext ? `${fingerprintContext}\n\n${pageDataContext}` : pageDataContext;
  return callWithPersona(systemPrompt, contextText, screenshot, AUDITOR_SCHEMA, 'auditor_result');
}

/**
 * Analyze a page as the Scout persona.
 * Returns a competitive/strategic assessment.
 */
export async function analyzeAsScout(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('scout.md');
  const fingerprintContext = buildPersonaContext(pageData.fingerprint, memory);
  const pageDataContext = buildPageDataBlock(pageData, memory);
  const contextText = fingerprintContext ? `${fingerprintContext}\n\n${pageDataContext}` : pageDataContext;
  return callWithPersona(systemPrompt, contextText, screenshot, SCOUT_SCHEMA, 'scout_result');
}

/**
 * Analyze a page as the B2B Auditor persona.
 * Returns a procurement-focused evaluation with steps-to-PO scoring.
 */
export async function analyzeAsAuditorB2B(pageData, screenshot = null, memory = {}) {
  const systemPrompt = loadPrompt('auditor-b2b.md');
  const fingerprintContext = buildPersonaContext(pageData.fingerprint, memory);
  const pageDataContext = buildPageDataBlock(pageData, memory);
  const contextText = fingerprintContext ? `${fingerprintContext}\n\n${pageDataContext}` : pageDataContext;
  return callWithPersona(systemPrompt, contextText, screenshot, B2B_AUDITOR_SCHEMA, 'b2b_auditor_result');
}

/**
 * Run the full roundtable: all three personas in sequence, then a moderator debate.
 *
 * Each persona runs against the same page data. The moderator receives all three
 * perspectives and synthesizes consensus, disagreements, and final recommendations.
 *
 * @param {object} pageData     - Output from scrapePage()
 * @param {Buffer} [screenshot] - Optional JPEG screenshot buffer
 * @returns {object} Full roundtable output with perspectives and debate
 */
export async function runRoundtable(pageData, screenshot = null, memory = {}, onProgress = null, cached = {}, onPersonaCached = null) {
  if (!pageData.products || pageData.products.length === 0) {
    return {
      url: pageData.url,
      error: 'No products found. The scraper could not extract structured product data.',
      perspectives: null,
      debate: null,
    };
  }

  // Reuse pre-computed persona results when available (e.g. from a prior audit_storefront call).
  // Uncached personas run in parallel via Promise.all — cuts wall-clock time from ~3× to ~1×
  // before the moderator call, reducing timeout risk significantly.
  await onProgress?.(0, 8, 'Starting parallel persona analysis...');
  console.error('[Roundtable] Starting parallel persona analysis...');

  const [floorWalker, auditor, scout] = await Promise.all([
    cached.floor_walker
      ? Promise.resolve(cached.floor_walker)
      : analyzeAsFloorWalker(pageData, screenshot, memory).then(r => { onPersonaCached?.('floor_walker', r); return r; }),
    cached.auditor
      ? Promise.resolve(cached.auditor)
      : analyzeAsAuditor(pageData, screenshot, memory).then(r => { onPersonaCached?.('auditor', r); return r; }),
    cached.scout
      ? Promise.resolve(cached.scout)
      : analyzeAsScout(pageData, screenshot, memory).then(r => { onPersonaCached?.('scout', r); return r; }),
  ]);

  // Emit progress notifications for each persona once all three resolve
  await onProgress?.(1, 8, `Floor Walker ✓${cached.floor_walker ? ' (cached)' : ''} — ${floorWalker.topConcern}`, {
    persona: 'floorWalker', topConcern: floorWalker.topConcern,
    summary: floorWalker.summary, cached: !!cached.floor_walker,
  });
  await onProgress?.(3, 8, `Auditor ✓${cached.auditor ? ' (cached)' : ''} — ${auditor.topConcern}`, {
    persona: 'auditor', topConcern: auditor.topConcern, summary: auditor.summary,
    siteMode: auditor.siteMode, cached: !!cached.auditor,
  });
  await onProgress?.(5, 8, `Scout ✓${cached.scout ? ' (cached)' : ''} — ${scout.topConcern}`, {
    persona: 'scout', topConcern: scout.topConcern,
    summary: scout.summary, cached: !!cached.scout,
  });
  console.error('[Roundtable] All three personas complete.');

  // Build the debate brief for the moderator
  const moderatorPrompt = loadPrompt('roundtable-moderator.md');
  const debateBrief = `## Page Under Review
URL: ${pageData.url}
Title: ${pageData.title}
Products found: ${pageData.products.length}

---

## Floor Walker's Perspective
${JSON.stringify(floorWalker, null, 2)}

---

## Auditor's Perspective
${JSON.stringify(auditor, null, 2)}

---

## Scout's Perspective
${JSON.stringify(scout, null, 2)}

---

Now synthesize these three perspectives. Identify where they agree, where they disagree, and produce prioritized final recommendations that draw from the strongest insights across all three viewpoints.`;

  // Build the partial result with all three persona perspectives — this is returned immediately
  // to the MCP client so the tool call completes before the client timeout fires.
  const partialResult = {
    url: pageData.url,
    perspectives: {
      floorWalker: {
        summary:        floorWalker.summary,
        topConcern:     floorWalker.topConcern,
        customerImpact: floorWalker.firstImpression,
      },
      auditor: {
        summary:    auditor.summary,
        matrix:     auditor.matrix,
        topConcern: auditor.topConcern,
        dataPoint:  auditor.dataPoint,
      },
      scout: {
        summary:        scout.summary,
        topConcern:     scout.topConcern,
        competitiveGap: scout.competitiveGaps,
      },
    },
    debate: null,  // populated async via roundtable_moderator_result notification
    moderatorPending: true,
    // Include full persona outputs for detailed inspection
    _raw: { floorWalker, auditor, scout },
  };

  // Run the moderator synchronously so the full debate is included in the tool response.
  console.error('[Roundtable] Starting Moderator synthesis...');
  await onProgress?.(6, 8, 'Moderator synthesizing...');

  let debate = null;
  try {
    debate = await callWithPersona(moderatorPrompt, debateBrief, null, ROUNDTABLE_SCHEMA, 'roundtable_moderator_result');
    await onProgress?.(7, 8, 'Moderator ✓ — consensus reached', {
      persona: 'moderator',
      consensus: debate.consensus,
      recommendationCount: (debate.finalRecommendations || []).length,
      disagreementCount: (debate.disagreements || []).length,
      disagreements: (debate.disagreements || []).map((d) => d.topic),
    });
  } catch (err) {
    sendLog?.('error', `[Roundtable] Moderator synthesis failed: ${err.message}`);
    await onProgress?.(7, 8, `Moderator failed: ${err.message}`, {
      persona: 'moderator',
      error: err.message,
    });
  }

  return {
    ...partialResult,
    debate,
    moderatorPending: false,
  };
}

// ─── Competitor comparison ────────────────────────────────────────────────────

/**
 * Produce a structured diff between two scraped storefronts.
 * Pure structural analysis — no AI call needed.
 *
 * @param {object} pageDataA - Output from scrapePage() for site A
 * @param {object} pageDataB - Output from scrapePage() for site B
 * @returns {object} Structured comparison result
 */
export function compareStorefronts(pageDataA, pageDataB) {
  const facetNamesA = new Set((pageDataA.facets || []).map((f) => f.name));
  const facetNamesB = new Set((pageDataB.facets || []).map((f) => f.name));

  const sortLabelsA = pageDataA.sortOptions?.options?.map((o) => o.label) || [];
  const sortLabelsB = pageDataB.sortOptions?.options?.map((o) => o.label) || [];

  const trustCoverage = (products) => {
    const total = products.length;
    if (total === 0) return { total: 0, withRatings: 0, withReviews: 0, onSale: 0, bestSeller: 0 };
    return {
      total,
      withRatings:  products.filter((p) => p.trustSignals?.starRating != null).length,
      withReviews:  products.filter((p) => p.trustSignals?.reviewCount != null).length,
      onSale:       products.filter((p) => p.trustSignals?.onSale).length,
      bestSeller:   products.filter((p) => p.trustSignals?.bestSeller).length,
    };
  };

  const perfA = pageDataA.performance;
  const perfB = pageDataB.performance;
  const performance = perfA && perfB ? {
    a: { fcp: perfA.firstContentfulPaint, load: perfA.loadComplete },
    b: { fcp: perfB.firstContentfulPaint, load: perfB.loadComplete },
    fcpDelta:  perfB.firstContentfulPaint - perfA.firstContentfulPaint,
    loadDelta: perfB.loadComplete - perfA.loadComplete,
    faster: perfB.firstContentfulPaint < perfA.firstContentfulPaint ? 'b' : 'a',
  } : null;

  return {
    urls: { a: pageDataA.url, b: pageDataB.url },
    titles: { a: pageDataA.title, b: pageDataB.title },
    productCounts: {
      a: pageDataA.products.length,
      b: pageDataB.products.length,
      delta: pageDataB.products.length - pageDataA.products.length,
    },
    facets: {
      a: { count: facetNamesA.size, names: [...facetNamesA] },
      b: { count: facetNamesB.size, names: [...facetNamesB] },
      sharedCount: [...facetNamesA].filter((n) => facetNamesB.has(n)).length,
      onlyInA: [...facetNamesA].filter((n) => !facetNamesB.has(n)),
      onlyInB: [...facetNamesB].filter((n) => !facetNamesA.has(n)),
    },
    trustSignalCoverage: {
      a: trustCoverage(pageDataA.products),
      b: trustCoverage(pageDataB.products),
    },
    sortOptions: {
      a: { current: pageDataA.sortOptions?.current || null, count: sortLabelsA.length, options: sortLabelsA },
      b: { current: pageDataB.sortOptions?.current || null, count: sortLabelsB.length, options: sortLabelsB },
      onlyInA: sortLabelsA.filter((s) => !sortLabelsB.includes(s)),
      onlyInB: sortLabelsB.filter((s) => !sortLabelsA.includes(s)),
    },
    b2bMode: {
      a: { mode: pageDataA.b2bMode || null, conflictScore: pageDataA.b2bConflictScore ?? null },
      b: { mode: pageDataB.b2bMode || null, conflictScore: pageDataB.b2bConflictScore ?? null },
    },
    performance,
  };
}

// ─── Page fingerprint (zero-AI pre-scan) ──────────────────────────────────────

/**
 * Compute a PageFingerprint from existing scrape data. No AI call.
 * Provides shared structural context for downstream persona analyses.
 *
 * @param {object} pageData - output from scrapePage()
 * @returns {object} PageFingerprint
 */
export function computePageFingerprint(pageData) {
  const url = pageData.url || '';
  const products = pageData.products || [];
  const facets = pageData.facets || [];
  const interactables = pageData.interactables || [];
  const perf = pageData.performance || {};

  // ── pageType ──────────────────────────────────────────────────────────────
  let pageType = 'unknown';
  if (/\/cart|\/basket/i.test(url)) {
    pageType = 'cart';
  } else if (/[?&](q|query|search)=/i.test(url) || /\/search/i.test(url)) {
    pageType = 'search_results';
  } else if (products.length === 1 && facets.length === 0) {
    pageType = 'pdp';
  } else if (products.length > 1 && facets.length > 0) {
    pageType = 'plp';
  } else if (products.length > 1) {
    pageType = 'category';
  } else if (products.length === 0 && /^https?:\/\/[^/]+\/?$/.test(url)) {
    pageType = 'home';
  }

  // ── platform ──────────────────────────────────────────────────────────────
  const platform = pageData.networkIntel?.platforms?.[0] || null;

  // ── commerceMode ──────────────────────────────────────────────────────────
  const commerceMode = {
    mode: pageData.b2bMode || 'B2C',
    conflictScore: pageData.b2bConflictScore ?? 0,
  };

  // ── priceTransparency ─────────────────────────────────────────────────────
  let priceTransparency = 'public';
  if (products.length > 0) {
    const withVisiblePrice = products.filter(
      (p) => p.price && !/your price|login|request/i.test(String(p.price))
    ).length;
    const withQuote = products.filter(
      (p) => /quote|get pricing|request price/i.test(p.cta || '')
    ).length;
    const hasLoginInteractable = interactables.some((i) =>
      /login|sign.?in/i.test(i.text || i.label || i.placeholder || '')
    );
    const ratio = withVisiblePrice / products.length;

    if (withQuote / products.length > 0.5) priceTransparency = 'quote_only';
    else if (ratio < 0.2 && hasLoginInteractable) priceTransparency = 'login_required';
    else if (ratio < 0.8) priceTransparency = 'mixed';
  }

  // ── trustSignalInventory ──────────────────────────────────────────────────
  const ts = {
    ratingsPresent:       products.some((p) => p.trustSignals?.starRating),
    reviewCountPresent:   products.some((p) => p.trustSignals?.reviewCount),
    saleBadgesPresent:    products.some((p) => p.trustSignals?.onSale),
    bestSellerPresent:    products.some((p) => p.trustSignals?.bestSeller),
    stockWarningsPresent: products.some((p) => p.trustSignals?.stockWarning),
    sustainabilityPresent:products.some((p) => p.trustSignals?.sustainabilityLabel),
  };
  ts.totalSignalTypes = Object.values(ts).filter(Boolean).length;

  // ── discoveryQuality ──────────────────────────────────────────────────────
  const hasSearch = interactables.some(
    (i) => i.type === 'search' || /search/i.test(i.placeholder || '')
  );
  const discoveryQuality = {
    facetCount:      facets.length,
    sortOptionCount: pageData.sortOptions?.options?.length || 0,
    hasSearch,
    facetNames:      facets.map((f) => f.name).filter(Boolean),
  };

  // ── funnelReadiness ───────────────────────────────────────────────────────
  const ctaRatio = products.length > 0
    ? products.filter((p) => p.cta?.trim()).length / products.length
    : 0;
  const readinessScore =
    (priceTransparency === 'public'   ? 1 : 0) +
    (ts.totalSignalTypes >= 2         ? 1 : 0) +
    (ctaRatio > 0.5                   ? 1 : 0);
  const funnelReadiness =
    readinessScore === 3 ? 'ready' : readinessScore >= 1 ? 'partial' : 'weak';

  // ── topRisks ──────────────────────────────────────────────────────────────
  const risks = [];
  if (priceTransparency !== 'public') {
    risks.push('Pricing not publicly visible');
  }
  if (!ts.ratingsPresent && !ts.reviewCountPresent) {
    risks.push('Zero social proof — no ratings or reviews on any product');
  }
  if (commerceMode.conflictScore > 50) {
    risks.push(`B2B/B2C signal conflict at ${commerceMode.conflictScore}/100`);
  }
  if ((perf.firstContentfulPaint || 0) > 3000) {
    risks.push(`FCP ${perf.firstContentfulPaint}ms — exceeds 3s threshold`);
  }
  if (facets.length === 0 && products.length > 3) {
    risks.push('No filters detected — discovery fully unguided');
  }
  const descFillRate = products.length > 0
    ? products.filter((p) => (p.description || '').length > 20).length / products.length
    : 1;
  if (descFillRate < 0.3) {
    risks.push(`Description fill rate ${Math.round(descFillRate * 100)}% — below 30% threshold`);
  }

  // ── recommendedPersonas ───────────────────────────────────────────────────
  const recommended = new Set();
  if (commerceMode.mode === 'B2B' || commerceMode.conflictScore > 60) {
    recommended.add('b2b_auditor');
  }
  if (ts.totalSignalTypes < 2 || descFillRate < 0.3 || priceTransparency !== 'public') {
    recommended.add('auditor');
  }
  if (funnelReadiness !== 'ready' || !ts.ratingsPresent) {
    recommended.add('floor_walker');
  }
  if (discoveryQuality.facetCount < 3 || pageType === 'plp') {
    recommended.add('scout');
  }
  const recommendedPersonas = [...recommended].slice(0, 3);
  // Ensure at least 2 personas recommended
  if (recommendedPersonas.length < 2) {
    if (!recommended.has('floor_walker')) recommendedPersonas.push('floor_walker');
    if (!recommended.has('auditor')) recommendedPersonas.push('auditor');
  }

  return {
    pageType,
    platform,
    commerceMode,
    priceTransparency,
    trustSignalInventory: ts,
    discoveryQuality,
    funnelReadiness,
    topRisks: risks.slice(0, 4),
    recommendedPersonas: [...new Set(recommendedPersonas)].slice(0, 3),
  };
}

// ─── Smart persona selector ───────────────────────────────────────────────────

/**
 * Select which personas to run based on a pre-computed PageFingerprint.
 *
 * Rules (applied in order):
 *   1. Start from fingerprint.recommendedPersonas (if non-empty), else full default set.
 *   2. If commerceMode is B2B or contains 'b2b', always include 'b2b_auditor'.
 *   3. If pageType is 'pdp', prefer 'floor_walker' and 'auditor' — drop 'scout' if needed to cap at 3.
 *   4. If pageType is 'category' or 'search_results', always include 'scout'.
 *   5. Cap at 3 personas.
 *
 * @param {object|null} fingerprint - PageFingerprint from computePageFingerprint(), or null
 * @returns {string[]} Array of persona name strings (lowercase_underscore cache keys)
 */
export function selectPersonas(fingerprint) {
  const DEFAULT_PERSONAS = ['floor_walker', 'auditor', 'scout'];

  if (!fingerprint) return DEFAULT_PERSONAS;

  // Start from recommended list, falling back to defaults
  const base =
    Array.isArray(fingerprint.recommendedPersonas) && fingerprint.recommendedPersonas.length > 0
      ? [...fingerprint.recommendedPersonas]
      : [...DEFAULT_PERSONAS];

  const selected = new Set(base);

  // Rule: B2B mode → always include b2b_auditor
  const commerceMode = fingerprint.commerceMode;
  const modeStr = typeof commerceMode === 'string' ? commerceMode : (commerceMode?.mode || '');
  if (modeStr === 'B2B' || modeStr.toLowerCase().includes('b2b')) {
    selected.add('b2b_auditor');
  }

  // Rule: category/search_results → always include scout
  const pageType = fingerprint.pageType || '';
  if (pageType === 'category' || pageType === 'search_results') {
    selected.add('scout');
  }

  // Cap at 3: trim least-relevant entries
  // For pdp, prefer floor_walker and auditor over scout
  let result = [...selected];
  if (result.length > 3) {
    if (pageType === 'pdp') {
      // Deprioritize scout on product detail pages
      result = result.filter((p) => p !== 'scout');
    }
    result = result.slice(0, 3);
  }

  return result;
}

// ─── Price bucket validator ────────────────────────────────────────────────────

/**
 * Validate price facet buckets against actual product prices.
 * Returns null if no price facet is present or no parseable data exists.
 */
export function validatePriceBuckets(pageData) {
  const priceFacet = (pageData.facets || []).find((f) => /price/i.test(f.name) && f.options?.length > 0);
  if (!priceFacet) return null;

  const buckets = priceFacet.options.map((o) => {
    const range = /\$?([\d,]+)\s*[-–]\s*\$?([\d,]+)/i.exec(o.label);
    const under = /under\s*\$?([\d,]+)/i.exec(o.label);
    const over  = /\$?([\d,]+)\s*\+/i.exec(o.label);
    const min = range ? parseFloat(range[1].replace(/,/g, '')) : under ? 0 : over ? parseFloat(over[1].replace(/,/g, '')) : null;
    const max = range ? parseFloat(range[2].replace(/,/g, '')) : under ? parseFloat(under[1].replace(/,/g, '')) : over ? Infinity : null;
    return { label: o.label, min, max, parseable: min !== null && max !== null };
  });

  const parseableProducts = pageData.products
    .map((p) => ({ title: p.title, price: parseFloat(String(p.price || '').replace(/[^0-9.]/g, '')) }))
    .filter((p) => !isNaN(p.price) && p.price > 0);

  const parseableBuckets = buckets.filter((b) => b.parseable);
  if (parseableBuckets.length === 0 || parseableProducts.length === 0) return null;

  const unmatched = parseableProducts.filter(
    (p) => !parseableBuckets.some((b) => p.price >= b.min && p.price <= b.max)
  );
  const empty = parseableBuckets.filter(
    (b) => !parseableProducts.some((p) => p.price >= b.min && p.price <= b.max)
  );

  return {
    facetName: priceFacet.name,
    buckets,
    unmatchedProducts: unmatched.map((p) => ({ title: p.title, price: p.price })),
    emptyBuckets: empty.map((b) => b.label),
    valid: unmatched.length === 0 && empty.length === 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a merchandising audit on pre-scraped page data.
 *
 * Provider is selected automatically from env vars:
 *   MODEL_PROVIDER=anthropic → Claude claude-sonnet-4-6
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
    if (provider === 'anthropic') raw = await callAnthropic(contextText, screenshot);
    else if (provider === 'openai') raw = await callOpenAI(contextText, screenshot);
    else raw = await callGemini(contextText, screenshot);
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
  const model = getModelName('anthropic', 'claude-sonnet-4-6');

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
    system: PAGE_QA_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text || 'No response generated.';
}

async function askGemini(context, question, screenshot) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY });
  const model = getModelName('gemini', 'gemini-2.5-pro');

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
    if (provider === 'anthropic') return await askAnthropic(context, question, screenshot);
    if (provider === 'openai') return await askOpenAI(context, question, screenshot);
    return await askGemini(context, question, screenshot);
  } catch (err) {
    throw new Error(`${provider} Q&A failed: ${err.message}`);
  }
}

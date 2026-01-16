/**
 * Merchandising Analysis API
 * Analyzes product page data for merchandising quality issues
 */
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const ENABLED_MODES = new Set(['Hybrid Experience Audit', 'Knowledge Surface Audit']);

const coerceStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pass' || normalized === 'partial' || normalized === 'fail') {
    return normalized;
  }
  return 'unknown';
};

const normalizeStandardsCheck = (standardsCheck) => {
  if (!Array.isArray(standardsCheck)) {
    return [];
  }

  const normalized = standardsCheck
    .map((item) => {
      return {
        criterion: String(item.criterion || item.label || 'Unnamed criterion').trim(),
        status: coerceStatus(item.status),
        evidence: String(item.evidence || 'No evidence provided.').trim(),
      };
    })
    .filter((item) => item.criterion.length > 0);

  return normalized.slice(0, 3);
};

// function deleted


const buildEvidenceEntries = (pageData) => {
  const b2bCount = pageData.products.reduce((sum, p) => sum + p.b2bIndicators.length, 0);
  const b2cCount = pageData.products.reduce((sum, p) => sum + p.b2cIndicators.length, 0);
  const withDescriptions = pageData.products.filter(
    (product) => product.description && product.description.length > 20
  ).length;

  const structureSummary = [
    pageData.structure?.gridSelector ? `grid: ${pageData.structure.gridSelector}` : 'grid: n/a',
    pageData.structure?.cardSelector ? `card: ${pageData.structure.cardSelector}` : 'card: n/a',
  ].join(', ');

  return [
    {
      timestamp: new Date().toISOString(),
      agent: 'Web Agent',
      action: `Sampled ${pageData.products.length} product cards from ${pageData.url}. ${structureSummary}.`,
    },
    {
      timestamp: new Date().toISOString(),
      agent: 'Data Agent',
      action: `Signals detected: ${b2bCount} B2B indicators, ${b2cCount} B2C indicators. Descriptions present in ${withDescriptions}/${pageData.products.length} cards.`,
    },
  ];
};

const parseTrustTrace = (rawTrustTrace, pageData) => {
  const entries = buildEvidenceEntries(pageData);
  const lines = String(rawTrustTrace || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  lines.slice(0, 3).forEach((line) => {
    entries.push({
      timestamp: new Date().toISOString(),
      agent: 'Merch Agent',
      action: line,
    });
  });

  return entries;
};

const parseRecommendations = (rawRecommendations) => {
  const recommendations = Array.isArray(rawRecommendations) ? rawRecommendations : [];
  return recommendations.slice(0, 3).map((rec, index) => ({
    title: `Recommendation ${index + 1}`,
    description: String(rec || '').trim(),
    impact: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
    agent: 'Merch Agent',
  }));
};

// extractMission function removed - mission content is now in SYSTEM_PROMPT_V2.md

const buildContextBlock = (pageData) => `
## Context (Scraped Page Data)
URL: ${pageData.url}
Title: ${pageData.title}
Meta: ${pageData.metaDescription || 'N/A'}
Product Sample Count: ${pageData.products.length}
Description Coverage: ${pageData.products.filter((p) => p.description).length}/${pageData.products.length}

## Structural Scout Report
Grid Selector: ${pageData.structure?.gridSelector || 'N/A'}
Card Selector: ${pageData.structure?.cardSelector || 'N/A'}
Confidence Score: ${pageData.structure?.confidence || 'N/A'}

Raw Product Data samples:
${JSON.stringify(pageData.products.slice(0, 3), null, 2)}

Heuristic Signals:
- B2B Indicators Found: ${pageData.products.some((p) => p.b2bIndicators.length > 0)}
- B2C Indicators Found: ${pageData.products.some((p) => p.b2cIndicators.length > 0)}
`;

const buildSystemInstruction = () => {
  const systemPrompt = fs.readFileSync(
    path.join(process.cwd(), 'server', 'prompts', 'SYSTEM_PROMPT_V2.md'),
    'utf8'
  );
  return systemPrompt;
};

const normalizeAnalysis = (rawAnalysis, mode) => {
  const siteMode =
    rawAnalysis.siteMode === 'B2B' || rawAnalysis.siteMode === 'B2C' || rawAnalysis.siteMode === 'Hybrid'
      ? rawAnalysis.siteMode
      : 'Hybrid';

  const diagnosisTitle = String(rawAnalysis.diagnosisTitle || 'Insufficient Evidence').trim();
  const diagnosisDescription = String(
    rawAnalysis.diagnosisDescription ||
      'The sample did not provide enough consistent signals to produce a confident diagnosis.'
  ).trim();
  const hybridTrapCheck = String(
    rawAnalysis.hybridTrapCheck || (mode === 'Knowledge Surface Audit' ? 'Not applicable.' : 'Not enough evidence to confirm.')
  ).trim();
  const trustTrace = String(rawAnalysis.trustTrace || '').trim();

  // Normalize structured recommendations
  const recommendations = Array.isArray(rawAnalysis.recommendations)
    ? rawAnalysis.recommendations.map(rec => ({
        title: String(rec.title || 'Recommendation').trim(),
        description: String(rec.description || '').trim(),
        impact: ['high', 'medium', 'low'].includes(rec.impact) ? rec.impact : 'medium',
        agent: 'Merch Agent'
    })).filter(rec => rec.description.length > 0)
    : [];

  return {
    siteMode,
    diagnosisTitle,
    diagnosisDescription,
    hybridTrapCheck,
    trustTrace,
    standardsCheck: normalizeStandardsCheck(rawAnalysis.standardsCheck),
    recommendations,
  };
};

const allowedSiteModes = new Set(['B2B', 'B2C', 'Hybrid']);

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

const isValidStandardsCheck = (items) =>
  Array.isArray(items) &&
  items.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      isNonEmptyString(item.criterion) &&
      isNonEmptyString(item.status) &&
      isNonEmptyString(item.evidence)
  );

const isValidRecommendations = (items) =>
  Array.isArray(items) &&
  items.every((item) => item && typeof item === 'object' && isNonEmptyString(item.title) && isNonEmptyString(item.description));

const validateAnalysisPayload = (analysis) => {
  if (!analysis || typeof analysis !== 'object') {
    return { isValid: false, reason: 'Response was not a JSON object.' };
  }
  if (!isNonEmptyString(analysis.trustTrace)) {
    return { isValid: false, reason: 'Missing trustTrace.' };
  }
  if (!allowedSiteModes.has(analysis.siteMode)) {
    return { isValid: false, reason: 'Invalid siteMode.' };
  }
  if (!isNonEmptyString(analysis.diagnosisTitle)) {
    return { isValid: false, reason: 'Missing diagnosisTitle.' };
  }
  if (!isNonEmptyString(analysis.diagnosisDescription)) {
    return { isValid: false, reason: 'Missing diagnosisDescription.' };
  }
  if (!isNonEmptyString(analysis.hybridTrapCheck)) {
    return { isValid: false, reason: 'Missing hybridTrapCheck.' };
  }

  // Allow empty arrays for standardsCheck and recommendations
  if (!Array.isArray(analysis.standardsCheck)) {
    return { isValid: false, reason: 'standardsCheck must be an array.' };
  }
  if (!Array.isArray(analysis.recommendations)) {
    return { isValid: false, reason: 'recommendations must be an array.' };
  }

  if (!analysis.auditMatrix || typeof analysis.auditMatrix !== 'object') {
    return { isValid: false, reason: 'Missing auditMatrix.' };
  }

  return { isValid: true, reason: '' };
};

const isValidPageData = (pageData) =>
  pageData &&
  typeof pageData.url === 'string' &&
  Array.isArray(pageData.products) &&
  typeof pageData.title === 'string';

const isValidHttpUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// ... imports ...

// Helper to convert file to GenerativePart
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: fs.readFileSync(path).toString("base64"),
      mimeType
    },
  };
}

export function registerMerchAgentRoutes(app) {
  app.post('/api/analyze', async (req, res) => {
    const { pageData, mode } = req.body || {};

    if (!mode || !ENABLED_MODES.has(mode)) {
      return res.status(400).json({ error: 'Audit mode is not enabled or missing.' });
    }

    if (!isValidPageData(pageData) || !isValidHttpUrl(pageData.url)) {
      return res.status(400).json({ error: 'Valid page data with an http/https URL is required.' });
    }

    // Escape Hatch (Pre-check)
    if (!pageData.products || pageData.products.length === 0) {
        // ... (existing escape hatch) ...
         console.log('[Merch Agent] Escape Hatch Triggered: 0 products found.');
         // ...
         return res.json({
             trustTrace: 'SCRAPE FAILED (Pre-Check): The Web Agent found 0 products.',
             diagnosis: {
                 title: 'Technical Audit Failure (Scrape Blocked)',
                 description: 'The system was unable to extract structured product data. Zero products were detected.',
             },
             recommendations: [],
             mode,
             siteMode: 'Unknown',
             hybridTrapCheck: 'Not applicable',
             standardsCheck: [],
             auditMatrix: {
                trust: { status: 'fail', finding: 'Scrape failed to retrieve data.' },
                guidance: { status: 'unknown', finding: 'No visual data available.' },
                persuasion: { status: 'unknown', finding: 'No content analyzed.' },
                friction: { status: 'unknown', finding: 'No interaction possible.' }
             }
         });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not defined on the server.' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = buildSystemInstruction();

// Conditional Task Block
      let integrityTask = '';
      if (mode === 'knowledge') {
        integrityTask = `
## Merchandising Integrity Task (Ticket 11 & 10)
Analyze the "Raw Product Data samples" JSON and the Screenshot.

1. **Attribute Normalization Check**:
   - Scan Product Titles. Are they consistent? (e.g. "Brand Model Spec").
   - **CITE OFFENDERS**: Name any products that break the naming convention.

2. **Visual Hierarchy & Persuasion Check (Screenshot)**:
   - Does the grid guide the eye? (Clear Hero vs Standard).
   - Are there "Persuasion Signals" visible? (Badges, Ratings, Discount Flags).
   - **CITE MISSING**: If no badges/ratings are visible, explicitly state: "No social proof or merchandising badges detected."

3. **Data Quality Verification**:
   - Check key attributes (Price, Image).
   - instead of just "Fill Rate %", say: "Missing Price on [Product A, Product B]".
`;
      }

      // Multimodal Prompt Construction
      const userPromptText = `
${buildContextBlock(pageData)}

${integrityTask}

## Output Requirement: The "Audit Matrix"
Instead of a score, provide a "Kill Sheet" matrix assessing 4 areas:
1. TRUST (Data/Consistency): Are titles normalized? Is data professional? **Cite specific messy examples.**
2. GUIDANCE (Visuals): Is the grid scannable? (Visual hierarchy).
3. PERSUASION (Signals): Are there Badges, Ratings, or "Why Buy" cues?
4. FRICTION (Transaction): Are there blockers? (Hidden prices, no guest checkout).
`;

      const promptParts = [
          { text: userPromptText }
      ];

      // Attach Image if available
      if (pageData.screenshotPath && fs.existsSync(pageData.screenshotPath)) {
          console.log(`[Merch Agent] Attaching screenshot for analysis: ${pageData.screenshotPath}`);
          const mimeType = pageData.screenshotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
          promptParts.push(fileToGenerativePart(pageData.screenshotPath, mimeType));
      } else {
          console.warn('[Merch Agent] No screenshot found for visual analysis.');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptParts,
        config: {
          temperature: 0.2,
          responseOptions: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                trustTrace: { type: Type.STRING },
                siteMode: { type: Type.STRING, enum: ['B2B', 'B2C', 'Hybrid'] },
                diagnosisTitle: { type: Type.STRING },
                diagnosisDescription: { type: Type.STRING },
                hybridTrapCheck: { type: Type.STRING },
                auditMatrix: {
                  type: Type.OBJECT,
                  properties: {
                    trust: { type: Type.OBJECT, properties: { status: { type: Type.STRING, enum: ['pass', 'fail', 'check'] }, finding: { type: Type.STRING } }, required: ['status', 'finding'] },
                    guidance: { type: Type.OBJECT, properties: { status: { type: Type.STRING, enum: ['pass', 'fail', 'check'] }, finding: { type: Type.STRING } }, required: ['status', 'finding'] },
                    persuasion: { type: Type.OBJECT, properties: { status: { type: Type.STRING, enum: ['pass', 'fail', 'check'] }, finding: { type: Type.STRING } }, required: ['status', 'finding'] },
                    friction: { type: Type.OBJECT, properties: { status: { type: Type.STRING, enum: ['pass', 'fail', 'check'] }, finding: { type: Type.STRING } }, required: ['status', 'finding'] }
                  },
                  required: ['trust', 'guidance', 'persuasion', 'friction']
                },
                standardsCheck: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      criterion: { type: Type.STRING },
                      status: { type: Type.STRING },
                      evidence: { type: Type.STRING },
                    },
                    required: ['criterion', 'status', 'evidence'],
                  },
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      impact: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
                    },
                    required: ['title', 'description', 'impact']
                  },
                },
              },
              required: [
                'trustTrace',
                'siteMode',
                'diagnosisTitle',
                'diagnosisDescription',
                'hybridTrapCheck',
                'auditMatrix',
                'standardsCheck',
                'recommendations',
              ],
            },
          },
          systemInstruction,
        },
      });

      // Extract JSON from response (strip markdown code blocks if present)
      let responseText = response.text || '{}';
      // Remove markdown code block formatting if present
      responseText = responseText.replace(/^```json\s*\n?/i, '').replace(/\n?```$/,  '').trim();

      let rawAnalysis = {};
      try {
        rawAnalysis = JSON.parse(responseText);

        // DEBUG: Log the full raw response to see everything the model returns
        console.log('\n[Merch Agent] ========== RAW MODEL RESPONSE ==========');
        console.log(JSON.stringify(rawAnalysis, null, 2));
        console.log('[Merch Agent] =============================================\n');

      } catch (error) {
        console.error('[Merch Agent] Invalid JSON from model:', error.message);
        console.error('[Merch Agent] Raw response text (first 500 chars):', responseText.substring(0, 500));
        return res.status(502).json({ error: 'Analysis failed: invalid model JSON.' });
      }

      const validation = validateAnalysisPayload(rawAnalysis);
      if (!validation.isValid) {
        console.error('[Merch Agent] Invalid model response:', validation.reason);
        return res.status(502).json({ error: `Analysis failed: ${validation.reason}` });
      }

      const normalized = normalizeAnalysis(rawAnalysis, mode);
      const trustTrace = parseTrustTrace(normalized.trustTrace, pageData);
      // Pass through structured recommendations directly, no more slicing or manufacturing titles
      const recommendations = normalized.recommendations;

      res.json({
        trustTrace,
        auditMatrix: rawAnalysis.auditMatrix, // Direct pass-through of validated matrix
        diagnosis: {
          title: normalized.diagnosisTitle,
          description: normalized.diagnosisDescription,
        },
        recommendations,
        mode,
        siteMode: normalized.siteMode,
        hybridTrapCheck: normalized.hybridTrapCheck,
        standardsCheck: normalized.standardsCheck,
      });

    } catch (error) {
      console.error('[Merch Agent] Analysis Failed:', error.message);
      res.status(500).json({
        error: `Analysis failed: ${error.message}`,
      });
    }
  });
}

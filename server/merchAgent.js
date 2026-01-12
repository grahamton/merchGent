/**
 * MERCH AGENT (Diagnostic Strategist)
 * Role: Analysis, diagnosis, and recommendations.
 * Forbidden: Crawling, transactional actions.
 */
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const AGENT_RULES_MD = fs.readFileSync(
  path.join(process.cwd(), 'server', 'prompts', 'SYSTEM_PROMPT.md'),
  'utf8'
);
const KNOWLEDGE_BASE_MD = fs.readFileSync(
  path.join(process.cwd(), 'docs', 'VISION.md'),
  'utf8'
);
const AGENT_RULESET_YAML = fs.readFileSync(
  path.join(process.cwd(), 'server', 'prompts', 'agent_ruleset.yaml'),
  'utf8'
);
const MERCH_AGENT_PERSONA_MD = fs.readFileSync(
  path.join(process.cwd(), 'docs', 'MERCH_AGENT_PERSONA.md'),
  'utf8'
);

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

const calculateMerchGentScore = (pageData) => {
  const b2bCount = pageData.products.reduce((sum, p) => sum + p.b2bIndicators.length, 0);
  const b2cCount = pageData.products.reduce((sum, p) => sum + p.b2cIndicators.length, 0);
  const totalSignals = b2bCount + b2cCount;

  let intentClarity = 0;
  if (totalSignals > 0) {
    const dominantSignalRatio = Math.max(b2bCount, b2cCount) / totalSignals;
    intentClarity = Math.round(dominantSignalRatio * 33);
  }

  const productsWithDescriptions = pageData.products.filter(
    (product) => product.description && product.description.length > 20
  ).length;
  const knowledgeAccessibility = Math.round(
    (productsWithDescriptions / Math.max(pageData.products.length, 1)) * 33
  );

  const productsWithCTAs = pageData.products.filter(
    (product) => product.ctaText && product.ctaText.length > 0
  ).length;
  const transactionReadiness = Math.round(
    (productsWithCTAs / Math.max(pageData.products.length, 1)) * 34
  );

  const total = intentClarity + knowledgeAccessibility + transactionReadiness;

  let status;
  if (total >= 71) status = 'optimized';
  else if (total >= 41) status = 'improving';
  else status = 'needs-attention';

  return {
    total,
    intentClarity,
    knowledgeAccessibility,
    transactionReadiness,
    status,
  };
};

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

const extractMission = (mode) => {
  const missionHeader = `## Mission: ${mode}`;
  if (!AGENT_RULES_MD.includes(missionHeader)) {
    throw new Error(`Mission not found in AGENT_RULES.md for mode: "${mode}"`);
  }
  const missionSplit = AGENT_RULES_MD.split(missionHeader);
  const mission = missionSplit[1] ? missionSplit[1].split('## ')[0] : '';

  if (!mission.trim()) {
    throw new Error(`Mission content is empty for mode: "${mode}"`);
  }

  return mission;
};

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

const buildSystemInstruction = () => `
${MERCH_AGENT_PERSONA_MD}

${AGENT_RULES_MD}
${KNOWLEDGE_BASE_MD}

## Runtime Enforcement Rules (YAML)
${AGENT_RULESET_YAML}

## Output Requirements
Return JSON only. Include:
- trustTrace (string, cite observed signals from page data)
- siteMode ("B2B" | "B2C" | "Hybrid")
- diagnosisTitle (string)
- diagnosisDescription (string)
- hybridTrapCheck (string; "Not applicable" for Knowledge Surface)
- standardsCheck (array of {criterion, status: "pass"|"partial"|"fail"|"unknown", evidence})
- recommendations (array of up to 3 strings)
`;

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
  const recommendations = Array.isArray(rawAnalysis.recommendations)
    ? rawAnalysis.recommendations.filter((rec) => String(rec).trim().length > 0)
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
  items.length <= 3 &&
  items.every((item) => isNonEmptyString(item));

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
  if (!isValidStandardsCheck(analysis.standardsCheck)) {
    return { isValid: false, reason: 'Invalid standardsCheck.' };
  }
  if (!isValidRecommendations(analysis.recommendations)) {
    return { isValid: false, reason: 'Invalid recommendations.' };
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

export function registerMerchAgentRoutes(app) {
  app.post('/api/analyze', async (req, res) => {
    const { pageData, mode } = req.body || {};

    if (!mode || !ENABLED_MODES.has(mode)) {
      return res.status(400).json({ error: 'Audit mode is not enabled or missing.' });
    }

    if (!isValidPageData(pageData) || !isValidHttpUrl(pageData.url)) {
      return res.status(400).json({ error: 'Valid page data with an http/https URL is required.' });
    }

    // --- ESCAPE HATCH (Optimization) ---
    // If we have 0 products, the prompt will likely hallucinate.
    // We fail fast here to save tokens and prevent bad data.
    if (!pageData.products || pageData.products.length === 0) {
      console.log('[Merch Agent] Escape Hatch Triggered: 0 products found.');
      return res.json({
        trustTrace: 'SCRAPE FAILED (Pre-Check): The Web Agent found 0 products. Diagnosis aborted to prevent hallucination.',
        merchGentScore: { total: 0, status: 'needs-attention' },
        diagnosis: {
            title: 'Technical Audit Failure (Scrape Blocked)',
            description: 'The system was unable to extract structured product data. Zero products were detected.',
        },
        recommendations: [],
        mode,
        siteMode: 'Unknown',
        hybridTrapCheck: 'Not applicable',
        standardsCheck: []
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not defined on the server.' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const mission = extractMission(mode);

      const systemInstruction = buildSystemInstruction();
      const userPrompt = `
${buildContextBlock(pageData)}

## Mission: ${mode}
${mission}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              trustTrace: { type: Type.STRING },
              siteMode: { type: Type.STRING, enum: ['B2B', 'B2C', 'Hybrid'] },
              diagnosisTitle: { type: Type.STRING },
              diagnosisDescription: { type: Type.STRING },
              hybridTrapCheck: { type: Type.STRING },
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
                items: { type: Type.STRING },
              },
            },
            required: [
              'trustTrace',
              'siteMode',
              'diagnosisTitle',
              'diagnosisDescription',
              'hybridTrapCheck',
              'standardsCheck',
              'recommendations',
            ],
          },
        },
      });

      let rawAnalysis = {};
      try {
        rawAnalysis = JSON.parse(response.text || '{}');
      } catch (error) {
        console.error('[Merch Agent] Invalid JSON from model:', error.message);
        return res.status(502).json({ error: 'Analysis failed: invalid model JSON.' });
      }

      const validation = validateAnalysisPayload(rawAnalysis);
      if (!validation.isValid) {
        console.error('[Merch Agent] Invalid model response:', validation.reason);
        return res.status(502).json({ error: `Analysis failed: ${validation.reason}` });
      }

      const normalized = normalizeAnalysis(rawAnalysis, mode);
      const trustTrace = parseTrustTrace(normalized.trustTrace, pageData);
      const recommendations = parseRecommendations(normalized.recommendations);
      const merchGentScore = calculateMerchGentScore(pageData);

      res.json({
        trustTrace,
        merchGentScore,
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

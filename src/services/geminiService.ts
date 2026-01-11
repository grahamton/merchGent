/// <reference types="vite/client" />
import { GoogleGenAI, Type } from "@google/genai";
// @ts-ignore
import AGENT_RULES_MD from '../../docs/AGENT_RULES.md?raw';
// @ts-ignore
import KNOWLEDGE_BASE_MD from '../../docs/KNOWLEDGE_BASE.md?raw';
// @ts-ignore
import AGENT_RULESET_YAML from '../../docs/agent_ruleset.yaml?raw';
import { PageData, AnalysisResult, AuditMode, isModeEnabled, TrustTraceEntry, MerchGentScore, Recommendation } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
  }

  private calculateMerchGentScore(rawAnalysis: any, pageData: PageData): MerchGentScore {
    // Intent Clarity (0-33): Based on signal consistency
    const b2bCount = pageData.products.reduce((sum, p) => sum + p.b2bIndicators.length, 0);
    const b2cCount = pageData.products.reduce((sum, p) => sum + p.b2cIndicators.length, 0);
    const totalSignals = b2bCount + b2cCount;

    let intentClarity = 0;
    if (totalSignals > 0) {
      const dominantSignalRatio = Math.max(b2bCount, b2cCount) / totalSignals;
      intentClarity = Math.round(dominantSignalRatio * 33);
    }

    // Knowledge Accessibility (0-33): Based on description quality and completeness
    const productsWithDescriptions = pageData.products.filter(p => p.description && p.description.length > 20).length;
    const knowledgeAccessibility = Math.round((productsWithDescriptions / Math.max(pageData.products.length, 1)) * 33);

    // Transaction Readiness (0-34): Based on CTA presence and clarity
    const productsWithCTAs = pageData.products.filter(p => p.ctaText && p.ctaText.length > 0).length;
    const transactionReadiness = Math.round((productsWithCTAs / Math.max(pageData.products.length, 1)) * 34);

    const total = intentClarity + knowledgeAccessibility + transactionReadiness;

    let status: MerchGentScore['status'];
    if (total >= 71) status = 'optimized';
    else if (total >= 41) status = 'improving';
    else status = 'needs-attention';

    return {
      total,
      intentClarity,
      knowledgeAccessibility,
      transactionReadiness,
      status
    };
  }

  private parseTrustTrace(rawTrustTrace: string): TrustTraceEntry[] {
    // Parse the raw trust trace string into structured entries
    const entries: TrustTraceEntry[] = [];
    const lines = rawTrustTrace.split('\n').filter(line => line.trim());

    // Add initial Web Agent entry
    entries.push({
      timestamp: new Date().toISOString(),
      agent: 'Web Agent',
      action: `Crawled ${lines.length > 0 ? 'target site' : 'page'} and extracted commerce signals`
    });

    // Add Merch Agent analysis entry
    entries.push({
      timestamp: new Date().toISOString(),
      agent: 'Merch Agent',
      action: 'Analyzed signal patterns and generated recommendations'
    });

    // Add Data Agent validation entry
    entries.push({
      timestamp: new Date().toISOString(),
      agent: 'Data Agent',
      action: 'Validated site standards and calculated merchGent Score'
    });

    // Parse AI reasoning if available
    if (rawTrustTrace.trim()) {
      const reasoningLines = lines.slice(0, 3); // Highlight top 3 reasoning points
      reasoningLines.forEach(line => {
        entries.push({
          timestamp: new Date().toISOString(),
          agent: 'Merch Agent',
          action: line.trim()
        });
      });
    }

    return entries;
  }

  private parseRecommendations(rawRecommendations: string[]): Recommendation[] {
    return rawRecommendations.slice(0, 3).map((rec, index) => ({
      title: `Recommendation ${index + 1}`,
      description: rec,
      impact: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
      agent: 'Merch Agent'
    }));
  }

  async analyzeMerchandising(pageData: PageData, mode: AuditMode = AuditMode.HYBRID): Promise<AnalysisResult> {
    // Validate that the mode is enabled
    if (!isModeEnabled(mode)) {
      throw new Error(`Audit mode "${mode}" is not yet implemented. Only enabled modes can be executed.`);
    }

    // Validate that AGENT_RULES.md contains the mission for this mode
    const missionHeader = `## Mission: ${mode}`;
    if (!AGENT_RULES_MD.includes(missionHeader)) {
      throw new Error(`Mission not found in AGENT_RULES.md for mode: "${mode}". Please ensure AGENT_RULES.md is properly configured.`);
    }

    // Split AGENT_RULES.md to extract sections
    const sections = AGENT_RULES_MD.split('---');
    const globalGovernance = sections[0] || '';
    const agentPersona = sections[1] || '';

    // Extract the specific mission based on the mode
    const missionSplit = AGENT_RULES_MD.split(missionHeader);
    const specificMission = missionSplit[1] ? missionSplit[1].split('## ')[0] : '';

    if (!specificMission.trim()) {
      throw new Error(`Mission content is empty for mode: "${mode}"`);
    }

    // Construct the Context Block
    const contextBlock = `
      ## Context (Scraped Page Data)
      URL: ${pageData.url}
      Title: ${pageData.title}
      Meta: ${pageData.metaDescription || "N/A"}
      Product Sample Count: ${pageData.products.length}

      Raw Product Data samples:
      ${JSON.stringify(pageData.products.slice(0, 3), null, 2)}

      Heuristic Signals:
      - B2B Indicators Found: ${pageData.products.some(p => p.b2bIndicators.length > 0)}
      - B2C Indicators Found: ${pageData.products.some(p => p.b2cIndicators.length > 0)}
    `;

    const systemInstruction = `
      ${globalGovernance}
      ${KNOWLEDGE_BASE_MD}
      ${agentPersona}

      ## Runtime Enforcement Rules (YAML)
      ${AGENT_RULESET_YAML}

      ## NEW: Focus on merchGent Score
      Instead of focusing solely on hybrid trap detection, provide:
      1. Clear diagnosis of the site's merchandising effectiveness
      2. Specific, actionable recommendations (max 3)
      3. Reasoning for your analysis
    `;

    const userPrompt = `
      ${contextBlock}

      ## Mission: ${mode}
      ${specificMission}
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trustTrace: { type: Type.STRING },
            mode: { type: Type.STRING, enum: ['B2B', 'B2C', 'Hybrid'] },
            diagnosisTitle: { type: Type.STRING },
            diagnosisDescription: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['trustTrace', 'mode', 'diagnosisTitle', 'diagnosisDescription', 'recommendations']
        }
      }
    });

    const text = response.text || "{}";
    const rawAnalysis = JSON.parse(text);

    // Calculate merchGent Score
    const merchGentScore = this.calculateMerchGentScore(rawAnalysis, pageData);

    // Parse Trust Trace
    const trustTrace = this.parseTrustTrace(rawAnalysis.trustTrace);

    // Parse Recommendations
    const recommendations = this.parseRecommendations(rawAnalysis.recommendations);

    return {
      trustTrace,
      merchGentScore,
      diagnosis: {
        title: rawAnalysis.diagnosisTitle,
        description: rawAnalysis.diagnosisDescription
      },
      recommendations,
      mode: mode
    };
  }
}

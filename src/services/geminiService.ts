/// <reference types="vite/client" />
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
// @ts-ignore
import AGENT_RULES_MD from '../../docs/AGENT_RULES.md?raw';
// @ts-ignore
import KNOWLEDGE_BASE_MD from '../../docs/KNOWLEDGE_BASE.md?raw';
import { PageData, AnalysisResult, AuditMode, isModeEnabled } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
  }

  async analyzeMerchandising(pageData: PageData, mode: AuditMode = AuditMode.HYBRID): Promise<AnalysisResult> {

    // Validate that the mode is enabled (Phase 1 guard)
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
            hybridTrapCheck: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            fullReport: { type: Type.STRING }
          },
          required: ['trustTrace', 'mode', 'hybridTrapCheck', 'recommendations', 'fullReport']
        }
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text) as AnalysisResult;
  }
}

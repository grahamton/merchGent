
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { PROMPTS, KNOWLEDGE_BASE } from "../constants";
import { PageData, AnalysisResult } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async analyzeMerchandising(pageData: PageData): Promise<AnalysisResult> {
    const systemInstruction = `
      ${PROMPTS.GLOBAL_GOVERNANCE}
      ${PROMPTS.AGENT_M_PERSONA}
      ${KNOWLEDGE_BASE}
    `;

    const userPrompt = `
      ${PROMPTS.MISSION}
      
      ## Context (Scraped Page Data)
      URL: ${pageData.url}
      Title: ${pageData.title}
      Meta: ${pageData.metaDescription}
      Product Sample Count: ${pageData.products.length}
      
      Raw Product Data:
      ${JSON.stringify(pageData.products, null, 2)}
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-pro-preview",
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

export interface Product {
  title: string;
  price: string | null;
  imageAlt: string | null;
  imageSrc: string | null;
  ctaText: string;
  description: string | null;
  b2bIndicators: string[];
  b2cIndicators: string[];
}

export interface PageData {
  url: string;
  title: string;
  products: Product[];
  metaDescription: string | null;
  screenshotPath: string;
  viewportWidth: number;
  structure?: {
    gridSelector: string | null;
    cardSelector: string | null;
    confidence: number;
  };
}

export interface TrustTraceEntry {
  timestamp: string;
  agent: string;
  action: string;
}

export interface MerchGentScore {
  total: number; // 0-100
  intentClarity: number; // 0-33
  knowledgeAccessibility: number; // 0-33
  transactionReadiness: number; // 0-34
  status: "needs-attention" | "improving" | "optimized";
}

export interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  agent: string;
}

export interface StandardsCheckItem {
  criterion: string;
  status: "pass" | "partial" | "fail" | "unknown";
  evidence: string;
}

export interface AnalysisResult {
  trustTrace: TrustTraceEntry[];
  merchGentScore: MerchGentScore;
  diagnosis: {
    title: string;
    description: string;
  };
  recommendations: Recommendation[];
  mode: string;
  siteMode: "B2B" | "B2C" | "Hybrid";
  hybridTrapCheck: string;
  standardsCheck: StandardsCheckItem[];
}

export enum AgentStatus {
  IDLE = "idle",
  SCRAPING = "scraping",
  ANALYZING = "analyzing",
  COMPLETED = "completed",
  ERROR = "error",
}

export enum AuditMode {
  HYBRID = "Hybrid Experience Audit",
  KNOWLEDGE = "Knowledge Surface Audit",
  LOGGED_IN = "Logged-In vs Logged-Out Audit",
  COHERENCE = "Merchandising Coherence Audit",
  READINESS = "Agent Readiness Scan",
}

// Phase 1: Only Hybrid Experience Audit is enabled
// Phase 2: Added Knowledge Surface Audit
export const ENABLED_MODES: AuditMode[] = [
  AuditMode.HYBRID,
  AuditMode.KNOWLEDGE,
];

// Helper to check if a mode is enabled
export function isModeEnabled(mode: AuditMode): boolean {
  return ENABLED_MODES.includes(mode);
}

export type Theme = "light" | "dark";

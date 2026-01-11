
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
}

export interface AnalysisResult {
  trustTrace: string;
  mode: 'B2B' | 'B2C' | 'Hybrid';
  hybridTrapCheck: string;
  recommendations: string[];
  fullReport: string;
}

export enum AgentStatus {
  IDLE = 'idle',
  SCRAPING = 'scraping',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export enum AuditMode {
  HYBRID = 'Hybrid Experience Audit',
  KNOWLEDGE = 'Knowledge Surface Audit',
  LOGGED_IN = 'Logged-In vs Logged-Out Audit',
  COHERENCE = 'Merchandising Coherence Audit',
  READINESS = 'Agent Readiness Scan'
}

// Phase 1: Only Hybrid Experience Audit is enabled
// Phase 2: Added Knowledge Surface Audit
export const ENABLED_MODES: AuditMode[] = [
  AuditMode.HYBRID,
  AuditMode.KNOWLEDGE
];

// Helper to check if a mode is enabled
export function isModeEnabled(mode: AuditMode): boolean {
  return ENABLED_MODES.includes(mode);
}


export interface Product {
  title: string;
  price: string | null;
  imageAlt: string | null;
  imageSrc: string | null;
  ctaText: string;
  description: string | null;
  b2bIndicators: string[];
  b2cIndicators: string[];
  stockStatus: string;
}

export interface PageData {
  url: string;
  title: string;
  products: Product[];
  metaDescription: string | null;
  screenshotPath: string;
  viewportWidth: number;
  cookies?: any[]; // Puppeteer cookie array
  structure?: {
    gridSelector: string | null;
    cardSelector: string | null;
    confidence: number;
  };
  dataLayers?: Record<string, any>;
  interactables?: Array<{
    type: string;
    text: string;
    selector: string;
    href?: string;
  }>;
  findings?: Finding[];
}

export interface Finding {
  id: string;
  severity: "critical" | "warning" | "info" | "success";
  category: "usability" | "performance" | "merch" | "technical";
  title: string;
  description: string;
  evidence?: string;
  timestamp: string;
}

export interface TrustTraceEntry {
  timestamp: string;
  agent: string;
  action: string;
}

// Replaces numeric score with "Kill Sheet" Matrix
export interface AuditMatrix {
  trust: { status: "pass" | "fail" | "check"; finding: string };     // Data & Titles
  guidance: { status: "pass" | "fail" | "check"; finding: string };  // Nav & Search
  persuasion: { status: "pass" | "fail" | "check"; finding: string }; // PDP & Content
  friction: { status: "pass" | "fail" | "check"; finding: string };   // Cart & Checkout
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
  auditMatrix: AuditMatrix;
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
  LOADING = "loading",
  ANALYZING = "analyzing",
  COMPLETED = "completed",
  ERROR = "error",
}

export enum AuditMode {
  KNOWLEDGE = 'Knowledge Surface Audit',
  HYBRID = 'Hybrid Experience Audit'
}

import { ENABLED_MODES } from '../config/constants';

// Helper to check if a mode is enabled
export function isModeEnabled(mode: string): boolean {
  return ENABLED_MODES.has(mode as any);
}

export interface JourneyStep {
  id: string;
  sequence: number;
  timestamp: string;
  url: string;
  screenshotPath: string;
  dataSummary: {
    productCount: number;
    title: string;
    dataLayers?: Record<string, any>;
    interactables?: Array<{
      type: string;
      text: string;
      selector: string;
      href?: string;
    }>;
    findings?: Finding[];
  };
}

export interface Journey {
  id: string;
  createdAt: string;
  startUrl: string;
  steps: JourneyStep[];
  status: "active" | "completed";
}

export type Theme = "light" | "dark";

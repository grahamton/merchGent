
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
  IDLE = 'IDLE',
  SCRAPING = 'SCRAPING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

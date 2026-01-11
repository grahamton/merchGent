
import React, { useState, useCallback } from 'react';
import { AgentStatus, PageData, AnalysisResult, Product } from './types';
import { GeminiService } from './services/geminiService';
import AnalysisDisplay from './components/AnalysisDisplay';

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simulated Crawler (Since Playwright doesn't run in browser-only demos)
  const simulateScrape = async (targetUrl: string): Promise<PageData> => {
    // Mimics heuristic signal detection & extraction
    await new Promise(r => setTimeout(r, 2000));
    
    const hostname = new URL(targetUrl).hostname;
    const isLikelyB2B = hostname.includes('industrial') || hostname.includes('supply') || hostname.includes('parts');
    
    const mockProducts: Product[] = [
      {
        title: "Industrial Grade Actuator X-100",
        price: isLikelyB2B ? null : "$1,299.00",
        imageAlt: "Actuator",
        imageSrc: "https://picsum.photos/200/200?random=1",
        ctaText: isLikelyB2B ? "Request Quote" : "Add to Cart",
        description: "Heavy duty precision actuator for automated lines.",
        b2bIndicators: isLikelyB2B ? ["Request Quote", "Login for pricing"] : [],
        b2cIndicators: isLikelyB2B ? [] : ["Add to Cart"]
      },
      {
        title: "Standard Mounting Bracket",
        price: "$45.00",
        imageAlt: "Bracket",
        imageSrc: "https://picsum.photos/200/200?random=2",
        ctaText: "Add to Cart",
        description: "Compatible with all X-series components.",
        b2bIndicators: [],
        b2cIndicators: ["Add to Cart"]
      },
       {
        title: "Bulk Precision Screws (5000ct)",
        price: null,
        imageAlt: "Screws",
        imageSrc: "https://picsum.photos/200/200?random=3",
        ctaText: "Inquire Now",
        description: "Bulk pack for manufacturing facilities.",
        b2bIndicators: ["Inquire Now", "Contract Pricing"],
        b2cIndicators: []
      }
    ];

    return {
      url: targetUrl,
      title: `${hostname} | Merchandising Interface`,
      products: mockProducts,
      metaDescription: "Professional supply chain and inventory management portal.",
      viewportWidth: 1280
    };
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setError(null);
    setResult(null);
    setStatus(AgentStatus.SCRAPING);

    try {
      const data = await simulateScrape(url);
      setPageData(data);
      
      setStatus(AgentStatus.ANALYZING);
      const service = new GeminiService();
      const analysis = await service.analyzeMerchandising(data);
      
      setResult(analysis);
      setStatus(AgentStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during analysis.");
      setStatus(AgentStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold">M</span>
            </div>
            <h1 className="font-bold text-slate-800 tracking-tight">Agent M <span className="text-slate-400 font-normal">| Merchandising Analyst (Alpha)</span></h1>
          </div>
          <div className="hidden md:flex items-center space-x-4 text-xs font-mono text-slate-500">
            <span>A2A Enabled</span>
            <span>MCP Ready</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded">v0.1.0-alpha</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8">
        {/* URL Input Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <form onSubmit={handleStartAnalysis} className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Initialize Site Audit</h2>
            <p className="text-slate-500 mb-6">Input a target e-commerce URL to deploy Agent M for a strategic merchandising audit.</p>
            
            <div className="flex flex-col md:flex-row gap-3">
              <input 
                type="url" 
                placeholder="https://example-commerce-site.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
              <button 
                type="submit"
                disabled={status === AgentStatus.SCRAPING || status === AgentStatus.ANALYZING}
                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:bg-slate-300 transition-colors shadow-lg flex items-center justify-center min-w-[160px]"
              >
                {status === AgentStatus.SCRAPING && "Deploying Scraper..."}
                {status === AgentStatus.ANALYZING && "Analyzing Data..."}
                {status !== AgentStatus.SCRAPING && status !== AgentStatus.ANALYZING && "Run Analyst"}
              </button>
            </div>
          </form>
        </div>

        {/* Loading / Status State */}
        {(status === AgentStatus.SCRAPING || status === AgentStatus.ANALYZING) && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="text-center">
              <p className="font-bold text-slate-800 text-lg">
                {status === AgentStatus.SCRAPING ? "Capturing DOM & Product Heuristics..." : "Agent M is generating Strategy Report..."}
              </p>
              <p className="text-slate-500 text-sm mt-1">Grounding analysis in Baymard & Forrester frameworks</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === AgentStatus.ERROR && (
          <div className="bg-red-50 border border-red-200 p-6 rounded-2xl text-center">
            <p className="text-red-700 font-bold mb-2">Audit Failed</p>
            <p className="text-red-600 text-sm">{error}</p>
            <button 
              onClick={() => setStatus(AgentStatus.IDLE)}
              className="mt-4 text-xs font-bold uppercase tracking-widest text-red-700 hover:underline"
            >
              Retry Audit
            </button>
          </div>
        )}

        {/* Results Area */}
        {result && (
          <div className="space-y-8 pb-12">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-800">Operational Intelligence Report</h2>
              <div className="text-xs text-slate-500 font-mono">ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
            </div>
            
            <AnalysisDisplay result={result} />
          </div>
        )}
      </main>

      {/* Persistent Call to Action / Info Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-3 shadow-2xl z-40">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center text-[10px] md:text-xs text-slate-400 font-mono uppercase tracking-tighter">
          <div className="flex space-x-4">
            <span>GOVERNANCE: COMPLIANT</span>
            <span>TRUST: HIGH</span>
          </div>
          <div className="text-right">
            <span>PROPRIETARY ALPHA // FOR INTERNAL USE ONLY</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

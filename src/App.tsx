/**
 * CLIENT AGENT (Audit Orchestrator)
 * Role: Audit planning, agent routing, synthesis.
 * Forbidden: Direct crawling, UX judgments, Transaction inspection.
 */
import React, { useState } from 'react';
import { AgentStatus, PageData, AnalysisResult, AuditMode } from './types';
import { GeminiService } from './services/geminiService';
import { AuditSetup } from './components/AuditSetup';
// Use new LoadingAudit instead of LoadingView
import { LoadingAudit } from './components/LoadingAudit';
import { StrategyReport } from './components/StrategyReport';
import { AgentOrchestrator } from './components/AgentOrchestrator';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { Settings } from 'lucide-react';
import { Button } from './components/ui/button';

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditMode, setAuditMode] = useState<AuditMode>(AuditMode.HYBRID);

  // New State for Orchestrator View
  const [view, setView] = useState<'main' | 'orchestrator'>('main');

  const performRealScrape = async (targetUrl: string): Promise<PageData> => {
    const response = await fetch('http://localhost:3001/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });

    if (!response.ok) {
      throw new Error(`Scraping failed: ${response.statusText}`);
    }

    return await response.json() as PageData;
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setError(null);
    setResult(null);
    setStatus(AgentStatus.SCRAPING);

    try {
      const data = await performRealScrape(url);

      // Update status to analyzing after scrape
      setStatus(AgentStatus.ANALYZING);

      const service = new GeminiService();
      const analysis = await service.analyzeMerchandising(data, auditMode);

      setResult(analysis);
      setStatus(AgentStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during analysis.');
      setStatus(AgentStatus.ERROR);
    }
  };

  const handleBackToSetup = () => {
    setStatus(AgentStatus.IDLE);
    setResult(null);
    setError(null);
  };

  // Toggle between Main App and Orchestrator
  const toggleOrchestrator = () => {
    setView(prev => prev === 'main' ? 'orchestrator' : 'main');
  };

  if (view === 'orchestrator') {
    return <AgentOrchestrator onBack={() => setView('main')} />;
  }

  return (
    <div className="min-h-screen relative">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="font-bold text-zinc-200 tracking-tight">
                merchGent
              </h1>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
                Diagnostic System
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center space-x-4 text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
              <span>A2A Enabled</span>
              <span>|</span>
              <span>MCP Ready</span>
              <span>|</span>
              <span className="bg-zinc-800 px-2 py-1 rounded">v0.3.0-beta</span>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleOrchestrator}
              className="text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10"
              title="Agent Orchestrator (Admin)"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {status === AgentStatus.IDLE && (
        <AuditSetup
          url={url}
          auditMode={auditMode}
          status={status}
          onUrlChange={setUrl}
          onModeChange={setAuditMode}
          onSubmit={handleStartAnalysis}
        />
      )}

      {(status === AgentStatus.SCRAPING || status === AgentStatus.ANALYZING) && (
        <LoadingAudit
          url={url}
          mode={auditMode}
          // Optional: passing onComplete if we were simulating, but we drive via state
        />
      )}

      {status === AgentStatus.ERROR && (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
          <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl text-center max-w-2xl">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-400 mb-3">Audit Failed</h2>
            <p className="text-sm text-red-300 mb-6">{error}</p>
            <button
              onClick={handleBackToSetup}
              className="bg-zinc-800 text-zinc-200 px-6 py-2 rounded-lg font-bold hover:bg-zinc-700 transition-colors"
            >
              Back to Setup
            </button>
          </div>
        </div>
      )}

      {status === AgentStatus.COMPLETED && result && (
        <div>
          <StrategyReport result={result} url={url} />
          <div className="fixed bottom-6 right-6">
            <button
              onClick={handleBackToSetup}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-6 py-3 rounded-lg font-bold hover:bg-zinc-700 transition-colors shadow-2xl"
            >
              New Audit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

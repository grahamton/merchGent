/**
 * CLIENT AGENT (Audit Orchestrator)
 * Role: Audit planning, agent routing, synthesis.
 * Forbidden: Direct crawling, UX judgments, Transaction inspection.
 */
import React, { useState } from 'react';
import { AgentStatus, PageData, AnalysisResult, AuditMode } from './types';
import { AuditSetup } from './components/AuditSetup';
// Use new LoadingAudit instead of LoadingView
import { LoadingAudit } from './components/LoadingAudit';
import { StrategyReport } from './components/StrategyReport';
import { ExperienceWalkthrough } from './components/ExperienceWalkthrough';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditMode, setAuditMode] = useState<AuditMode>(AuditMode.HYBRID);

  const getErrorMessage = async (response: Response) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string') {
        return payload.error;
      }
    } catch {
      // fall through to status text
    }

    return `Request failed: ${response.status} ${response.statusText}`;
  };

  const performRealScrape = async (targetUrl: string): Promise<PageData> => {
    const response = await fetch(`${API_BASE_URL}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return await response.json() as PageData;
  };

  const performAnalysis = async (pageData: PageData, mode: AuditMode): Promise<AnalysisResult> => {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageData, mode })
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return await response.json() as AnalysisResult;
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setError(null);
    setResult(null);
    setStatus(AgentStatus.SCRAPING);

    try {
      if (auditMode === AuditMode.WALKTHROUGH) {
        // Special case for Walkthrough:
        // We skip the standard specific scrape/analyze flow and jump straight to the interactive component
        // The component itself will handle the API calls to start/manage the journey.
        setStatus(AgentStatus.COMPLETED);
        return;
      }

      const data = await performRealScrape(url);

      // Update status to analyzing after scrape
      setStatus(AgentStatus.ANALYZING);

      const analysis = await performAnalysis(data, auditMode);

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
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
          status={status}
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

      {status === AgentStatus.COMPLETED && result && auditMode !== AuditMode.WALKTHROUGH && (
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

      {status === AgentStatus.COMPLETED && auditMode === AuditMode.WALKTHROUGH && (
         <ExperienceWalkthrough url={url} onFinish={handleBackToSetup} />
      )}

    </div>
  );
};

export default App;

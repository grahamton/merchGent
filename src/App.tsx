/**
 * CLIENT AGENT (Audit Orchestrator)
 * Role: Audit planning, agent routing, synthesis.
 * Forbidden: Direct crawling, UX judgments, Transaction inspection.
 */
import React, { useState } from 'react';
import { AgentStatus, PageData, AnalysisResult, AuditMode } from './types';
import { AuditSetup } from './components/AuditSetup';
import { LoadingAudit } from './components/LoadingAudit';
import { StrategyReport } from './components/StrategyReport';
import { useTheme } from './hooks/useTheme';
import { API_BASE_URL } from './config';


const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default to WALKTHROUGH for the "One Blended Experience"
  const [auditMode, setAuditMode] = useState<AuditMode>(AuditMode.WALKTHROUGH);

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
      // Simple flow: scrape then analyze
      const data = await performRealScrape(url);
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
    <div className="min-h-screen relative bg-white dark:bg-black font-sans">
      {/* Header removed from here - Components own their layout now for Brutalism */}

      {/* Main Content */}
      {status === AgentStatus.IDLE && (
        <AuditSetup
          url={url}
          status={status}
          onUrlChange={setUrl}
          onModeChange={setAuditMode}
          onSubmit={handleStartAnalysis}
          onThemeToggle={toggleTheme}
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
        <div className="min-h-screen bg-black flex items-center justify-center p-8">
          <div className="bg-red-500/10 border border-red-500 p-8 text-center max-w-2xl">
            <h2 className="text-xl font-bold text-red-500 mb-3 uppercase tracking-widest">System Failure</h2>
            <p className="text-sm text-red-400 mb-6 font-mono">{error}</p>
            <button
              onClick={handleBackToSetup}
              className="bg-black border border-white text-white px-6 py-2 font-bold uppercase hover:bg-white hover:text-black transition-colors"
            >
              Reset System
            </button>
          </div>
        </div>
      )}

      {/* Show Results */}
      {status === AgentStatus.COMPLETED && result && (
         <StrategyReport result={result} url={url} />
      )}

    </div>
  );
};

export default App;

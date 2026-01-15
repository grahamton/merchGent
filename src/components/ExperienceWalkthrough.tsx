import React, { useState, useEffect, useRef } from 'react';
import { PageData, AnalysisResult, AuditMode } from '../types';
import { API_BASE_URL } from '../config';

interface ExperienceWalkthroughProps {
  initialUrl: string;
  onClose: () => void;
  onAuditFull: (result: AnalysisResult) => void;
  auditMode: AuditMode;
  setAuditMode: (mode: AuditMode) => void;
}


export const ExperienceWalkthrough: React.FC<ExperienceWalkthroughProps> = ({
  initialUrl,
  onClose,
  onAuditFull,
  auditMode,
  setAuditMode
}) => {
  const [journey, setJourney] = useState<any>(null); // TODO: Switch to Journey type after verifying full shape
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'navigate' | 'search' | 'interact'>('navigate');
  const [lastPageData, setLastPageData] = useState<PageData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // START SESSION
  useEffect(() => {
    const startJourney = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/journey/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startUrl: initialUrl })
        });
        if (!response.ok) throw new Error('Failed to start journey');
        const data = await response.json();
        setJourney(data);

        if (data.id) {
            await executeStep(initialUrl, data.id);
        }

      } catch (e: any) {
          console.error('Failed to start journey', e);
          setError(e.message || 'Failed to initialize session');
      }
      setLoading(false);
    };

    if (initialUrl && !journey) {
        startJourney();
    }
  }, [initialUrl]);

  // SCROLL TO BOTTOM
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [journey?.steps, analysisResult]);

  const executeStep = async (url: string, journeyId: string) => {
      setLoading(true);
      setError(null);
      try {
          // 1. WEB AGENT: Scrape/Interact
          const scrapeRes = await fetch(`${API_BASE_URL}/api/interact`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  url,
                  action: 'navigate'
               })
          });
          if (!scrapeRes.ok) throw new Error('Scrape failed');
          const pageData: PageData = await scrapeRes.json();
          setLastPageData(pageData);

          // 2. JOURNEY MANAGER: Record Step
          // Backend expects stepData to contain propery 'pageData'
          const stepRes = await fetch(`${API_BASE_URL}/api/journey/step`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  journeyId,
                  stepData: {
                      url: pageData.url,
                      pageData: pageData,
                      screenshotPath: pageData.screenshotPath,
                      cookies: pageData.cookies
                  }
              })
          });
          if (!stepRes.ok) throw new Error('Failed to save step');
          const newStep = await stepRes.json();

          setJourney((prev: any) => ({
              ...prev,
              steps: [...(prev?.steps || []), newStep]
          }));

      } catch (e: any) {
          console.error('Step execution failed', e);
          setError(e.message || 'Step execution failed');
      }
      setLoading(false);
  };

  const handleNextStep = async (e: React.FormEvent) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const nextUrl = formData.get('nextUrl') as string;
      if (nextUrl && journey?.id) {
          await executeStep(nextUrl, journey.id);
      }
  };

  const performInteraction = async (action: string, params: any) => {
      if (!lastPageData || !journey?.id) return;
      setLoading(true);
      setError(null);
      try {
           const res = await fetch(`${API_BASE_URL}/api/interact`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  url: lastPageData.url,
                  action,
                  cookies: lastPageData.cookies,
                  ...params
              })
          });
          if (!res.ok) throw new Error('Interaction failed');
          const pageData: PageData = await res.json();
          setLastPageData(pageData);

           const stepRes = await fetch(`${API_BASE_URL}/api/journey/step`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  journeyId: journey.id,
                  stepData: {
                      url: pageData.url,
                      pageData: pageData,
                      screenshotPath: pageData.screenshotPath,
                      cookies: pageData.cookies
                  }
              })
          });
          if (!stepRes.ok) throw new Error('Failed to save step');
          const newStep = await stepRes.json();

           setJourney((prev: any) => ({
              ...prev,
              steps: [...(prev?.steps || []), newStep]
          }));
      } catch (e: any) {
          console.error('Interaction failed', e);
          setError(e.message || 'Interaction failed');
      }
      setLoading(false);
  };

  const executeAnalysis = async () => {
    if (!lastPageData) return;
    setAnalyzing(true);
    setError(null);
    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pageData: lastPageData,
                mode: auditMode
            })
        });
        if (!response.ok) throw new Error('Analysis failed');
        const result: AnalysisResult = await response.json();
        setAnalysisResult(result);
        if (onAuditFull) onAuditFull(result);
    } catch (e: any) {
        console.error('Analysis failed', e);
        setError(e.message || 'Analysis generation failed');
    }
    setAnalyzing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-black text-black dark:text-white font-sans">
        {/* HEADER: Industrial Status Bar */}
        <div className="border-b-2 border-black dark:border-white p-4 flex items-center justify-between bg-white dark:bg-black">
            <div className="flex items-center gap-4">
                <div className={`h-4 w-4 rounded-none border border-black dark:border-white ${error ? 'bg-red-600 animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
                <h1 className="text-lg font-bold uppercase tracking-widest hidden md:block">
                    SESSION ID: {journey?.id?.slice(0,8) || 'INIT...'}
                </h1>
                {lastPageData && (
                    <span className="px-2 py-1 border border-black dark:border-white text-xs font-mono font-bold">
                        {lastPageData.products?.length || 0} ITEMS
                    </span>
                )}
            </div>
            <button
                onClick={onClose}
                className="px-4 py-2 border border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors font-bold uppercase text-sm"
            >
                [X] Terminate
            </button>
        </div>

        {/* ERROR BANNER */}
        {error && (
            <div className="bg-red-600 text-white p-2 text-center font-bold font-mono text-sm uppercase animate-in slide-in-from-top-2">
                ⚠ SYSTEM ALERT: {error}
            </div>
        )}

        {/* MAIN DISPLAY: Minimalist Frame */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-zinc-900 relative">
           {/* Step History */}
           <div className="space-y-4 max-w-4xl mx-auto pb-32">
               {journey?.steps?.map((step: any, i: number) => (
                   <div key={step.id || i} className="border border-black dark:border-white p-4 bg-white dark:bg-black relative group">
                       {/* Step Number Badge */}
                       <div className="absolute -top-3 -left-3 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white px-2 py-1 font-mono text-xs font-bold z-10">
                           STEP {String(i + 1).padStart(2, '0')}
                       </div>

                       {/* Content */}
                       <div className="flex flex-col md:flex-row gap-4 mt-2">
                           {step.screenshotPath && (
                               <div className="w-full md:w-48 shrink-0 border border-black dark:border-white overflow-hidden bg-gray-200">
                                   <img
                                       src={`${API_BASE_URL}/screenshots/${step.screenshotPath.split(/[/\\]/).pop()}`}
                                       alt="Capture"
                                       className="w-full h-auto grayscale group-hover:grayscale-0 transition-all duration-300"
                                       onError={(e) => {
                                           (e.target as HTMLImageElement).style.display = 'none';
                                       }}
                                   />
                               </div>
                           )}
                           <div className="flex-1 min-w-0">
                               <div className="font-mono text-xs text-gray-500 mb-1">{step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : '--:--'}</div>
                               <div className="font-bold truncate text-lg">{step.dataSummary?.title || step.url || 'Unknown Page'}</div>
                               <div className="text-sm font-mono mt-2 text-gray-600 dark:text-gray-400 truncate border-b border-dashed border-gray-400 inline-block pb-0.5">
                                   {step.url}
                               </div>
                           </div>
                       </div>
                   </div>
               ))}

               {/* Analysis Result Block */}
               {analysisResult && (
                   <div className="border-2 border-black dark:border-white p-6 bg-white dark:bg-black mt-8">
                       <h3 className="text-xl font-bold uppercase border-b-2 border-black dark:border-white pb-2 mb-4">
                           AUDIT REPORT: {auditMode.toUpperCase()}
                       </h3>

                       {/* The Kill Sheet Matrix */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-black dark:bg-white border border-black dark:border-white">
                           {Object.entries(analysisResult.auditMatrix || {}).map(([key, data]: [string, any]) => (
                               <div key={key} className="bg-white dark:bg-black p-4">
                                   <div className="flex justify-between items-start mb-2">
                                       <span className="font-bold uppercase tracking-wider">{key}</span>
                                       <span className={`px-2 py-0.5 text-xs font-bold border ${
                                           data.status === 'fail' ? 'border-red-600 text-red-600' :
                                           data.status === 'pass' ? 'border-green-600 text-green-600' :
                                           'border-gray-500 text-gray-500'
                                       }`}>
                                           {data.status.toUpperCase()}
                                       </span>
                                   </div>
                                   <p className="text-sm font-mono leading-tight">{data.finding}</p>
                               </div>
                           ))}
                       </div>

                       {/* Diagnosis & Recommendations */}
                       <div className="mt-6 space-y-4">
                           <div>
                               <h4 className="font-bold uppercase text-gray-500 dark:text-gray-400 text-xs tracking-widest mb-1">Diagnosis</h4>
                               <p className="font-mono text-sm leading-relaxed">{analysisResult.diagnosis?.title}: {analysisResult.diagnosis?.description}</p>
                           </div>

                           {analysisResult.recommendations?.length > 0 && (
                               <div>
                                   <h4 className="font-bold uppercase text-gray-500 dark:text-gray-400 text-xs tracking-widest mb-2">Correction Items</h4>
                                   <ul className="list-decimal list-inside space-y-1 font-mono text-sm">
                                       {analysisResult.recommendations.map((rec: any, i: number) => (
                                           <li key={i} className={rec.impact === 'high' ? 'text-red-600 dark:text-red-400 font-bold' : ''}>
                                               {rec.title}
                                           </li>
                                       ))}
                                   </ul>
                               </div>
                           )}
                       </div>
                   </div>
               )}
           </div>

           <div ref={scrollRef}></div>
        </div>

        {/* COCKPIT (FOOTER) */}
        <div className="border-t-2 border-black dark:border-white bg-white dark:bg-black">
            {/* Mode Selector / Tabs */}
            <div className="grid grid-cols-3 border-b border-black dark:border-white">
               {['navigate', 'search', 'interact'].map((mode) => (
                   <button
                       key={mode}
                       onClick={() => setInteractionMode(mode as any)}
                       className={`py-4 text-sm font-bold uppercase tracking-widest border-r border-black dark:border-white last:border-r-0 transition-all ${
                           interactionMode === mode
                           ? 'bg-black text-white dark:bg-white dark:text-black'
                           : 'hover:bg-gray-100 dark:hover:bg-zinc-900 text-gray-500'
                       }`}
                   >
                       {mode}
                   </button>
               ))}
            </div>

            {/* Controls Area */}
            <div className="p-4 bg-gray-50 dark:bg-zinc-950 min-h-[120px]">

                {/* 1. NAVIGATE */}
                {interactionMode === 'navigate' && (
                    <div className="flex flex-col md:flex-row gap-4">
                         {/* Audit Switch */}
                         <div className="border border-black dark:border-white bg-white dark:bg-black px-2 flex items-center shrink-0">
                            <select
                                value={auditMode}
                                onChange={(e) => setAuditMode(e.target.value as any)}
                                className="bg-transparent text-sm font-bold uppercase outline-none py-2 pr-4 cursor-pointer"
                            >
                                <option value="knowledge">PRODUCT MODE</option>
                                <option value="transaction">CHECKOUT MODE</option>
                            </select>
                         </div>

                        {/* Analyze Button */}
                        <button
                            onClick={executeAnalysis}
                            disabled={analyzing || !lastPageData}
                            className={`px-6 font-bold uppercase border border-black dark:border-white transition-all flex items-center justify-center gap-2 shrink-0 ${
                                analyzing ? 'opacity-50 cursor-wait' : 'hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black'
                            }`}
                        >
                            {analyzing ? 'ANALYZING...' : 'RUN AUDIT'}
                        </button>

                        {/* URL Input */}
                        <form onSubmit={handleNextStep} className="flex-1 flex gap-0 border border-black dark:border-white shadow-sm">
                            <input
                               type="url"
                               name="nextUrl"
                               placeholder="ENTER URL..."
                               defaultValue={journey?.steps[journey?.steps.length-1]?.url || ''}
                               required
                               className="flex-1 px-4 py-3 bg-white dark:bg-black text-black dark:text-white outline-none font-mono text-sm placeholder-gray-500"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 font-bold bg-gray-200 dark:bg-zinc-800 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black border-l border-black dark:border-white transition-colors"
                            >
                                GO
                            </button>
                        </form>
                    </div>
                )}

                {/* 2. SEARCH */}
                {interactionMode === 'search' && (
                    <form
                       onSubmit={(e) => {
                           e.preventDefault();
                           const formData = new FormData(e.target as HTMLFormElement);
                           performInteraction('search', { value: formData.get('query') as string });
                       }}
                       className="flex border border-black dark:border-white shadow-sm"
                    >
                        <input
                            type="text"
                            name="query"
                            placeholder="SEARCH QUERY..."
                            required
                            className="flex-1 px-4 py-3 bg-white dark:bg-black outline-none font-bold uppercase text-lg"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-8 font-bold border-l border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                        >
                            EXECUTE
                        </button>
                    </form>
                )}

                {/* 3. INTERACT */}
                {interactionMode === 'interact' && (
                    <div>
                        <div className="text-xs font-mono mb-2 text-gray-500">DETECTED INTERACTABLES:</div>
                        <div className="flex flex-wrap gap-2">
                             {lastPageData?.interactables?.slice(0, 15).map((action: any, i:number) => (
                                <button
                                    key={i}
                                    onClick={() => performInteraction('click', { selector: action.selector })}
                                    disabled={loading}
                                    className="px-3 py-2 border border-black dark:border-white text-xs font-mono hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                >
                                    [{action.type.toUpperCase()}] {action.text ? action.text.slice(0, 20) : 'ELEMENT'}
                                </button>
                             ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

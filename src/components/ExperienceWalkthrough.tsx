import React, { useState, useEffect, useRef } from 'react';
import { Journey, JourneyStep } from '../types';

interface ExperienceWalkthroughProps {
  url: string;
  onFinish?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const ExperienceWalkthrough: React.FC<ExperienceWalkthroughProps> = ({ url, onFinish }) => {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize Journey on mount
  useEffect(() => {
    const startJourney = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/journey/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startUrl: url })
        });
        const newJourney = await res.json();
        setJourney(newJourney);

        // Immediately perform the first step (the start URL)
        await performStep(newJourney.id, url, []);
      } catch (err: any) {
        setError(err.message || 'Failed to start journey');
      } finally {
        setLoading(false);
      }
    };

    if (url && !journey) {
        startJourney();
    }
  }, [url]); // eslint-disable-line

  // Auto-scroll to latest step
  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [journey?.steps.length]);

  const performStep = async (journeyId: string, targetUrl: string, currentCookies: any[]) => {
      setLoading(true);
      setError(null);
      try {
          // 1. Scrape (with cookies)
          const scrapeRes = await fetch(`${API_BASE_URL}/api/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: targetUrl, cookies: currentCookies })
          });

          if (!scrapeRes.ok) throw new Error('Scrape failed');
          const pageData = await scrapeRes.json();

          // 2. Add Step to Journey (Persist)
          const stepRes = await fetch(`${API_BASE_URL}/api/journey/step`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  journeyId,
                  stepData: {
                      url: targetUrl,
                      pageData: pageData, // Includes structure, products, etc.
                      screenshotPath: pageData.screenshotPath,
                      cookies: pageData.cookies
                  }
              })
          });

          if (!stepRes.ok) throw new Error('Failed to save step');
          const newStep = await stepRes.json();

          // 3. Update Local State
          setJourney(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  steps: [...prev.steps, newStep],
                  // Update our "cookie jar" in memory with latest from this step
                  cookies: pageData.cookies
              } as any; // Cast because 'cookies' isn't on Journey interface yet but we store it for runtime
          });

      } catch (err: any) {
          setError(err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleNextStep = (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const nextUrl = formData.get('nextUrl') as string;
      if (nextUrl && journey) {
          // Use latest cookies (stored in journey state potentially or just let backend handle it?
          // Implementation Plan said backend manages it, but we passed cookies in scrape.
          // Let's rely on backend state via getState if needed, but for now we can just assume
          // the backend JourneyManager has the cookies.
          // WAIT, WebAgent needs cookies passed to it.
          // JourneyManager updates its jar on 'addStep'.
          // But 'scrape' doesn't know about JourneyManager.
          // So we MUST fetch state or keep it locally.
          // Let's use backend state fetch before scraping to be safe, OR just use what we have locally.

          // Let's fetch strict state to be safe.
          fetch(`${API_BASE_URL}/api/journey/${journey.id}/state`)
            .then(res => res.json())
            .then(state => {
                performStep(journey.id, nextUrl, state.cookies);
            });
      }
      form.reset();
  };

  if (!journey && loading) return <div className="p-10 text-center text-zinc-500">Initializing Journey...</div>;
  if (error && !journey) return <div className="p-10 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-10 flex justify-between items-center">
          <div>
              <h2 className="text-sm uppercase tracking-wider text-blue-400 font-bold">Experience Walkthrough</h2>
              <div className="text-xs text-zinc-500 font-mono">{journey?.id}</div>
          </div>
          <button onClick={onFinish} className="text-zinc-400 hover:text-white text-sm">Exit</button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {journey?.steps.map((step, index) => (
              <div key={step.id} className="relative flex gap-6">
                  {/* Step Marker */}
                  <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-900 border border-blue-500 flex items-center justify-center text-blue-200 font-bold text-sm shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                          {index + 1}
                      </div>
                      {index !== (journey.steps.length - 1) && <div className="w-0.5 flex-1 bg-zinc-800 my-2"></div>}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
                          <div className="font-mono text-xs text-zinc-400 truncate max-w-md" title={step.url}>{step.url}</div>
                          <div className="text-xs text-zinc-600">{new Date(step.timestamp).toLocaleTimeString()}</div>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Screenshot */}
                          <div className="aspect-video bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800">
                             {/* Note: Screenshot path is absolute on server. We need to serve it?
                                 For now, use a placeholder or assume we can't see local files directly in browser
                                 unless served statically.
                                 TODO: Add static serving to server.
                             */}
                             <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
                                [Screenshot: {step.screenshotPath.split(/[/\\]/).pop()}]
                             </div>
                          </div>

                          {/* Data Summary */}
                          <div className="space-y-4">
                              {step.dataSummary.title && (
                                  <div className="font-bold text-zinc-200">{step.dataSummary.title}</div>
                              )}

                              <div className="flex gap-2 flex-wrap">
                                  {/* Product Count Badge */}
                                  <div className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400 border border-zinc-700">
                                      {step.dataSummary.productCount} Products
                                  </div>

                                  {/* Data Layer Badges */}
                                  {/* Note: step.dataSummary currently only has productCount/title in the interface journeyManager saves.
                                      I need to update journeyManager.js to actually SAVE the new fields.
                                      Wait, I missed that. Ticket 5 requires backend persistence update too.
                                      I will persist 'dataSummary' with more fields in journeyManager.js
                                  */}
                              </div>

                              <div className="mt-4 p-2 bg-zinc-950 rounded text-xs text-zinc-500 font-mono h-32 overflow-y-auto">
                                  DATA PAYLOAD SAVED
                              </div>
                          </div>

                          {/* Findings */}
                          {step.dataSummary.findings && step.dataSummary.findings.length > 0 && (
                              <div className="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-zinc-800">
                                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Analysis Findings</div>
                                <div className="grid gap-2">
                                    {step.dataSummary.findings.map((finding: any) => (
                                      <div key={finding.id} className={`p-3 rounded-lg border text-sm ${
                                         finding.severity === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-200' :
                                         finding.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' :
                                         'bg-blue-500/10 border-blue-500/30 text-blue-200'
                                      }`}>
                                         <div className="font-bold mb-1 flex items-center gap-2">
                                            {finding.severity === 'warning' && <span>⚠️</span>}
                                            {finding.severity === 'critical' && <span>🚫</span>}
                                            {finding.severity === 'info' && <span>ℹ️</span>}
                                            <span>{finding.title}</span>
                                            <span className="ml-auto text-[10px] uppercase font-mono bg-black/30 px-1.5 py-0.5 rounded border border-white/10">{finding.category}</span>
                                         </div>
                                         <div className="opacity-80 text-xs leading-relaxed">{finding.description}</div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          ))}
          <div ref={scrollRef}></div>
      </div>

      {/* Footer Controls */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-4">
          <div className="max-w-4xl mx-auto space-y-4">
              {/* Smart Suggestions */}
              {journey?.steps[journey.steps.length-1]?.dataSummary?.interactables &&
               journey.steps[journey.steps.length-1].dataSummary.interactables!.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {journey?.steps[journey.steps.length-1].dataSummary.interactables!.slice(0, 5).map((action, i) => (
                          <button
                             key={i}
                             onClick={() => {
                                 const input = document.querySelector('input[name="nextUrl"]') as HTMLInputElement;
                                 if(input && action.href) {
                                     // If relative, make absolute
                                     try {
                                        const currentUrl = new URL(journey.steps[journey.steps.length-1].url);
                                        const next = new URL(action.href, currentUrl);
                                        input.value = next.toString();
                                     } catch {
                                         input.value = action.href;
                                     }
                                 }
                             }}
                             className="flex-shrink-0 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 flex items-center gap-2 transition-colors"
                          >
                              <span className="opacity-50">[{action.type}]</span>
                              <span className="font-medium truncate max-w-[150px]">{action.text}</span>
                          </button>
                      ))}
                  </div>
              )}

              <form onSubmit={handleNextStep} className="flex gap-4">
                  <input
                     type="url"
                     name="nextUrl"
                     placeholder="Enter URL for next step..."
                     defaultValue={journey?.steps[journey?.steps.length-1]?.url || ''}
                     required
                     className="flex-1 bg-zinc-950 border border-zinc-700 text-white px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  />
                  <button
                     type="submit"
                     disabled={loading}
                     className={`px-6 py-3 rounded-lg font-bold text-white transition-all ${
                         loading ? 'bg-zinc-700 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                     }`}
                  >
                      {loading ? 'Walking...' : 'Go'}
                  </button>
              </form>
          </div>
      </div>
    </div>
  );
};

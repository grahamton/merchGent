import React, { useEffect, useState, useRef } from 'react';
import { AgentStatus, AuditMode } from '../types';

interface LoadingAuditProps {
  url: string;
  mode: string;
  status: AgentStatus;
}

export function LoadingAudit({ url, mode, status }: LoadingAuditProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulated log generation for "Cool Factor"
  useEffect(() => {
    const messages = [
      "INITIALIZING NEURAL LINK...",
      "HANDSHAKE ESTABLISHED",
      `TARGET LOCKED: ${url.toUpperCase()}`,
      "BYPASSING CACHE LAYER...",
      "INJECTING PROBES...",
      "ANALYZING DOM STRUCTURE...",
      "DETECTING CONVERSION BLOCKERS...",
      "Extracting Merchandising Signals...",
      "Evaluating Visual Hierarchy...",
      "Checking for Dark Patterns...",
      "Synthesizing Kill Sheet...",
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < messages.length) {
        setLogs(prev => [...prev, `> ${messages[currentIndex]}`]);
        currentIndex++;
      } else {
        // Keep adding "processing" noise
        setLogs(prev => [...prev, `> PROCESSING_CHUNK_${Math.floor(Math.random() * 9999)}...`]);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [url]);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center font-mono relative overflow-hidden">

      {/* Background Grid Animation */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
           style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="max-w-4xl w-full z-10 space-y-8">

        {/* HEADER BLOCK */}
        <div className="border-4 border-white p-6 bg-black shadow-[16px_16px_0px_0px_rgba(255,255,255,0.2)]">
            <div className="flex justify-between items-end border-b-2 border-white pb-4 mb-6">
                <div>
                    <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-2">
                        {status === AgentStatus.SCRAPING ? 'SCRAPING' : 'ANALYZING'}
                    </h1>
                    <div className="flex items-center gap-3">
                        <div className="h-3 w-3 bg-green-500 animate-ping rounded-full"></div>
                        <span className="text-sm font-bold tracking-widest text-green-500">ACTIVE THREAD</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-400 mb-1">AUDIT MODE</div>
                    <div className="text-xl font-bold bg-white text-black px-3 py-1 uppercase">{mode.replace('Audit', '')}</div>
                </div>
            </div>

            {/* URL TARGET */}
            <div className="flex items-center gap-4 text-xl">
                 <span className="text-gray-500 font-bold">{'>'} TARGET:</span>
                 <span className="border-b border-dashed border-gray-500 flex-1 py-1 truncate">{url}</span>
            </div>
        </div>

        {/* LOG TERMINAL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Visualizer (Left) */}
            <div className="col-span-2 border-2 border-white bg-zinc-900 p-4 relative h-64 flex flex-col">
                <div className="absolute top-0 right-0 bg-white text-black px-2 text-xs font-bold">SYSTEM_LOG</div>
                <div ref={scrollRef} className="flex-1 overflow-hidden font-mono text-sm space-y-1 text-green-400 p-2">
                    {logs.map((log, i) => (
                        <div key={i} className="animate-in fade-in slide-in-from-left-2 duration-300">{log}</div>
                    ))}
                    <div className="animate-pulse">_</div>
                </div>
            </div>

            {/* Stats (Right) */}
            <div className="border-2 border-white bg-black p-4 space-y-6">
                <div>
                    <div className="text-xs text-gray-500 mb-1">CPU LOAD</div>
                    <div className="w-full bg-zinc-800 h-4 border border-zinc-600">
                        <div className="h-full bg-white animate-pulse" style={{ width: '85%' }}></div>
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 mb-1">MEMORY</div>
                    <div className="w-full bg-zinc-800 h-4 border border-zinc-600">
                         <div className="h-full bg-white" style={{ width: '42%' }}></div>
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 mb-1">NETWORK</div>
                    <div className="flex gap-1 h-8 items-end">
                        {[40, 70, 30, 80, 50, 90, 60].map((h, i) => (
                             <div key={i} className="flex-1 bg-blue-600 animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}></div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}

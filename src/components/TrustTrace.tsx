import React, { useState } from 'react';
import { TrustTraceEntry } from '../types';

interface TrustTraceProps {
  entries: TrustTraceEntry[];
}

export const TrustTrace: React.FC<TrustTraceProps> = ({ entries }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAgentColor = (agent: string) => {
    if (agent.includes('Web')) return 'text-black dark:text-white';
    if (agent.includes('Merch')) return 'text-black dark:text-white';
    if (agent.includes('Data')) return 'text-black dark:text-white';
    return 'text-gray-600';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 border-b-[3px] border-black dark:border-white hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors text-left flex items-center justify-between group"
      >
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest mb-1">TRUST TRACE</h3>
          <p className="text-xs text-gray-500 font-mono">{entries.length} EVENTS LOGGED</p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed Preview */}
      {!isExpanded && (
        <div className="p-4 space-y-3">
          {entries.slice(0, 3).map((entry, i) => (
            <div key={i} className="text-xs border-l-[3px] border-black dark:border-white pl-3">
              <div className={`font-mono font-bold uppercase ${getAgentColor(entry.agent)}`}>
                {entry.agent}
              </div>
              <div className="text-gray-600 font-mono text-[11px] mt-1">{entry.action}</div>
            </div>
          ))}
          {entries.length > 3 && (
            <div className="text-xs text-gray-400 italic font-mono">+{entries.length - 3} MORE...</div>
          )}
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {entries.map((entry, i) => (
            <div key={i} className="pb-4 border-b-[2px] border-gray-200 dark:border-zinc-800 last:border-0">
              <div className="flex items-start justify-between mb-2">
                <div className={`font-mono text-xs font-bold uppercase ${getAgentColor(entry.agent)}`}>
                  {entry.agent}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <div className="text-xs leading-relaxed font-mono text-gray-700 dark:text-gray-400">
                {entry.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

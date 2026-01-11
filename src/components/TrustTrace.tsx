import React, { useState } from 'react';
import { TrustTraceEntry } from '../types';

interface TrustTraceProps {
  entries: TrustTraceEntry[];
}

export const TrustTrace: React.FC<TrustTraceProps> = ({ entries }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAgentColor = (agent: string) => {
    if (agent.includes('Web')) return 'text-blue-400';
    if (agent.includes('Merch')) return 'text-purple-400';
    if (agent.includes('Data')) return 'text-green-400';
    return 'text-zinc-400';
  };

  return (
    <div className="h-full flex flex-col border-r border-zinc-800">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 border-b border-zinc-800 hover:bg-zinc-900 transition-colors text-left flex items-center justify-between group"
      >
        <div>
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-1">Trust Trace</h3>
          <p className="text-xs text-zinc-500">{entries.length} Events Logged</p>
        </div>
        <svg
          className={`w-5 h-5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed Preview */}
      {!isExpanded && (
        <div className="p-4 space-y-2">
          {entries.slice(0, 3).map((entry, i) => (
            <div key={i} className="text-xs">
              <div className={`font-mono ${getAgentColor(entry.agent)} font-bold`}>
                {entry.agent}
              </div>
              <div className="text-zinc-500 truncate">{entry.action}</div>
            </div>
          ))}
          {entries.length > 3 && (
            <div className="text-xs text-zinc-600 italic">+{entries.length - 3} more...</div>
          )}
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {entries.map((entry, i) => (
            <div key={i} className="pb-4 border-b border-zinc-800 last:border-0">
              <div className="flex items-start justify-between mb-1">
                <div className={`font-mono text-xs font-bold ${getAgentColor(entry.agent)}`}>
                  {entry.agent}
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                {entry.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

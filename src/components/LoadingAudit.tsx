import React from 'react';
import { AgentStatus } from '../types';

interface LoadingAuditProps {
  url: string;
  mode: string;
  status: AgentStatus;
}

export function LoadingAudit({ url, mode, status }: LoadingAuditProps) {
  const statusMessage = status === AgentStatus.LOADING
    ? 'Extracting product data from page...'
    : 'Analyzing merchandising quality...';

  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center font-mono">
      <div className="max-w-4xl w-full space-y-8">

        {/* Header */}
        <div className="border-4 border-white p-8 bg-black">
          <div className="flex justify-between items-end border-b-2 border-white pb-4 mb-6">
            <div>
              <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-2">
                {status === AgentStatus.LOADING ? 'LOADING' : 'ANALYZING'}
              </h1>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 bg-green-500 animate-ping rounded-full"></div>
                <span className="text-sm font-bold tracking-widest text-green-500">IN PROGRESS</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 mb-1">MODE</div>
              <div className="text-xl font-bold bg-white text-black px-3 py-1 uppercase">
                {mode.replace(' Audit', '')}
              </div>
            </div>
          </div>

          {/* URL */}
          <div className="flex items-center gap-4 text-xl">
            <span className="text-gray-500 font-bold">TARGET:</span>
            <span className="border-b border-dashed border-gray-500 flex-1 py-1 truncate">{url}</span>
          </div>
        </div>

        {/* Status Message */}
        <div className="border-2 border-white bg-zinc-900 p-8">
          <div className="text-green-400 text-lg mb-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-green-400 border-t-transparent rounded-full"></div>
            <span>{statusMessage}</span>
          </div>
          <div className="text-gray-500 text-sm">
            This may take 10-30 seconds depending on page complexity.
          </div>
        </div>

      </div>
    </div>
  );
}

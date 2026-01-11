import React from 'react';

interface LoadingViewProps {
  url: string;
  mode: string;
  status: 'scraping' | 'analyzing';
}

export const LoadingView: React.FC<LoadingViewProps> = ({ url, mode, status }) => {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center max-w-2xl px-8">
        {/* Animated Logo/Spinner */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-blue-500 font-bold text-2xl">M</div>
            </div>
          </div>
        </div>

        {/* Status Text */}
        <h2 className="text-2xl font-bold text-zinc-200 mb-3">
          {status === 'scraping' ? 'Capturing Commerce Signals...' : 'Generating merchGent Analysis...'}
        </h2>
        <p className="text-zinc-500 mb-6">
          {status === 'scraping'
            ? 'Web Agent is extracting signals from the target site'
            : 'Merch Agent is analyzing patterns and generating recommendations'
          }
        </p>

        {/* Context Info */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="grid grid-cols-2 gap-4 text-left">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Target URL</div>
              <code className="text-xs text-blue-400 font-mono break-all">{url}</code>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Audit Mode</div>
              <div className="text-xs text-purple-400 font-mono">{mode}</div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'scraping' ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
          <div className={`w-2 h-2 rounded-full ${status === 'analyzing' ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
        </div>
      </div>
    </div>
  );
};

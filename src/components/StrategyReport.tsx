import React from 'react';
import { AnalysisResult } from '../types';
import { TrustTrace } from './TrustTrace';
import { MerchGentScoreDisplay } from './MerchGentScoreDisplay';
import { RecommendationsPanel } from './RecommendationsPanel';
import { StandardsCheckPanel } from './StandardsCheckPanel';

interface StrategyReportProps {
  result: AnalysisResult;
  url: string;
}

export const StrategyReport: React.FC<StrategyReportProps> = ({ result, url }) => {
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Report Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 p-6">
        <div className="max-w-[1800px] mx-auto">
          <div className="flex items-start">
            <div>
              <h1 className="text-2xl font-bold text-zinc-200 mb-2">
                Strategy Report
              </h1>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-zinc-500">Target:</span>
                <code className="text-blue-400 font-mono bg-zinc-800 px-2 py-1 rounded">
                  {url}
                </code>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-500">Mode:</span>
                <span className="text-purple-400 font-mono">{result.mode}</span>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-500">Site Mode:</span>
                <span className="text-emerald-400 font-mono">{result.siteMode}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four-Zone Layout */}
      <div className="max-w-[1800px] mx-auto">
        <div className="grid grid-cols-12 h-[calc(100vh-140px)]">
          {/* Zone 1: Trust Trace (Left Sidebar) */}
          <div className="col-span-3">
            <TrustTrace entries={result.trustTrace} />
          </div>

          {/* Zones 2 & 3: Main Content (Center) */}
          <div className="col-span-6 overflow-y-auto p-6 space-y-6">
            {/* Zone 2: Diagnosis */}
            <div>
              <div className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                Diagnosis
              </div>
              <MerchGentScoreDisplay score={result.merchGentScore} />

              {/* Diagnosis Text */}
              <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                <h3 className="text-lg font-bold text-zinc-200 mb-3">
                  {result.diagnosis.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {result.diagnosis.description}
                </p>
              </div>

              <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                <div className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
                  Hybrid Trap Check
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {result.hybridTrapCheck}
                </p>
              </div>

              <div className="mt-6">
                <StandardsCheckPanel items={result.standardsCheck} />
              </div>
            </div>
          </div>

          {/* Zone 4: Recommendations (Right Panel) */}
          <div className="col-span-3">
            <RecommendationsPanel recommendations={result.recommendations} />
          </div>
        </div>
      </div>
    </div>
  );
};

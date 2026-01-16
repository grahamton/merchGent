import React from 'react';
import { AnalysisResult } from '../types';
import { TrustTrace } from './TrustTrace';
import { RecommendationsPanel } from './RecommendationsPanel';
import { StandardsCheckPanel } from './StandardsCheckPanel';

interface StrategyReportProps {
  result: AnalysisResult;
  url: string;
}

export const StrategyReport: React.FC<StrategyReportProps> = ({ result, url }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-black font-sans text-black dark:text-white transition-colors duration-300">
      {/* Brutalist Report Header */}
      <div className="border-b-[3px] border-black dark:border-white bg-white dark:bg-black p-6 transition-colors duration-300">
        <div className="max-w-[1800px] mx-auto">
          <div className="flex items-start">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tight mb-3">
                STRATEGY REPORT
              </h1>
              <div className="flex items-center gap-4 text-sm font-mono uppercase">
                <span className="text-gray-500">TARGET:</span>
                <code className="text-black dark:text-white font-bold bg-gray-100 dark:bg-zinc-900 px-3 py-1 border border-gray-300 dark:border-zinc-700">
                  {url}
                </code>
                <span className="text-gray-300 dark:text-zinc-700">|</span>
                <span className="text-gray-500">MODE:</span>
                <span className="font-bold">{result.mode}</span>
                <span className="text-gray-300 dark:text-zinc-700">|</span>
                <span className="text-gray-500">SITE MODE:</span>
                <span className="font-bold">{result.siteMode}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four-Zone Layout */}
      <div className="max-w-[1800px] mx-auto">
        <div className="grid grid-cols-12 h-[calc(100vh-140px)]">
          {/* Zone 1: Trust Trace (Left Sidebar) */}
          <div className="col-span-3 border-r-[3px] border-black dark:border-white">
            <TrustTrace entries={result.trustTrace} />
          </div>

          {/* Zones 2 & 3: Main Content (Center) */}
          <div className="col-span-6 overflow-y-auto p-6 space-y-6">
            {/* Zone 2: Diagnosis */}
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-4 text-gray-500">
                DIAGNOSIS
              </div>

              {/* Diagnosis Text */}
              <div className="border-[3px] border-black dark:border-white bg-white dark:bg-black p-6 mb-6 transition-colors duration-300">
                <h3 className="text-xl font-black uppercase tracking-tight mb-4">
                  {result.diagnosis.title}
                </h3>
                <p className="text-sm leading-relaxed font-mono">
                  {result.diagnosis.description}
                </p>
              </div>

              <div className="border-[3px] border-black dark:border-white bg-white dark:bg-black p-6 mb-6 transition-colors duration-300">
                <div className="text-xs font-bold uppercase tracking-widest mb-3 text-gray-500">
                  HYBRID TRAP CHECK
                </div>
                <p className="text-sm leading-relaxed font-mono">
                  {result.hybridTrapCheck}
                </p>
              </div>

              <div className="mt-6">
                <StandardsCheckPanel items={result.standardsCheck} />
              </div>
            </div>
          </div>

          {/* Zone 4: Recommendations (Right Panel) */}
          <div className="col-span-3 border-l-[3px] border-black dark:border-white">
            <RecommendationsPanel recommendations={result.recommendations} />
          </div>
        </div>
      </div>
    </div>
  );
};

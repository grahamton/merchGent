
import React from 'react';
import { AnalysisResult } from '../types';

interface AnalysisDisplayProps {
  result: AnalysisResult;
}

const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ result }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Mode Badge */}
      <div className="flex items-center space-x-4">
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Detected Mode:</span>
        <span className={`px-4 py-1 rounded-full text-sm font-bold border ${
          result.mode === 'B2B' ? 'bg-blue-50 border-blue-200 text-blue-700' :
          result.mode === 'B2C' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
          'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {result.mode}
        </span>
      </div>

      {/* Trust Trace */}
      <section className="bg-slate-900 text-slate-300 p-6 rounded-xl border border-slate-800 shadow-xl">
        <h3 className="text-blue-400 font-mono text-sm mb-4 border-b border-slate-800 pb-2">[TRUST TRACE]</h3>
        <p className="text-sm leading-relaxed italic">{result.trustTrace}</p>
      </section>

      {/* Hybrid Trap Check */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <h3 className="font-bold text-slate-800">Hybrid Trap Check</h3>
        </div>
        <p className="text-slate-600 leading-relaxed">{result.hybridTrapCheck}</p>
      </section>

      {/* Recommendations */}
      <section>
        <h3 className="font-bold text-slate-800 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Actionable Strategic Recommendations
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {result.recommendations.map((rec, i) => (
            <div key={i} className="bg-white border border-slate-200 p-5 rounded-xl hover:border-blue-300 transition-colors shadow-sm">
              <span className="text-blue-600 font-black text-xl mb-2 block">0{i + 1}</span>
              <p className="text-sm text-slate-700">{rec}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Full Report */}
      <section className="prose prose-slate max-w-none">
         <h3 className="font-bold text-slate-800 border-b pb-2">Comprehensive Strategy Audit</h3>
         <div className="text-slate-600 whitespace-pre-wrap mt-4 text-sm leading-loose">
           {result.fullReport}
         </div>
      </section>
    </div>
  );
};

export default AnalysisDisplay;

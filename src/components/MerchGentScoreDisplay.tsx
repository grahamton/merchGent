import React from 'react';
import { MerchGentScore } from '../types';

interface MerchGentScoreDisplayProps {
  score: MerchGentScore;
}

export const MerchGentScoreDisplay: React.FC<MerchGentScoreDisplayProps> = ({ score }) => {
  // Safety check for undefined score
  if (!score || !score.status) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
        <div className="text-zinc-500 text-center">Score data unavailable</div>
      </div>
    );
  }

  const getStatusConfig = (status: MerchGentScore['status']) => {
    switch (status) {
      case 'optimized':
        return {
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          label: 'OPTIMIZED',
          icon: (
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'improving':
        return {
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          label: 'IMPROVING',
          icon: (
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          )
        };
      case 'needs-attention':
        return {
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          label: 'NEEDS ATTENTION',
          icon: (
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
        };
    }
  };

  const config = getStatusConfig(score.status);

  return (
    <div className="space-y-6">
      {/* Main Score Display */}
      <div className={`rounded-2xl border p-8 ${config.border} ${config.bg}`}>
        <div className="flex items-center justify-between mb-6">
          <div className={config.color}>{config.icon}</div>
          <div className="text-right">
            <div className={`text-6xl font-bold ${config.color} font-mono`}>
              {score.total}
            </div>
            <div className="text-sm text-zinc-500 uppercase tracking-wider mt-1">
              merchGent Score
            </div>
          </div>
        </div>
        <div className={`text-2xl font-bold ${config.color} uppercase tracking-wide`}>
          {config.label}
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <ScorePillar
          title="Intent Clarity"
          score={score.intentClarity}
          max={33}
          description="Customer journey clarity"
        />
        <ScorePillar
          title="Knowledge Access"
          score={score.knowledgeAccessibility}
          max={33}
          description="Product info findability"
        />
        <ScorePillar
          title="Transaction Ready"
          score={score.transactionReadiness}
          max={34}
          description="Purchase path smoothness"
        />
      </div>
    </div>
  );
};

interface ScorePillarProps {
  title: string;
  score: number;
  max: number;
  description: string;
}

const ScorePillar: React.FC<ScorePillarProps> = ({ title, score, max, description }) => {
  const percentage = (score / max) * 100;
  const getColor = () => {
    if (percentage >= 70) return 'bg-green-500';
    if (percentage >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
      <div className="text-zinc-400 text-xs uppercase tracking-wider mb-2">{title}</div>
      <div className="text-3xl font-bold text-zinc-200 font-mono mb-2">
        {score}<span className="text-zinc-600">/{max}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-2">
        <div
          className={`h-full rounded-full transition-all ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-[10px] text-zinc-600">{description}</div>
    </div>
  );
};

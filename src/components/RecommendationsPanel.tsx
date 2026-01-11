import React from 'react';
import { Recommendation } from '../types';

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
}

export const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({ recommendations }) => {
  const getImpactConfig = (impact: Recommendation['impact']) => {
    switch (impact) {
      case 'high':
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          label: 'HIGH'
        };
      case 'medium':
        return {
          color: 'text-yellow-400',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          label: 'MEDIUM'
        };
      case 'low':
        return {
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          label: 'LOW'
        };
    }
  };

  const getAgentColor = (agent: string) => {
    if (agent.includes('Web')) return 'text-blue-400';
    if (agent.includes('Merch')) return 'text-purple-400';
    if (agent.includes('Data')) return 'text-green-400';
    return 'text-zinc-400';
  };

  return (
    <div className="h-full flex flex-col border-l border-zinc-800">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-1">
          Actionable Intel
        </h3>
        <p className="text-xs text-zinc-500">
          Top {recommendations.length} Recommendations
        </p>
      </div>

      {/* Recommendations */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {recommendations.map((rec, i) => {
          const impactConfig = getImpactConfig(rec.impact);
          return (
            <div
              key={i}
              className={`rounded-xl border p-4 ${impactConfig.border} ${impactConfig.bg}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`text-[10px] font-mono font-bold uppercase tracking-wider ${impactConfig.color}`}>
                  {impactConfig.label} IMPACT
                </div>
                <div className={`text-[10px] font-mono ${getAgentColor(rec.agent)}`}>
                  {rec.agent}
                </div>
              </div>

              {/* Content */}
              <h4 className="text-sm font-bold text-zinc-200 mb-2">
                {rec.title}
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {rec.description}
              </p>
            </div>
          );
        })}

        {recommendations.length === 0 && (
          <div className="text-center py-8">
            <div className="text-zinc-600 text-sm">No recommendations at this time</div>
            <div className="text-zinc-700 text-xs mt-1">Site appears optimized</div>
          </div>
        )}
      </div>
    </div>
  );
};

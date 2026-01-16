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
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-950',
          border: 'border-red-600 dark:border-red-400',
          label: 'HIGH IMPACT'
        };
      case 'medium':
        return {
          color: 'text-yellow-600 dark:text-yellow-400',
          bg: 'bg-yellow-50 dark:bg-yellow-950',
          border: 'border-yellow-600 dark:border-yellow-400',
          label: 'MEDIUM IMPACT'
        };
      case 'low':
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-950',
          border: 'border-blue-600 dark:border-blue-400',
          label: 'LOW IMPACT'
        };
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b-[3px] border-black dark:border-white">
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
          ACTIONABLE INTEL
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          TOP {recommendations.length} RECOMMENDATIONS
        </p>
      </div>

      {/* Recommendations */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {recommendations.map((rec, i) => {
          const impactConfig = getImpactConfig(rec.impact);
          return (
            <div
              key={i}
              className={`border-[3px] p-4 ${impactConfig.border} ${impactConfig.bg} transition-colors duration-300`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`text-[10px] font-mono font-black uppercase tracking-wider ${impactConfig.color}`}>
                  {impactConfig.label}
                </div>
                <div className="text-[10px] font-mono text-gray-500 uppercase">
                  {rec.agent}
                </div>
              </div>

              {/* Content */}
              <h4 className="text-sm font-black uppercase tracking-tight mb-2">
                {rec.title}
              </h4>
              <p className="text-xs leading-relaxed font-mono">
                {rec.description}
              </p>
            </div>
          );
        })}

        {recommendations.length === 0 && (
          <div className="text-center py-8 border-[3px] border-dashed border-gray-300 dark:border-zinc-700">
            <div className="text-gray-500 text-sm font-mono uppercase">NO RECOMMENDATIONS</div>
            <div className="text-gray-400 text-xs mt-1 font-mono">SITE APPEARS OPTIMIZED</div>
          </div>
        )}
      </div>
    </div>
  );
};

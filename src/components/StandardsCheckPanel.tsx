import React from 'react';
import { StandardsCheckItem } from '../types';

interface StandardsCheckPanelProps {
  items: StandardsCheckItem[];
}

const getStatusStyles = (status: StandardsCheckItem['status']) => {
  switch (status) {
    case 'pass':
      return 'text-green-400 bg-green-500/10 border-green-500/30';
    case 'partial':
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    case 'fail':
      return 'text-red-400 bg-red-500/10 border-red-500/30';
    default:
      return 'text-zinc-400 bg-zinc-800/50 border-zinc-700';
  }
};

export const StandardsCheckPanel: React.FC<StandardsCheckPanelProps> = ({ items }) => {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
      <div className="text-xs text-zinc-600 uppercase tracking-wider mb-4">
        Standards Check
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.criterion}-${index}`}
            className="border border-zinc-800 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-zinc-200">
                {item.criterion}
              </div>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border ${getStatusStyles(item.status)}`}
              >
                {item.status}
              </span>
            </div>
            <div className="text-xs text-zinc-400 leading-relaxed">
              {item.evidence}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-xs text-zinc-500">No standards check results available.</div>
        )}
      </div>
    </div>
  );
};

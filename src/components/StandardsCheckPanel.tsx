import React from 'react';
import { StandardsCheckItem } from '../types';

interface StandardsCheckPanelProps {
  items: StandardsCheckItem[];
}

const getStatusStyles = (status: StandardsCheckItem['status']) => {
  switch (status) {
    case 'pass':
      return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-600 dark:border-green-400';
    case 'partial':
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border-yellow-600 dark:border-yellow-400';
    case 'fail':
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-600 dark:border-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-zinc-900 border-gray-400 dark:border-zinc-700';
  }
};

export const StandardsCheckPanel: React.FC<StandardsCheckPanelProps> = ({ items }) => {
  return (
    <div className="border-[3px] border-black dark:border-white bg-white dark:bg-black p-6 transition-colors duration-300">
      <div className="text-xs font-bold uppercase tracking-widest mb-4 text-gray-500">
        STANDARDS CHECK
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.criterion}-${index}`}
            className="border-[2px] border-gray-300 dark:border-zinc-800 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold uppercase">
                {item.criterion}
              </div>
              <span
                className={`text-[10px] font-mono font-black uppercase tracking-wider px-2 py-1 border-[2px] ${getStatusStyles(item.status)}`}
              >
                {item.status}
              </span>
            </div>
            <div className="text-xs leading-relaxed font-mono text-gray-600 dark:text-gray-400">
              {item.evidence}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-xs text-gray-500 font-mono italic">No evidence provided</div>
        )}
      </div>
    </div>
  );
};

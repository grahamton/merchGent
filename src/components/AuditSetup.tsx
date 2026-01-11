import React from 'react';
import { AuditMode, isModeEnabled } from '../types';

interface AuditSetupProps {
  url: string;
  auditMode: AuditMode;
  status: string;
  onUrlChange: (url: string) => void;
  onModeChange: (mode: AuditMode) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const AuditSetup: React.FC<AuditSetupProps> = ({
  url,
  auditMode,
  status,
  onUrlChange,
  onModeChange,
  onSubmit
}) => {
  const getModeDescription = (mode: AuditMode) => {
    switch (mode) {
      case AuditMode.HYBRID:
        return 'Is this site accidentally serving two masters?';
      case AuditMode.KNOWLEDGE:
        return 'Can customers find, trust, and understand product knowledge?';
      case AuditMode.LOGGED_IN:
        return 'Does account state change the experience in harmful ways?';
      case AuditMode.COHERENCE:
        return 'Do navigation, PDPs, and CTAs tell a consistent story?';
      case AuditMode.READINESS:
        return 'Is this site ready for agent-led commerce?';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Mode Selector */}
        <div className="mb-8">
          <h2 className="text-sm text-zinc-500 uppercase tracking-wider mb-4">
            Select Audit Mode
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(AuditMode).map((mode) => {
              const isEnabled = isModeEnabled(mode);
              const isSelected = auditMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => isEnabled && onModeChange(mode)}
                  disabled={!isEnabled}
                  className={`p-5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-500/30'
                      : isEnabled
                        ? 'bg-zinc-900 border-zinc-800 hover:border-blue-500/50 cursor-pointer'
                        : 'bg-zinc-900/50 border-zinc-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-sm font-bold text-zinc-200">{mode}</div>
                    {!isEnabled && (
                      <div className="text-[10px] bg-zinc-800 text-zinc-600 px-2 py-0.5 rounded uppercase tracking-wider">
                        Soon
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {getModeDescription(mode)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* URL Input */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8">
          <form onSubmit={onSubmit} className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-zinc-200 mb-2">
              Initialize {auditMode}
            </h2>
            <p className="text-zinc-500 mb-6 text-sm">
              {getModeDescription(auditMode)}
            </p>

            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="url"
                placeholder="https://example-commerce-site.com"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                required
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <button
                type="submit"
                disabled={status === 'scraping' || status === 'analyzing'}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors shadow-lg flex items-center justify-center min-w-[160px]"
              >
                {status === 'scraping' && 'Deploying...'}
                {status === 'analyzing' && 'Analyzing...'}
                {status !== 'scraping' && status !== 'analyzing' && 'Run Audit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

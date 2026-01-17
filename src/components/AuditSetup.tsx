import React from 'react';
import { AuditMode } from '../types';

interface AuditSetupProps {
  url: string;
  status: string;
  onUrlChange: (url: string) => void;
  onModeChange: (mode: AuditMode) => void;
  onSubmit: (e: React.FormEvent) => void;
  onThemeToggle: () => void;
}

export const AuditSetup: React.FC<AuditSetupProps> = ({
  url,
  status,
  onUrlChange,
  onModeChange,
  onSubmit,
  onThemeToggle
}) => {

  return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center p-4 font-sans text-black dark:text-white transition-colors duration-300">

      {/* Brutalist Hero Block */}
      <div className="w-full max-w-4xl text-center space-y-8">

        <div className="border-[3px] border-black dark:border-white p-8 bg-white dark:bg-black transition-colors duration-300">
            <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter mb-2">
                MERCH GENT
            </h1>
            <div className="bg-black text-white dark:bg-white dark:text-black inline-block px-4 py-1 text-sm font-bold uppercase tracking-widest mb-12">
                PROTOCOL V2.0 // SELECT PROTOCOL
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit(e);
                }}
                className="flex flex-col gap-6"
            >
                {/* 1. URL ENTRY */}
                <div className="w-full">
                    <label htmlFor="target-url" className="block text-left text-xs font-bold uppercase tracking-widest mb-1 text-gray-500">Target Endpoint</label>
                    <input
                        id="target-url"
                        type="url"
                        placeholder="HTTPS://TARGET-SITE.COM"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        required
                        className="w-full px-6 py-6 bg-transparent text-xl md:text-3xl font-mono font-bold outline-none border-2 border-black dark:border-white placeholder-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors uppercase"
                    />
                </div>

                {/* Hidden for now - unified audit covers all modes */}
                {/* Mode selection can be re-enabled later if needed */}

                {/* START BUTTON */}
                <button
                    type="submit"
                    disabled={!url || status !== 'idle'}
                    aria-live="polite"
                    className="w-full py-6 bg-black text-white dark:bg-white dark:text-black border-2 border-black dark:border-white font-black text-2xl uppercase tracking-wider hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed mt-6"
                >
                    {status === 'idle' ? '→ RUN AUDIT' : 'PROCESSING...'}
                </button>
            </form>
        </div>

        {/* Minimal Footer */}
        <div className="text-xs font-mono text-gray-400 uppercase tracking-wider flex justify-between w-full px-1 items-center">
            <span>System: READY</span>
            <button
                onClick={onThemeToggle}
                className="hover:text-black dark:hover:text-white underline decoration-dotted underline-offset-4"
            >
                [INVERT VISUALS]
            </button>
            <span>SECURE CONNECTION</span>
        </div>
      </div>
    </div>
  );
};

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

            <div className="flex flex-col gap-6">
                {/* 1. URL ENTRY */}
                <div className="w-full">
                    <label className="block text-left text-xs font-bold uppercase tracking-widest mb-1 text-gray-500">Target Endpoint</label>
                    <input
                        type="url"
                        placeholder="HTTPS://TARGET-SITE.COM"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="w-full px-6 py-6 bg-transparent text-xl md:text-3xl font-mono font-bold outline-none border-2 border-black dark:border-white placeholder-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors uppercase"
                    />
                </div>

                {/* 2. MODE SELECTION (THE LAUNCHER) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

                    {/* OPTION A: PRODUCT */}
                    <button
                        onClick={() => onModeChange(AuditMode.KNOWLEDGE)}
                        className="group border-2 border-black dark:border-white p-8 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all text-left relative overflow-hidden"
                    >
                        <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 text-6xl font-black transition-opacity">01</div>
                        <h3 className="text-2xl font-black uppercase mb-2 group-hover:translate-x-2 transition-transform">Product Audit</h3>
                        <p className="font-mono text-xs max-w-[80%] leading-relaxed opacity-60 group-hover:opacity-100">
                            Analyze PDP content, visual hierarchy, and persuasion signals.
                        </p>
                    </button>

                    {/* OPTION B: CHECKOUT */}
                    <button
                        onClick={() => onModeChange(AuditMode.TRANSACTION)}
                        className="group border-2 border-black dark:border-white p-8 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all text-left relative overflow-hidden"
                    >
                        <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 text-6xl font-black transition-opacity">02</div>
                        <h3 className="text-2xl font-black uppercase mb-2 group-hover:translate-x-2 transition-transform">Checkout Audit</h3>
                        <p className="font-mono text-xs max-w-[80%] leading-relaxed opacity-60 group-hover:opacity-100">
                            Identify friction, hidden fees, and guest checkout blockers.
                        </p>
                    </button>

                </div>

                {/* 3. START BUTTON */}
                <button
                    onClick={onSubmit}
                    disabled={!url || status !== 'idle'}
                    className="w-full py-6 bg-black text-white dark:bg-white dark:text-black border-2 border-black dark:border-white font-black text-2xl uppercase tracking-wider hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    {status === 'idle' ? '→ EXECUTE AUDIT' : 'PROCESSING...'}
                </button>
            </div>
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

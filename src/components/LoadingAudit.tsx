import { Globe, Brain, CheckCircle2 } from "lucide-react";
import { AgentStatus } from "../types";

interface LoadingAuditProps {
  url: string;
  mode: string;
  status: AgentStatus;
}

export function LoadingAudit({ url, mode, status }: LoadingAuditProps) {
  const steps = [
    {
      key: AgentStatus.SCRAPING,
      agent: "Web Agent",
      action: "Scraping public pages",
      icon: Globe,
    },
    {
      key: AgentStatus.ANALYZING,
      agent: "Merch Agent",
      action: "Analyzing extracted signals",
      icon: Brain,
    },
  ];

  const isAnalyzing = status === AgentStatus.ANALYZING;
  const isScraping = status === AgentStatus.SCRAPING;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-1 h-8 bg-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight">merchGent</h1>
          </div>
          <p className="text-zinc-400 font-mono text-sm">
            {isScraping ? "Scraping target site..." : "Analyzing signals..."}
          </p>
        </div>

        {/* Loading Card */}
        <div className="border border-zinc-800 bg-zinc-900/50 p-8 rounded-xl">
          {/* URL */}
          <div className="mb-6 pb-6 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 font-mono mb-2 uppercase tracking-wider">Target</div>
            <div className="text-sm text-zinc-100 font-mono break-all bg-zinc-950 p-3 rounded border border-zinc-800 text-blue-400">
              {url}
            </div>
            <div className="text-xs text-zinc-500 font-mono mt-2">
              Mode: <span className="text-purple-400">{mode.toUpperCase()}</span>
            </div>
          </div>

          {/* Live Steps */}
          <div className="border-t border-zinc-800 pt-4">
            <div className="text-xs font-mono text-zinc-500 mb-3 uppercase tracking-wider">Audit Log</div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {steps.map((step) => {
                const StepIcon = step.icon;
                const isActive = step.key === status;
                const isDone = isAnalyzing && step.key === AgentStatus.SCRAPING;

                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 text-xs font-mono p-2 rounded ${
                      isActive ? "bg-zinc-800/50 text-zinc-200" : "text-zinc-600"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3 h-3 text-blue-500" />
                    ) : (
                      <StepIcon className="w-3 h-3 text-blue-500" />
                    )}
                    <span>[{step.agent}] {step.action}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

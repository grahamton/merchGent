import { useEffect, useState } from "react";
import { Activity, Globe, Brain, Database, CheckCircle2 } from "lucide-react";
import { Progress } from "./ui/progress";

interface LoadingAuditProps {
  url: string;
  mode: string;
  onComplete?: () => void;
}

export function LoadingAudit({ url, mode, onComplete }: LoadingAuditProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { agent: "Client Agent", action: "Initializing audit framework...", icon: Activity },
    { agent: "Web Agent", action: "Crawling public pages...", icon: Globe },
    { agent: "Web Agent", action: "Extracting commerce signals...", icon: Globe },
    { agent: "Merch Agent", action: "Analyzing intent patterns...", icon: Brain },
    { agent: "Merch Agent", action: "Detecting hybrid traps...", icon: Brain },
    { agent: "Data Agent", action: "Validating data standards...", icon: Database },
    { agent: "Client Agent", action: "Synthesizing findings...", icon: Activity },
    { agent: "Client Agent", action: "Generating report...", icon: CheckCircle2 },
  ];

  useEffect(() => {
    // Faster animation for demo feel, but we can sync with real status
    const stepDuration = 500;
    const totalDuration = steps.length * stepDuration;

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 / (totalDuration / 50));
        return next >= 100 ? 100 : next;
      });
    }, 50);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(stepInterval);
          if (onComplete) onComplete();
          return prev;
        }
        return prev + 1;
      });
    }, stepDuration);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [steps.length, onComplete]);

  const CurrentIcon = steps[currentStep].icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-1 h-8 bg-blue-500" />
            <h1 className="text-3xl font-bold tracking-tight">merchGent</h1>
          </div>
          <p className="text-zinc-400 font-mono text-sm">Running Audit...</p>
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

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-zinc-400">Progress</span>
              <span className="text-xs font-mono text-zinc-400">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Current Step */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 animate-pulse">
              <CurrentIcon className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-mono text-blue-400 mb-1 font-bold">
                [{steps[currentStep].agent}]
              </div>
              <div className="text-sm font-mono text-zinc-300">{steps[currentStep].action}</div>
            </div>
          </div>

          {/* Step History */}
          <div className="border-t border-zinc-800 pt-4">
            <div className="text-xs font-mono text-zinc-500 mb-3 uppercase tracking-wider">Audit Log</div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {steps.slice(0, currentStep + 1).reverse().map((step, index) => {
                const StepIcon = step.icon;
                const isLatest = index === 0;
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 text-xs font-mono p-2 rounded ${
                      isLatest ? "bg-zinc-800/50 text-zinc-200" : "text-zinc-600"
                    }`}
                  >
                    <CheckCircle2 className={`w-3 h-3 ${isLatest ? "text-blue-500" : "text-zinc-700"}`} />
                    <span>{step.action}</span>
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

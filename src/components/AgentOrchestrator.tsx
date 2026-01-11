import { useState } from "react";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import {
  Upload,
  Shield,
  Settings,
  Activity,
  FileText,
  Globe,
  Database,
  Brain,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "./ui/utils";

interface AgentOrchestratorProps {
  onBack: () => void;
}

export function AgentOrchestrator({ onBack }: AgentOrchestratorProps) {
  const [agentSettings, setAgentSettings] = useState({
    merchAgent: {
      validationOnly: true,
      enabled: true,
    },
    webAgent: {
      publicOnly: true,
      authPages: false,
      enabled: true,
    },
    dataAgent: {
      heuristicSampling: true,
      sampleLimit: 5,
      enabled: true,
    },
  });

  const [signals, setSignals] = useState({
    b2b: 7,
    b2c: 12,
  });

  const [signalLog, setSignalLog] = useState([
    {
      timestamp: "14:32:18.234",
      type: "b2b",
      signal: "Detected 'Request Quote' CTA",
      source: "Web Agent",
    },
    {
      timestamp: "14:32:18.456",
      type: "b2c",
      signal: "Found lifestyle imagery on product page",
      source: "Web Agent",
    },
    {
      timestamp: "14:32:19.123",
      type: "b2b",
      signal: "Bulk ordering table present",
      source: "Web Agent",
    },
    {
      timestamp: "14:32:19.567",
      type: "b2c",
      signal: "Emotional product descriptions detected",
      source: "Merch Agent",
    },
    {
      timestamp: "14:32:20.012",
      type: "b2b",
      signal: "Net 30 payment terms visible",
      source: "Data Agent",
    },
    {
      timestamp: "14:32:20.234",
      type: "b2c",
      signal: "'Add to Cart' primary CTA",
      source: "Web Agent",
    },
  ]);

  const toggleAgentSetting = (
    agent: keyof typeof agentSettings,
    setting: string,
    value: boolean
  ) => {
    setAgentSettings((prev) => ({
      ...prev,
      [agent]: {
        ...prev[agent],
        [setting]: value,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-8 py-4">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={onBack}
              variant="ghost"
              size="sm"
              className="font-mono text-zinc-400 hover:text-zinc-100"
            >
              ← Back to Dashboard
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-orange-500" />
              <span className="font-mono text-sm text-zinc-400">Agent Orchestrator</span>
            </div>
          </div>
          <Badge className="bg-orange-500/10 text-orange-500 font-mono text-xs">
            ADMIN MODE
          </Badge>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-8">
        <Tabs defaultValue="governance" className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 font-mono">
            <TabsTrigger value="governance" className="font-mono">
              <FileText className="w-4 h-4 mr-2" />
              Governance Ingestion
            </TabsTrigger>
            <TabsTrigger value="boundaries" className="font-mono">
              <Shield className="w-4 h-4 mr-2" />
              Agent Boundaries
            </TabsTrigger>
            <TabsTrigger value="signals" className="font-mono">
              <Activity className="w-4 h-4 mr-2" />
              Signal Processor
            </TabsTrigger>
          </TabsList>

          {/* Governance Ingestion Engine */}
          <TabsContent value="governance" className="mt-6">
            <div className="grid grid-cols-2 gap-6">
              {/* File Loader */}
              <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                <h3 className="font-mono text-sm text-zinc-100 mb-4 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  File Loader
                </h3>
                <p className="text-xs text-zinc-500 font-mono mb-6">
                  Upload governance documents and prompt definitions
                </p>
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-zinc-700 rounded p-8 text-center hover:border-zinc-600 transition-colors cursor-pointer">
                    <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <div className="text-sm font-mono text-zinc-400 mb-1">PROMPTS.md</div>
                    <div className="text-xs text-zinc-600 font-mono">
                      Click to upload or drag and drop
                    </div>
                  </div>
                  <div className="border-2 border-dashed border-zinc-700 rounded p-8 text-center hover:border-zinc-600 transition-colors cursor-pointer">
                    <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <div className="text-sm font-mono text-zinc-400 mb-1">AGENTS.md</div>
                    <div className="text-xs text-zinc-600 font-mono">
                      Click to upload or drag and drop
                    </div>
                  </div>
                </div>
                <Button className="w-full mt-6 bg-zinc-800 hover:bg-zinc-700 font-mono text-white">
                  Upload Files
                </Button>
              </Card>

              {/* Authority Manager */}
              <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                <h3 className="font-mono text-sm text-zinc-100 mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Authority Manager
                </h3>
                <p className="text-xs text-zinc-500 font-mono mb-6">
                  Map standards to agent domains
                </p>
                <div className="space-y-4">
                  {/* Baymard Institute */}
                  <div className="border border-zinc-800 p-4 bg-zinc-950">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-mono text-zinc-100">Baymard Institute</div>
                      <Badge className="bg-blue-500/10 text-blue-500 text-xs font-mono">
                        UX
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Search Precision</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Efficiency vs Discovery</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                    </div>
                  </div>

                  {/* GS1 */}
                  <div className="border border-zinc-800 p-4 bg-zinc-950">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-mono text-zinc-100">GS1</div>
                      <Badge className="bg-purple-500/10 text-purple-500 text-xs font-mono">
                        DATA
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Attribute Normalization</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Product Classification</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                    </div>
                  </div>

                  {/* CIPS */}
                  <div className="border border-zinc-800 p-4 bg-zinc-950">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-mono text-zinc-100">CIPS</div>
                      <Badge className="bg-orange-500/10 text-orange-500 text-xs font-mono">
                        PROCUREMENT
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">PO Number Support</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Payment Terms</span>
                        <span className="text-green-500">MAPPED</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Agent Boundary Controller */}
          <TabsContent value="boundaries" className="mt-6">
            <div className="grid grid-cols-3 gap-6">
              {/* Merch Agent (Agent M) */}
              <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm text-zinc-100 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-500" />
                    Merch Agent
                  </h3>
                  <Switch
                    checked={agentSettings.merchAgent.enabled}
                    onCheckedChange={(checked) =>
                      toggleAgentSetting("merchAgent", "enabled", checked)
                    }
                  />
                </div>
                <p className="text-xs text-zinc-500 font-mono mb-6">Merchandising Doctor</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono text-zinc-400">
                      Validation & Analysis Only
                    </Label>
                    <Switch
                      checked={agentSettings.merchAgent.validationOnly}
                      onCheckedChange={(checked) =>
                        toggleAgentSetting("merchAgent", "validationOnly", checked)
                      }
                    />
                  </div>
                  <div className="pt-4 border-t border-zinc-800">
                    <div className="text-xs font-mono text-zinc-500 mb-2">Mandate Scope</div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-zinc-400">✓ Intent detection</div>
                      <div className="text-xs font-mono text-zinc-400">✓ Hybrid trap diagnosis</div>
                      <div className="text-xs font-mono text-zinc-400">
                        ✓ UX coherence analysis
                      </div>
                      <div className="text-xs font-mono text-red-500">✗ Crawling</div>
                      <div className="text-xs font-mono text-red-500">✗ Transaction validation</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Web Agent */}
              <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm text-zinc-100 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Web Agent
                  </h3>
                  <Switch
                    checked={agentSettings.webAgent.enabled}
                    onCheckedChange={(checked) => toggleAgentSetting("webAgent", "enabled", checked)}
                  />
                </div>
                <p className="text-xs text-zinc-500 font-mono mb-6">Surface Inspector</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono text-zinc-400">
                      Public Pages Only (Phase 1)
                    </Label>
                    <Switch
                      checked={agentSettings.webAgent.publicOnly}
                      onCheckedChange={(checked) =>
                        toggleAgentSetting("webAgent", "publicOnly", checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between opacity-50">
                    <Label className="text-xs font-mono text-zinc-600">
                      Enable Auth Pages (Phase 2)
                    </Label>
                    <Switch disabled checked={agentSettings.webAgent.authPages} />
                  </div>
                  <div className="pt-4 border-t border-zinc-800">
                    <div className="text-xs font-mono text-zinc-500 mb-2">Mandate Scope</div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-zinc-400">✓ Public crawling</div>
                      <div className="text-xs font-mono text-zinc-400">✓ Screen rendering</div>
                      <div className="text-xs font-mono text-zinc-400">✓ Signal extraction</div>
                      <div className="text-xs font-mono text-red-500">✗ Recommendations</div>
                      <div className="text-xs font-mono text-red-500">✗ Intent interpretation</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Data Agent */}
              <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm text-zinc-100 flex items-center gap-2">
                    <Database className="w-4 h-4 text-green-500" />
                    Data Agent
                  </h3>
                  <Switch
                    checked={agentSettings.dataAgent.enabled}
                    onCheckedChange={(checked) => toggleAgentSetting("dataAgent", "enabled", checked)}
                  />
                </div>
                <p className="text-xs text-zinc-500 font-mono mb-6">Trust Inspector</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono text-zinc-400">
                      Heuristic Sampling
                    </Label>
                    <Switch
                      checked={agentSettings.dataAgent.heuristicSampling}
                      onCheckedChange={(checked) =>
                        toggleAgentSetting("dataAgent", "heuristicSampling", checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono text-zinc-400">Sample Limit</Label>
                    <div className="text-xs font-mono text-zinc-100">
                      {agentSettings.dataAgent.sampleLimit} products
                    </div>
                  </div>
                  <div className="pt-4 border-t border-zinc-800">
                    <div className="text-xs font-mono text-zinc-500 mb-2">Mandate Scope</div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-zinc-400">✓ State comparison</div>
                      <div className="text-xs font-mono text-zinc-400">✓ Trust gap detection</div>
                      <div className="text-xs font-mono text-zinc-400">
                        ✓ Transaction readiness
                      </div>
                      <div className="text-xs font-mono text-red-500">✗ Merch judgments</div>
                      <div className="text-xs font-mono text-red-500">✗ Content critique</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Signal Processor */}
          <TabsContent value="signals" className="mt-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Signal Counter */}
              <div className="col-span-4 space-y-6">
                <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                  <h3 className="font-mono text-sm text-zinc-100 mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Real-Time Signal Counter
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-mono text-zinc-400">B2B Signals</span>
                        </div>
                        <Badge className="bg-blue-500/10 text-blue-500 font-mono">{signals.b2b}</Badge>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${(signals.b2b / (signals.b2b + signals.b2c)) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-orange-500" />
                          <span className="text-sm font-mono text-zinc-400">B2C Signals</span>
                        </div>
                        <Badge className="bg-orange-500/10 text-orange-500 font-mono">
                          {signals.b2c}
                        </Badge>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 transition-all"
                          style={{ width: `${(signals.b2c / (signals.b2b + signals.b2c)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="bg-zinc-900/50 border-zinc-800 p-6">
                  <h3 className="font-mono text-sm text-zinc-100 mb-4">Input Stream</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-mono text-zinc-500 mb-1">pageData.url</div>
                      <div className="text-xs font-mono text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800">
                        https://example.com/products
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-zinc-500 mb-1">pageData.title</div>
                      <div className="text-xs font-mono text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800">
                        Product Catalog - Industrial Supplies
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-zinc-500 mb-1">viewportWidth</div>
                      <div className="text-xs font-mono text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800">
                        1920px
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Live Log */}
              <div className="col-span-8">
                <Card className="bg-zinc-900/50 border-zinc-800 p-6 h-full">
                  <h3 className="font-mono text-sm text-zinc-100 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Live Signal Log
                  </h3>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2 font-mono text-xs">
                      {signalLog.map((log, index) => (
                        <div
                          key={index}
                          className={cn(
                            "p-3 rounded border",
                            log.type === "b2b"
                              ? "bg-blue-500/5 border-blue-500/20"
                              : "bg-orange-500/5 border-orange-500/20"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-500">{log.timestamp}</span>
                            <Badge
                              className={cn(
                                "text-xs font-mono",
                                log.type === "b2b"
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-orange-500/10 text-orange-500"
                              )}
                            >
                              {log.type.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-zinc-300 mb-1">{log.signal}</div>
                          <div className="text-zinc-500 text-xs">Source: {log.source}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

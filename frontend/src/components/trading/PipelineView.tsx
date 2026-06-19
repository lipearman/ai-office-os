"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { wsManager } from "@/hooks/useWebSocket";
import { useWorkspaceStore } from "@/store/workspace";

interface NodeDef {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
}

interface StepInfo {
  node_id: string;
  label?: string;
  coin?: string;
  coin_index?: number;
  status: string;
  ts: number;
  report?: string;
}

interface PipelineRun {
  run_status: string;
  steps: StepInfo[];
  updated_at: string;
}

interface PipelineData {
  nodes: NodeDef[];
  edges: { from: string; to: string }[];
  llm_available: boolean;
  run?: PipelineRun | null;
}

export function PipelineView() {
  const { current } = useWorkspaceStore();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [runStatus, setRunStatus] = useState<string>("idle");
  const [triggering, setTriggering] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const onConnected = () => setWsConnected(true);
    const onDisconnected = () => setWsConnected(false);
    wsManager.on("ws.connected", onConnected);
    wsManager.on("ws.disconnected", onDisconnected);
    return () => {
      wsManager.off("ws.connected", onConnected);
      wsManager.off("ws.disconnected", onDisconnected);
    };
  }, []);
  const runStatusRef = useRef(runStatus);

  const fetchPipeline = useCallback(async () => {
    try {
      const params: any = {};
      if (current) params.workspace_id = current.id;
      const r = await api.get("/trading/desk/pipeline", { params });
      setData(r.data);
      if (r.data.run) {
        setSteps(r.data.run.steps || []);
        setRunStatus(r.data.run.run_status);
        runStatusRef.current = r.data.run.run_status;
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  useEffect(() => {
    if (!current) return;

    const onStep = (e: any) => {
      const step = e.step as StepInfo | undefined;
      if (!step) return;
      const newStatus = e.run_status || "running";
      if (step.node_id === "__complete__") {
        setRunStatus(newStatus);
        runStatusRef.current = newStatus;
        return;
      }
      const stepKey = step.label || step.node_id;
      setSteps((prev) => {
        if (runStatusRef.current !== "running" && newStatus === "running") {
          return [{ ...step! }];
        }
        const idx = prev.findIndex((s) => (s.label || s.node_id) === stepKey);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...step! };
          return next;
        }
        return [...prev, { ...step! }];
      });
      setRunStatus(newStatus);
      runStatusRef.current = newStatus;
    };

    wsManager.on("desk.pipeline_step", onStep);
    return () => { wsManager.off("desk.pipeline_step", onStep); };
  }, [current]);

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-white/5" />;
  if (!data) return <p className="text-xs text-white/30">Pipeline info unavailable</p>;

  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  const isRunning = runStatus === "running";
  /** latest step per node_id (for the graph) */
  const latestByNode = new Map<string, StepInfo>();
  for (const s of steps) {
    latestByNode.set(s.node_id, s);
  }

  return (
    <div className={cn(
      "space-y-4 transition-all duration-700",
      isRunning && "bg-amber-500/[0.04] shadow-[0_0_35px_-10px_rgba(251,191,36,0.25)]",
      runStatus === "completed" && "bg-emerald-500/[0.02]",
      runStatus === "error" && "bg-red-500/[0.02]",
    )}>
      {/* header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/70">Multi-Agent Pipeline</span>
        {isRunning && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-px text-[10px] font-semibold text-amber-300">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Running
          </span>
        )}
        {runStatus === "completed" && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-px text-[10px] font-semibold text-emerald-300">Completed</span>
        )}
        {runStatus === "error" && (
          <span className="rounded-full bg-red-500/20 px-2 py-px text-[10px] font-semibold text-red-300">Error</span>
        )}
        <div className="flex-1" />
        <button
          onClick={async () => {
            if (!current || isRunning || triggering) return;
            setTriggering(true);
            try {
              await api.post(`/trading/desk/pipeline/trigger?workspace_id=${current.id}`);
              setSteps([]);
              setRunStatus("running");
              runStatusRef.current = "running";
            } catch {
              /* ignore */
            } finally {
              setTriggering(false);
            }
          }}
          disabled={isRunning || triggering}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[10px] text-white/60 transition hover:bg-white/10 disabled:opacity-30"
        >
          {triggering ? "Triggering..." : isRunning ? "Running..." : "Run Pipeline"}
        </button>
        {data.llm_available && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-px text-[10px] font-semibold text-emerald-300">LLM Active</span>
        )}
        <span className={cn(
          "rounded-full px-2 py-px text-[9px] font-semibold transition-colors",
          wsConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
        )}>
          WS {wsConnected ? "●" : "○"}
        </span>
      </div>

      {/* workflow graph (responsive wrapping) */}
      {data.nodes.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-0 gap-y-2 pb-1">
          {data.nodes.map((node, i) => {
            const step = latestByNode.get(node.id);
            const status = step?.status || "pending";
            const coin = step?.coin || "";
            return (
              <div key={node.id} className="flex items-center gap-0">
                {i > 0 && (
                  <div className="flex items-center justify-center shrink-0 px-0.5 sm:px-1">
                    <svg width="20" height="16" viewBox="0 0 28 20" fill="none" className="text-white/15">
                      <path d="M2 10h20M17 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <button
                  onClick={() => setExpandedStep(expandedStep === node.id ? null : node.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-all sm:gap-2 sm:px-3 sm:py-2 sm:text-xs",
                    status === "running" && "border-amber-500/40 bg-amber-500/10",
                    status === "completed" && "border-emerald-500/30 bg-emerald-500/8",
                    status === "error" && "border-red-500/30 bg-red-500/10",
                    status === "pending" && "border-white/10 bg-white/[0.02]",
                    expandedStep === node.id && "ring-1 ring-white/20",
                  )}
                >
                  <span className="text-base leading-none sm:text-lg">{node.emoji}</span>
                  <div className="text-left leading-tight">
                    <div className="font-semibold text-white/80">{node.name}</div>
                    <div className={cn(
                      "text-[8px] sm:text-[9px]",
                      coin ? "text-white/50" : status === "running" ? "text-amber-300/60" : "text-white/30",
                    )}>
                      {coin || status}
                    </div>
                  </div>
                  <span className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2",
                    status === "running" && "bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.6)]",
                    status === "completed" && "bg-emerald-400",
                    status === "error" && "bg-red-400",
                    status === "pending" && "bg-white/15",
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* messages area */}
      {steps.length === 0 && !isRunning && (
        <p className="text-[11px] text-white/30">Waiting for pipeline run...</p>
      )}

      {steps.length > 0 && (
        <div className="flex max-h-[320px] flex-col gap-y-1.5 overflow-y-auto">
          {[...steps].reverse().map((s) => {
            const node = nodeMap.get(s.node_id);
            const isGroupStart = s.node_id === "monitor" || (s.node_id === "summary") || (s.coin_index !== undefined && s.node_id === "news");
            const isSummary = s.node_id === "summary";
            const ts = s.ts ? new Date(s.ts * 1000) : null;
            const timeStr = ts ? ts.toLocaleString("th-TH", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
            return (
              <div key={`${s.label || s.node_id}_${s.coin_index ?? 0}_${s.ts || 0}`} className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]",
                isSummary ? "border border-emerald-500/20 bg-emerald-500/[0.03]" : "border border-white/5 bg-white/[0.02]",
                isGroupStart && !isSummary && "mt-0",
              )}>
                <span className="shrink-0 whitespace-nowrap text-[9px] text-white/30 tabular-nums mt-0.5">{timeStr}</span>
                <span className={cn(
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                  s.status === "completed" ? "bg-emerald-400" : s.status === "running" ? "bg-amber-400 animate-pulse" : "bg-white/20",
                )} />
                <span className="shrink-0 text-sm leading-none">{node?.emoji || "▸"}</span>
                {s.coin && (
                  <span className="shrink-0 rounded bg-white/10 px-1 py-px text-[10px] font-semibold text-white/70">{s.coin}</span>
                )}
                <div className="min-w-0 flex-1 leading-relaxed text-white/60">
                  <span className={cn(
                    "font-semibold",
                    isSummary ? "text-emerald-300" : "text-white/70",
                  )}>{node?.name || s.node_id}</span>
                  {s.report && <span className="ml-1.5">{s.report}</span>}
                  {!s.report && s.status === "completed" && <span className="ml-1.5 text-white/30">✓ done</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* expanded step detail */}
      {expandedStep && (() => {
        const node = nodeMap.get(expandedStep);
        if (!node) return null;
        const step = latestByNode.get(expandedStep);
        return (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-[11px]">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">{node.emoji}</span>
              <span className="font-semibold text-white/80">{node.name}</span>
              {step && (
                <span className={cn(
                  "ml-auto rounded px-1.5 py-px text-[9px] font-semibold",
                  step.status === "completed" && "bg-emerald-500/20 text-emerald-300",
                  step.status === "running" && "bg-amber-500/20 text-amber-300",
                  step.status === "error" && "bg-red-500/20 text-red-300",
                )}>{step.status}</span>
              )}
            </div>
            <p className="text-white/50">{node.description}</p>
            {step?.report && (
              <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-white/70">
                {step.report}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { Play, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolDef {
  name: string; label: string; description: string; category: string;
  params: Record<string, { type: string; required?: boolean }>;
  requires_approval: boolean; icon: string;
}

const CAT_COLOR: Record<string, string> = {
  data: "#8b5cf6", web: "#3b82f6", automation: "#f59e0b",
  dev: "#10b981", util: "#6366f1",
};

export default function ToolsPage() {
  const { current } = useWorkspaceStore();
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [paramVals, setParamVals] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.get("/tools").then((r) => setTools(r.data.tools)).catch(() => {});
  }, []);

  const loadLogs = () => {
    if (!current) return;
    api.get(`/tools/logs/workspace/${current.id}`).then((r) => setLogs(r.data.logs)).catch(() => {});
  };
  useEffect(loadLogs, [current]);

  const runTool = async (tool: ToolDef, approved = false) => {
    if (!current) return;
    setRunning(true); setResult(null);
    try {
      const params: Record<string, any> = {};
      for (const [k, spec] of Object.entries(tool.params)) {
        const v = paramVals[`${tool.name}.${k}`];
        if (v === undefined || v === "") continue;
        params[k] = spec.type === "object" ? safeJson(v) : v;
      }
      const { data } = await api.post("/tools/run", {
        workspace_id: current.id, tool_name: tool.name, params, approved,
      });
      setResult({ tool: tool.name, ...data });
      loadLogs();
    } catch (e: any) {
      setResult({ error: e.response?.data?.detail || "Failed" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">🔧 Tools</h1>
        <p className="text-white/40 text-sm mt-1">รัน tools / เชื่อม external services — {tools.length} tools</p>
      </div>

      <div className="grid gap-3">
        {tools.map((t) => {
          const isOpen = open === t.name;
          const color = CAT_COLOR[t.category] ?? "#6366f1";
          return (
            <div key={t.name} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : t.name)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/3"
              >
                <span className="text-xl">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{t.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: color + "22", color }}>{t.category}</span>
                    {t.requires_approval && (
                      <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                        <ShieldAlert size={11} /> approval
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 truncate">{t.description}</p>
                </div>
                {isOpen ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
              </button>

              {isOpen && (
                <div className="border-t border-white/8 p-4 space-y-3">
                  {Object.keys(t.params).length === 0 && (
                    <p className="text-xs text-white/30">ไม่มี parameter</p>
                  )}
                  {Object.entries(t.params).map(([k, spec]) => (
                    <div key={k}>
                      <label className="text-xs text-white/50">
                        {k} <span className="text-white/25">({spec.type}{spec.required ? " *" : ""})</span>
                      </label>
                      <input
                        value={paramVals[`${t.name}.${k}`] ?? ""}
                        onChange={(e) => setParamVals((s) => ({ ...s, [`${t.name}.${k}`]: e.target.value }))}
                        placeholder={spec.type === "object" ? '{"key":"value"}' : ""}
                        className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white font-mono"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button size="sm" loading={running} onClick={() => runTool(t, false)} className="gap-1.5">
                      <Play size={13} /> Run
                    </Button>
                    {t.requires_approval && (
                      <Button size="sm" variant="danger" onClick={() => runTool(t, true)}>
                        Run (approved)
                      </Button>
                    )}
                  </div>
                  {result?.tool === t.name && (
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-green-300 whitespace-pre-wrap">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Logs */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white/70 mb-3">Recent Runs</h2>
        <div className="space-y-1.5">
          {logs.length === 0 && <p className="text-xs text-white/30">ยังไม่มีประวัติ</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/3 px-3 py-2 text-xs">
              <span className={cn("h-2 w-2 rounded-full shrink-0",
                l.status === "SUCCESS" ? "bg-green-400" : l.status === "PENDING_APPROVAL" ? "bg-yellow-400" : "bg-red-400")} />
              <span className="font-mono text-white/80">{l.tool_name}</span>
              <span className="text-white/30">{l.duration_ms?.toFixed(0)}ms</span>
              <span className="text-white/30 ml-auto">{new Date(l.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}

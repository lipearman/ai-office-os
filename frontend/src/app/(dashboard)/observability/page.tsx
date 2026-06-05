"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { Activity, Zap, AlertTriangle, Clock, Coins, Wrench } from "lucide-react";

export default function ObservabilityPage() {
  const { current } = useWorkspaceStore();
  const [sum, setSum] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);

  const load = () => {
    if (!current) return;
    api.get(`/observability/summary/workspace/${current.id}`).then(r => setSum(r.data)).catch(()=>{});
    api.get(`/observability/events/workspace/${current.id}`).then(r => setEvents(r.data.events)).catch(()=>{});
  };
  useEffect(load, [current]);
  useEffect(() => { const t = setInterval(load, 10000); return () => clearInterval(t); }, [current]);

  const t = sum?.totals ?? {};
  const series: any[] = sum?.token_series ?? [];
  const maxTok = Math.max(1, ...series.map((s) => s.tokens));

  const stats = [
    { label: "LLM Calls", value: t.calls ?? 0, icon: Activity, color: "#6366f1" },
    { label: "Total Tokens", value: (t.total_tokens ?? 0).toLocaleString(), icon: Coins, color: "#f59e0b" },
    { label: "Avg Latency", value: `${t.avg_latency_ms ?? 0}ms`, icon: Clock, color: "#10b981" },
    { label: "Errors", value: t.errors ?? 0, icon: AlertTriangle, color: "#ef4444" },
    { label: "Tool Runs", value: t.tool_runs ?? 0, icon: Wrench, color: "#8b5cf6" },
    { label: "Completion Tokens", value: (t.completion_tokens ?? 0).toLocaleString(), icon: Zap, color: "#ec4899" },
  ];

  return (
    <div className="animate-fade-in max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">📊 Observability</h1>
        <p className="text-white/40 text-sm mt-1">ติดตาม token, latency, errors — อัปเดตทุก 10 วินาที</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-white/5 bg-white/3 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">{label}</span>
              <div className="rounded-lg p-1.5" style={{ background: color + "1a" }}><Icon size={14} style={{ color }} /></div>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Token series chart */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-5 mb-6">
        <p className="text-sm font-semibold text-white/70 mb-4">Token Usage — 7 วันล่าสุด</p>
        <div className="flex items-end gap-2 h-40">
          {series.map((s) => (
            <div key={s.date} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full rounded-t bg-gradient-to-t from-primary-600 to-primary-400 transition-all"
                style={{ height: `${(s.tokens / maxTok) * 100}%`, minHeight: s.tokens ? 4 : 0 }}
                title={`${s.tokens} tokens`} />
              <span className="text-[9px] text-white/30">{s.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-agent */}
      {sum?.by_agent?.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-white/3 p-5 mb-6">
          <p className="text-sm font-semibold text-white/70 mb-3">Per Agent</p>
          <div className="space-y-1.5">
            {sum.by_agent.map((a: any) => (
              <div key={a.agent} className="flex items-center gap-3 text-xs">
                <span className="w-24 text-white/70 truncate">{a.agent}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-primary-500" style={{ width: `${(a.tokens / (sum.totals.total_tokens || 1)) * 100}%` }} />
                </div>
                <span className="text-white/40 w-16 text-right">{a.tokens.toLocaleString()} tok</span>
                <span className="text-white/30 w-14 text-right">{a.avg_latency}ms</span>
                <span className={a.errors ? "text-red-400 w-8 text-right" : "text-white/20 w-8 text-right"}>{a.errors} err</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent events */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-5">
        <p className="text-sm font-semibold text-white/70 mb-3">Recent Events</p>
        <div className="space-y-1">
          {events.length === 0 && <p className="text-xs text-white/30">ยังไม่มี event — ลองแชทกับ agent</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/3 px-3 py-2 text-xs">
              <span className={`h-2 w-2 rounded-full shrink-0 ${e.status === "success" ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-white/70 w-16">{e.kind}</span>
              <span className="text-white/50 flex-1 truncate">{e.agent ?? "—"} · {e.model}</span>
              <span className="text-amber-400/70 w-20 text-right">{e.total_tokens} tok</span>
              <span className="text-white/30 w-16 text-right">{e.latency_ms}ms</span>
              <span className="text-white/25 w-16 text-right">{new Date(e.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

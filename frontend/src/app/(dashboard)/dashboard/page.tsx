"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { Bot, Workflow, BookOpen, Brain, Users, Coins, Wrench, Activity } from "lucide-react";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { fetch, current } = useWorkspaceStore();
  const [d, setD] = useState<any>({});

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!current) return;
    const id = current.id;
    const g = (p: string) => api.get(p).then(r => r.data).catch(() => null);
    Promise.all([
      g(`/agents/workspace/${id}`),
      g(`/workflows/workspace/${id}`),
      g(`/knowledge/documents/workspace/${id}`),
      g(`/memories/workspace/${id}`),
      g(`/workspaces/${id}/members`),
      g(`/observability/summary/workspace/${id}`),
      g(`/audit/workspace/${id}`),
    ]).then(([agents, wf, docs, mem, members, obs, audit]) => {
      setD({
        agents: agents?.length ?? 0,
        workflows: wf?.workflows?.length ?? 0,
        docs: docs?.documents?.length ?? 0,
        memories: mem?.memories?.length ?? 0,
        members: members?.members?.length ?? 0,
        totals: obs?.totals ?? {},
        series: obs?.token_series ?? [],
        audit: audit?.logs ?? [],
      });
    });
  }, [current]);

  const stats = [
    { label: "Agents", value: d.agents ?? 0, icon: Bot, color: "#8b5cf6", href: "/agents" },
    { label: "Workflows", value: d.workflows ?? 0, icon: Workflow, color: "#3b82f6", href: "/workflows" },
    { label: "Knowledge Docs", value: d.docs ?? 0, icon: BookOpen, color: "#10b981", href: "/knowledge" },
    { label: "Memories", value: d.memories ?? 0, icon: Brain, color: "#ec4899", href: "/memory" },
    { label: "Team Members", value: d.members ?? 0, icon: Users, color: "#f59e0b", href: "/team" },
    { label: "Total Tokens", value: (d.totals?.total_tokens ?? 0).toLocaleString(), icon: Coins, color: "#06b6d4", href: "/observability" },
    { label: "Tool Runs", value: d.totals?.tool_runs ?? 0, icon: Wrench, color: "#a855f7", href: "/tools" },
    { label: "LLM Calls", value: d.totals?.calls ?? 0, icon: Activity, color: "#22c55e", href: "/observability" },
  ];

  const maxTok = Math.max(1, ...(d.series ?? []).map((s: any) => s.tokens));

  return (
    <div className="animate-fade-in max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Welcome back, {user?.full_name?.split(" ")[0]} 👋</h1>
        <p className="text-white/40 text-sm mt-1">{current ? `Workspace: ${current.name}` : "No workspace yet"}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}
            className="rounded-xl border border-white/5 bg-white/3 p-4 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40 font-medium">{label}</span>
              <div className="rounded-lg p-1.5" style={{ background: color + "1a" }}><Icon size={14} style={{ color }} /></div>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* Mini token chart */}
        <div className="rounded-xl border border-white/5 bg-white/3 p-5">
          <p className="text-sm font-semibold text-white/70 mb-4">Token Usage (7d)</p>
          <div className="flex items-end gap-1.5 h-28">
            {(d.series ?? []).map((s: any) => (
              <div key={s.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-gradient-to-t from-primary-600 to-primary-400"
                  style={{ height: `${(s.tokens / maxTok) * 100}%`, minHeight: s.tokens ? 3 : 0 }} title={`${s.tokens} tok`} />
                <span className="text-[8px] text-white/30">{s.date.slice(5)}</span>
              </div>
            ))}
            {(!d.series || d.series.length === 0) && <p className="text-xs text-white/30">ยังไม่มีข้อมูล</p>}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-white/5 bg-white/3 p-5">
          <p className="text-sm font-semibold text-white/70 mb-3">Recent Activity</p>
          <div className="space-y-1.5">
            {(d.audit ?? []).slice(0, 6).map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400 shrink-0" />
                <span className="font-mono text-white/70 w-28 shrink-0">{a.action}</span>
                <span className="text-white/40 flex-1 truncate">{a.actor ?? "—"}</span>
                <span className="text-white/25">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {(!d.audit || d.audit.length === 0) && <p className="text-xs text-white/30">ยังไม่มีกิจกรรม</p>}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-6">
        <h2 className="text-sm font-semibold text-white/70 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Open Office", emoji: "🏢", href: "/office" },
            { label: "AI Meeting", emoji: "💬", href: "/meeting" },
            { label: "Workflows", emoji: "⚡", href: "/workflows" },
            { label: "Knowledge", emoji: "📚", href: "/knowledge" },
            { label: "Tools", emoji: "🔧", href: "/tools" },
          ].map((action) => (
            <Link key={action.label} href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/3 p-4 hover:border-primary-500/30 hover:bg-primary-600/10 transition-all">
              <span className="text-2xl">{action.emoji}</span>
              <span className="text-xs font-medium text-white/60">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

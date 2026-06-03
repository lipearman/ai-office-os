"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { Bot, Workflow, BookOpen, Activity, Users, Zap } from "lucide-react";

const stats = [
  { label: "Active Agents", value: "0", icon: Bot, color: "text-purple-400", bg: "bg-purple-400/10" },
  { label: "Workflows", value: "0", icon: Workflow, color: "text-blue-400", bg: "bg-blue-400/10" },
  { label: "Knowledge Docs", value: "0", icon: BookOpen, color: "text-green-400", bg: "bg-green-400/10" },
  { label: "Tasks Today", value: "0", icon: Activity, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  { label: "Team Members", value: "0", icon: Users, color: "text-pink-400", bg: "bg-pink-400/10" },
  { label: "API Calls", value: "0", icon: Zap, color: "text-orange-400", bg: "bg-orange-400/10" },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { workspaces, fetch, current } = useWorkspaceStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.full_name?.split(" ")[0]} 👋
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {current ? `Workspace: ${current.name}` : "No workspace yet"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-white/5 bg-white/3 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40 font-medium">{label}</span>
              <div className={`rounded-lg p-2 ${bg}`}>
                <Icon size={16} className={color} />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-6">
        <h2 className="text-sm font-semibold text-white/70 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "New Agent", emoji: "🤖", href: "/agents/new" },
            { label: "New Workflow", emoji: "⚡", href: "/workflows/new" },
            { label: "Upload Docs", emoji: "📄", href: "/knowledge/upload" },
            { label: "Open Office", emoji: "🏢", href: "/office" },
          ].map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/3 p-4 hover:border-primary-500/30 hover:bg-primary-600/10 transition-all"
            >
              <span className="text-2xl">{action.emoji}</span>
              <span className="text-xs font-medium text-white/60">{action.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";

const AGENT_COLORS: Record<string, string> = {
  reception: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30",
  ceo:       "from-amber-500/20  to-amber-600/10  border-amber-500/30",
  pm:        "from-amber-500/20  to-amber-600/10  border-amber-500/30",
  ba:        "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
  dev:       "from-blue-500/20   to-blue-600/10   border-blue-500/30",
  dba:       "from-violet-500/20 to-violet-600/10 border-violet-500/30",
  qa:        "from-red-500/20    to-red-600/10    border-red-500/30",
  rag:       "from-pink-500/20   to-pink-600/10   border-pink-500/30",
};

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

export function AgentThinking({ agentType, agentName }: { agentType?: string; agentName?: string }) {
  const colorClass = AGENT_COLORS[agentType ?? "reception"] ?? AGENT_COLORS.reception;
  const emoji = AGENT_EMOJI[agentType ?? "reception"] ?? "🤖";

  return (
    <div className="flex items-end gap-2 px-4 py-2">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm bg-gradient-to-br border",
        colorClass
      )}>
        {emoji}
      </div>
      <div className="flex flex-col gap-1">
        <span className="px-1 text-xs text-white/40">{agentName ?? "Agent"}</span>
        <div className={cn(
          "flex items-center gap-2 rounded-2xl rounded-bl-sm border px-4 py-2.5 bg-gradient-to-r",
          colorClass
        )}>
          <span className="text-xs text-white/60">Thinking</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-white/40"
                style={{
                  animation: "agentThink 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes agentThink {
          0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          30% { transform: translateY(-5px) scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

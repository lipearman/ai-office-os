"use client";

import { useState, useEffect } from "react";
import type { AgentData } from "@/store/office";
import { AGENT_COLORS, AGENT_EMOJI } from "./constants";
import { cn } from "@/lib/utils";

interface AgentSpriteProps {
  agent: AgentData;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

export function AgentSprite({ agent, isSelected, onClick, index }: AgentSpriteProps) {
  const [bobOffset, setBobOffset] = useState(0);
  const color = AGENT_COLORS[agent.agent_type] ?? "#6366f1";
  const emoji = AGENT_EMOJI[agent.agent_type] ?? "🤖";
  const isOnline = agent.status === "IDLE" || agent.status === "idle" || agent.status === "BUSY" || agent.status === "busy";
  const isBusy  = agent.status === "BUSY" || agent.status === "busy";

  // Bob animation via CSS, offset per agent index
  const bobDelay = `${index * 0.3}s`;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "relative flex flex-col items-center gap-0.5 transition-transform hover:scale-110",
        isSelected && "scale-110"
      )}
      title={agent.name}
    >
      {/* Selection glow */}
      {isSelected && (
        <div
          className="absolute inset-0 rounded-full blur-md opacity-60"
          style={{ background: color, transform: "scale(1.5)" }}
        />
      )}

      {/* Character body */}
      <div
        className="relative flex items-center justify-center rounded-full text-xl shadow-lg"
        style={{
          width: 44,
          height: 44,
          background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}44)`,
          border: `2px solid ${color}`,
          animation: `agentBob 2s ease-in-out infinite`,
          animationDelay: bobDelay,
          boxShadow: isSelected ? `0 0 16px ${color}88` : `0 4px 12px ${color}44`,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</span>

        {/* Status dot */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a1a]",
            isBusy   ? "bg-yellow-400 animate-pulse" :
            isOnline ? "bg-green-400" : "bg-gray-500"
          )}
        />
      </div>

      {/* Name tag */}
      <div
        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap shadow"
        style={{ background: `${color}cc`, border: `1px solid ${color}55` }}
      >
        {agent.name}
      </div>

      {isBusy && (
        <div className="flex gap-0.5">
          {[0,1,2].map(i => (
            <span
              key={i}
              className="inline-block h-1 w-1 rounded-full bg-yellow-400"
              style={{ animation: "agentThink 1.2s infinite", animationDelay: `${i*0.2}s` }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes agentBob {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes agentThink {
          0%,60%,100% { transform: translateY(0); opacity:.4; }
          30% { transform: translateY(-3px); opacity:1; }
        }
      `}</style>
    </button>
  );
}

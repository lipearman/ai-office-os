"use client";

import { X, MessageSquare, Zap } from "lucide-react";
import type { AgentData } from "@/store/office";
import type { RoomConfig } from "./constants";
import { AGENT_COLORS, AGENT_EMOJI } from "./constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  IDLE: "bg-green-400", idle: "bg-green-400",
  BUSY: "bg-yellow-400 animate-pulse", busy: "bg-yellow-400 animate-pulse",
  OFFLINE: "bg-gray-500", offline: "bg-gray-500",
  ERROR: "bg-red-400", error: "bg-red-400",
};

interface AgentPanelProps {
  room: RoomConfig | null;
  agent: AgentData | null;
  allAgents: AgentData[];
  onClose: () => void;
  onChat: (agent: AgentData) => void;
  onSelectAgent: (agent: AgentData) => void;
}

export function AgentPanel({ room, agent, allAgents, onClose, onChat, onSelectAgent }: AgentPanelProps) {
  if (!room && !agent) return null;

  const roomAgents = room ? allAgents.filter(a => {
    // match by room type stored in agent config or position
    return true; // all agents in the selected room are passed in
  }) : [];

  return (
    <div className="absolute right-4 top-14 bottom-4 w-64 z-20 flex flex-col gap-3 animate-slide-up pointer-events-auto">
      {room && (
        <div
          className="rounded-2xl border p-4 backdrop-blur-xl"
          style={{
            background: `${room.color}ee`,
            borderColor: room.wallColor + "44",
            boxShadow: `0 0 30px ${room.wallColor}22`,
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-2xl mb-1">{room.emoji}</div>
              <h2 className="text-sm font-bold text-white">{room.label}</h2>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>

          {roomAgents.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: room.wallColor }}>
                Agents in room
              </p>
              {roomAgents.map(a => (
                <AgentRow key={a.id} agent={a} isSelected={agent?.id === a.id}
                  onSelect={() => onSelectAgent(a)} onChat={() => onChat(a)} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/30 text-center py-3">No agents assigned</p>
          )}
        </div>
      )}

      {agent && (
        <div className="rounded-2xl border border-white/10 bg-[#0d0d1f]/90 p-4 backdrop-blur-xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${AGENT_COLORS[agent.agent_type]}cc, ${AGENT_COLORS[agent.agent_type]}33)`,
                  border: `2px solid ${AGENT_COLORS[agent.agent_type]}`,
                  boxShadow: `0 0 16px ${AGENT_COLORS[agent.agent_type]}44`,
                }}
              >
                {AGENT_EMOJI[agent.agent_type] ?? "🤖"}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{agent.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_DOT[agent.status] ?? "bg-gray-500")} />
                  <span className="text-xs text-white/40 capitalize">{agent.status?.toLowerCase()}</span>
                </div>
                <p className="text-xs text-white/30 capitalize mt-0.5">{agent.agent_type} agent</p>
              </div>
            </div>
            {!room && (
              <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                <X size={15} />
              </button>
            )}
          </div>
          <Button size="md" className="w-full gap-2" onClick={() => onChat(agent)}>
            <MessageSquare size={14} />
            Chat with {agent.name}
          </Button>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, isSelected, onSelect, onChat }: {
  agent: AgentData; isSelected: boolean; onSelect: () => void; onChat: () => void;
}) {
  const color = AGENT_COLORS[agent.agent_type] ?? "#6366f1";
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 rounded-xl p-2 text-left w-full transition-all",
        isSelected ? "border" : "border border-transparent hover:border-white/10 hover:bg-white/5"
      )}
      style={isSelected ? { borderColor: color + "44", background: color + "11" } : {}}
    >
      <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-base"
        style={{ background: color + "33", border: `1px solid ${color}44` }}>
        {AGENT_EMOJI[agent.agent_type] ?? "🤖"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white truncate">{agent.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", STATUS_DOT[agent.status] ?? "bg-gray-500")} />
          <span className="text-[10px] text-white/40 capitalize">{agent.status?.toLowerCase()}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onChat(); }}
        className="shrink-0 rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/10 transition-all"
      >
        <MessageSquare size={12} />
      </button>
    </button>
  );
}

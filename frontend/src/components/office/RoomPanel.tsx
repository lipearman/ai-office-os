"use client";

import { X, Bot, MessageSquare } from "lucide-react";
import { useOfficeStore, type AgentData } from "@/store/office";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  idle:    "bg-green-400",
  busy:    "bg-yellow-400 animate-pulse",
  offline: "bg-gray-500",
  error:   "bg-red-400",
};

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", ba: "📊", dev: "💻",
  dba: "🗄️", qa: "🔍", rag: "📚",
};

function AgentCard({
  agent,
  onChat,
  onClick,
}: {
  agent: AgentData;
  onChat: () => void;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md p-3 text-left hover:border-white/15 hover:bg-white/6 transition-all"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
        {AGENT_EMOJI[agent.agent_type] ?? "🤖"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{agent.name}</span>
          <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[agent.status])} />
        </div>
        <p className="text-xs text-white/40 capitalize">{agent.agent_type} agent</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onChat(); }}
        className="shrink-0 rounded-lg p-1.5 text-white/30 hover:bg-primary-600/20 hover:text-primary-400 transition-all"
        title={`Chat with ${agent.name}`}
      >
        <MessageSquare size={14} />
      </button>
    </button>
  );
}

export function RoomPanel() {
  const { selectedRoom, selectedAgent, agents, selectRoom, selectAgent } = useOfficeStore();
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  const handleChat = async (agent: AgentData) => {
    if (!workspace) return;
    const convId = await openOrCreate(agent.id, workspace.id);
    setActive(convId);
    // Trigger chat panel open via custom event
    window.dispatchEvent(new CustomEvent("open-chat"));
  };

  if (!selectedRoom && !selectedAgent) return null;

  const roomAgents = agents.filter((a) => a.room_id === selectedRoom?.id);

  return (
    <div className="absolute right-4 top-4 bottom-4 w-72 flex flex-col gap-3 animate-slide-up pointer-events-none">
      {/* Room info */}
      {selectedRoom && (
        <div className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-xl pointer-events-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-2xl mb-1">{selectedRoom.config.emoji ?? "🏠"}</div>
              <h2 className="text-base font-semibold text-white">{selectedRoom.name}</h2>
              <p className="text-xs text-white/40 capitalize">{selectedRoom.room_type} room</p>
            </div>
            <button onClick={() => selectRoom(null)} className="text-white/30 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <p className="text-lg font-bold text-white">{roomAgents.length}</p>
              <p className="text-xs text-white/40">Agents</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <p className="text-lg font-bold text-green-400">
                {roomAgents.filter((a) => a.status !== "offline").length}
              </p>
              <p className="text-xs text-white/40">Online</p>
            </div>
          </div>

          {roomAgents.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Agents in room</p>
              {roomAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => selectAgent(agent)}
                  onChat={() => handleChat(agent)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Bot size={24} className="text-white/20" />
              <p className="text-xs text-white/30">No agents assigned yet</p>
            </div>
          )}
        </div>
      )}

      {/* Agent detail */}
      {selectedAgent && (
        <div className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-xl pointer-events-auto">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">
                {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{selectedAgent.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[selectedAgent.status])} />
                  <span className="text-xs text-white/40 capitalize">{selectedAgent.status}</span>
                </div>
              </div>
            </div>
            <button onClick={() => selectAgent(null)} className="text-white/30 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <Button
            size="md"
            className="w-full gap-2"
            onClick={() => handleChat(selectedAgent)}
          >
            <MessageSquare size={14} />
            Chat with {selectedAgent.name}
          </Button>
        </div>
      )}
    </div>
  );
}

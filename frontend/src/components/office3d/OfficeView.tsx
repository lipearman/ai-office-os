"use client";

import { useState } from "react";
import { X, MessageSquare } from "lucide-react";
import type { AgentData } from "@/store/office";
import { RooftopScene } from "./RooftopScene";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
  ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

interface Props {
  agents: AgentData[];
  officeName: string;
}

export default function OfficeView({ agents, officeName }: Props) {
  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  const handleChat = async () => {
    if (!selectedAgent || !workspace) return;
    const convId = await openOrCreate(selectedAgent.id, workspace.id);
    setActive(convId);
    window.dispatchEvent(new CustomEvent("open-chat"));
    setSelectedAgent(null);
  };

  const onlineCount = agents.filter(a => a.status !== "OFFLINE" && a.status !== "offline").length;

  return (
    <div className="relative w-full h-full">
      {/* R3F Canvas */}
      <RooftopScene
        agents={agents}
        onAgentClick={setSelectedAgent}
        selectedAgentId={selectedAgent?.id ?? null}
      />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-5 py-3 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(5,5,16,0.7), transparent)" }}>
        <span className="text-lg">🏢</span>
        <span className="text-sm font-bold text-white">{officeName}</span>
        <div className="h-4 w-px bg-white/20" />
        <span className="text-xs text-white/60">
          <span className="text-green-400 font-bold">{onlineCount}</span>/{agents.length} agents online
        </span>
        <div className="ml-auto text-[11px] text-white/30">Drag to orbit · Scroll to zoom · Click agent to chat</div>
      </div>

      {/* Agent panel */}
      {selectedAgent && (
        <div className="absolute right-5 top-16 z-10 w-60 animate-slide-up">
          <div
            className="rounded-2xl border p-5 backdrop-blur-xl"
            style={{
              background: "rgba(5,5,22,0.88)",
              borderColor: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "44",
              boxShadow: `0 8px 32px ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}22`,
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{
                    background: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "33",
                    border: `2px solid ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}`,
                    boxShadow: `0 0 16px ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}44`,
                  }}
                >
                  {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{selectedAgent.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      selectedAgent.status === "BUSY" || selectedAgent.status === "busy"
                        ? "bg-yellow-400 animate-pulse"
                        : "bg-green-400"
                    }`} />
                    <span className="text-xs text-white/40 capitalize">{selectedAgent.status?.toLowerCase()}</span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5 capitalize">{selectedAgent.agent_type} agent</p>
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="text-white/30 hover:text-white transition-colors">
                <X size={15} />
              </button>
            </div>
            <button
              onClick={handleChat}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1" }}
            >
              <MessageSquare size={14} />
              Chat with {selectedAgent.name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

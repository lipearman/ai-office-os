"use client";

import { useState, useRef, useCallback } from "react";
import { Pencil, Check, MessageSquare, X, ImageIcon } from "lucide-react";
import type { AgentData } from "@/store/office";
import type { FurnitureItem, SpriteConfig } from "./types";
import { OfficeCanvas, type OfficeCanvasHandle } from "./OfficeCanvas";
import { EditorPanel } from "./EditorPanel";
import { SpriteUploadModal } from "./SpriteUploadModal";
import { useOfficeGameStore } from "@/store/officeGame";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { cn } from "@/lib/utils";

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

export default function OfficeView2D({ agents, officeName }: Props) {
  const canvasRef = useRef<OfficeCanvasHandle>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureItem | null>(null);
  const [spriteModalAgent, setSpriteModalAgent] = useState<AgentData | null>(null);

  const { agentSprites, setAgentSprite } = useOfficeGameStore();
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const handleChat = useCallback(async () => {
    if (!selectedAgent || !workspace) return;
    const convId = await openOrCreate(selectedAgent.id, workspace.id);
    setActive(convId);
    window.dispatchEvent(new CustomEvent("open-chat"));
  }, [selectedAgent, workspace, openOrCreate, setActive]);

  const onlineCount = agents.filter((a) => a.status !== "OFFLINE" && a.status !== "offline").length;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a1a]">
      {/* Canvas */}
      <OfficeCanvas
        ref={canvasRef}
        agents={agents}
        selectedAgentId={selectedAgentId}
        selectedFurnitureId={selectedFurniture?.id ?? null}
        editorMode={editorMode}
        onAgentClick={(id) => { setSelectedAgentId(id); }}
        onFurnitureClick={(item) => setSelectedFurniture(item)}
      />

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-5 py-3 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(5,5,16,0.75), transparent)" }}>
        <span className="text-lg">🏢</span>
        <span className="text-sm font-bold text-white">{officeName}</span>
        <div className="h-4 w-px bg-white/20" />
        <span className="text-xs text-white/60">
          <span className="text-green-400 font-bold">{onlineCount}</span>/{agents.length} online
        </span>
        {editorMode && (
          <span className="ml-2 text-xs text-yellow-400 font-bold animate-pulse">✏️ Editor</span>
        )}
        {!editorMode && selectedAgent && (
          <span className="ml-auto text-[11px] text-white/40">คลิกที่พื้นเพื่อให้ {selectedAgent.name} เดินไป</span>
        )}
      </div>

      {/* Editor toggle */}
      <button
        onClick={() => { setEditorMode((m) => !m); setSelectedFurniture(null); }}
        className={cn(
          "absolute bottom-6 right-6 z-20 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition-all pointer-events-auto",
          editorMode ? "bg-green-500 text-black hover:bg-green-400" : "bg-white/10 border border-white/20 text-white hover:bg-white/15"
        )}
      >
        {editorMode ? <><Check size={15}/> เสร็จสิ้น</> : <><Pencil size={15}/> แก้ไข Office</>}
      </button>

      {/* Editor panel */}
      {editorMode && (
        <EditorPanel
          selectedFurniture={selectedFurniture}
          onClose={() => { setEditorMode(false); setSelectedFurniture(null); }}
        />
      )}

      {/* Agent panel */}
      {!editorMode && selectedAgent && (
        <div className="absolute right-5 top-16 z-20 w-60 animate-slide-up pointer-events-auto">
          <div className="rounded-2xl border p-5 backdrop-blur-xl"
            style={{
              background: "rgba(5,5,22,0.9)",
              borderColor: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "44",
            }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{
                    background: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "33",
                    border: `2px solid ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}`,
                  }}>
                  {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{selectedAgent.name}</p>
                  <p className="text-xs text-white/40 capitalize">{selectedAgent.agent_type} · {selectedAgent.status?.toLowerCase()}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAgentId(null)} className="text-white/30 hover:text-white"><X size={15} /></button>
            </div>

            <button onClick={handleChat}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 mb-2"
              style={{ background: AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1" }}>
              <MessageSquare size={14} /> คุยกับ {selectedAgent.name}
            </button>

            <button onClick={() => setSpriteModalAgent(selectedAgent)}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-white/70 border border-white/10 hover:bg-white/5 transition-all">
              <ImageIcon size={13} />
              {agentSprites[selectedAgent.id] ? "เปลี่ยน sprite" : "อัปโหลด sprite"}
            </button>
          </div>
        </div>
      )}

      {/* Sprite upload modal */}
      {spriteModalAgent && (
        <SpriteUploadModal
          agentName={spriteModalAgent.name}
          current={agentSprites[spriteModalAgent.id] ?? null}
          onSave={(sprite) => setAgentSprite(spriteModalAgent.id, sprite)}
          onClose={() => setSpriteModalAgent(null)}
        />
      )}
    </div>
  );
}

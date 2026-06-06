"use client";

import { useCallback, useRef, useState } from "react";
import { X, Minus, ChevronDown, Users, MessageCircle } from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace";
import { useChatStore } from "@/store/chat";
import type { AgentData } from "@/store/office";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

const STATUS_LABEL: Record<string, string> = {
  idle:    "ว่าง",
  busy:    "กำลังทำงาน",
  offline: "ออฟไลน์",
  error:   "มีปัญหา",
};

const STATUS_DOT: Record<string, string> = {
  idle:    "bg-green-400 shadow-[0_0_6px_#4ade80]",
  busy:    "bg-yellow-400 animate-pulse shadow-[0_0_6px_#facc15]",
  offline: "bg-gray-500",
  error:   "bg-red-400",
};

interface Props {
  agents: AgentData[];
  isOpen: boolean;
  onClose: () => void;
  /** called when user clicks "Chat" on an agent — lets parent open the live chat panel */
  onOpenChat?: (agentId: string) => void;
}

export default function FloatingAgentList({ agents, isOpen, onClose, onOpenChat }: Props) {
  const { current: workspace } = useWorkspaceStore();
  const { openOrCreate } = useChatStore();

  // position: bottom-left by default (Live Chat is bottom-right)
  const [pos, setPos]       = useState({ x: 24, y: 80 });
  const [minimized, setMin] = useState(false);
  const [chatting, setChatting] = useState<string | null>(null); // agentId being opened

  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        setPos({
          // left panel: increase x moves RIGHT → pos.x is distance from LEFT edge
          x: Math.max(0, dragRef.current.px + (ev.clientX - dragRef.current.sx)),
          y: Math.max(0, dragRef.current.py - (ev.clientY - dragRef.current.sy)),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pos]
  );

  const handleChat = async (agentId: string) => {
    if (!workspace) return;
    setChatting(agentId);
    try {
      await openOrCreate(agentId, workspace.id);
      onOpenChat?.(agentId);
    } finally {
      setChatting(null);
    }
  };

  const onlineCount = agents.filter(
    (a) => (a.status ?? "").toLowerCase() !== "offline"
  ).length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        left: pos.x,
        bottom: pos.y,
        width: 260,
        height: minimized ? "auto" : 420,
        background: "linear-gradient(160deg,#1a1040 0%,#130d2e 60%,#0e1929 100%)",
        border: "1px solid rgba(139,92,246,0.25)",
      }}
    >
      {/* ── Title bar ── */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex cursor-grab select-none items-center gap-2.5 px-4 py-3 active:cursor-grabbing"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Users size={14} className="shrink-0 text-purple-400" />
        <span className="flex-1 text-sm font-semibold text-white">Agents</span>
        <button
          onClick={() => setMin((m) => !m)}
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
          title={minimized ? "ขยาย" : "ย่อ"}
        >
          {minimized ? <ChevronDown size={13} /> : <Minus size={13} />}
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
          title="ปิด"
        >
          <X size={13} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* ── Online summary ── */}
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
            <span className="text-xs font-bold text-green-400">{onlineCount}</span>
            <span className="text-[10px] text-white/35 tracking-widest font-medium">ONLINE</span>
            <span className="ml-auto text-[10px] text-white/25">{agents.length} total</span>
          </div>

          {/* ── Agent list ── */}
          <div className="flex-1 overflow-y-auto">
            {agents.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-white/30">
                ยังไม่มี agent
              </div>
            ) : (
              agents.map((agent) => {
                const sk = (agent.status ?? "offline").toLowerCase() as keyof typeof STATUS_DOT;
                const emoji = AGENT_EMOJI[agent.agent_type] ?? "🤖";
                const isChatting = chatting === agent.id;

                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
                  >
                    {/* Avatar */}
                    <div
                      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}
                    >
                      {emoji}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1a1040] ${STATUS_DOT[sk] ?? STATUS_DOT.offline}`}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{agent.name}</p>
                      <p className="text-[10px] text-white/40">
                        {STATUS_LABEL[sk] ?? sk}
                      </p>
                    </div>

                    {/* Chat button */}
                    <button
                      onClick={() => handleChat(agent.id)}
                      disabled={isChatting}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-purple-300 disabled:opacity-40"
                      title={`คุยกับ ${agent.name}`}
                    >
                      {isChatting ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-purple-400 border-t-transparent" />
                      ) : (
                        <MessageCircle size={14} />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

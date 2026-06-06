"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Minus, ChevronDown, Send, Users } from "lucide-react";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useOfficeLiveFeed } from "@/store/officeLiveFeed";
import type { AgentData } from "@/store/office";
import type { Marker } from "@/store/officeTemplates";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚", user: "👤",
};

/** Format ms timestamp as HH:MM */
function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, "0") + ":" +
         d.getMinutes().toString().padStart(2, "0");
}

interface Props {
  agents: AgentData[];
  markers: Marker[];
  isOpen: boolean;
  onClose: () => void;
}

export default function FloatingAgentChat({ agents, markers, isOpen, onClose }: Props) {
  const { current: workspace } = useWorkspaceStore();
  const { openOrCreate, sendMessageStream, fetchConversations, sending } = useChatStore();
  const { entries, pushUserMessage } = useOfficeLiveFeed();

  // position from right/bottom edge (px)
  const [pos, setPos]         = useState({ x: 24, y: 80 });
  const [minimized, setMin]   = useState(false);
  const [inputVal, setInput]  = useState("");
  const [toAgent, setToAgent] = useState<string | null>(null);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // unique agents visible in the office (from markers)
  const officeAgents = markers
    .map((m) => agents.find((a) => a.id === m.agent_id))
    .filter((a): a is AgentData => !!a)
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  useEffect(() => {
    if (isOpen && workspace) fetchConversations(workspace.id);
  }, [isOpen, workspace, fetchConversations]);

  // auto-select first agent on open
  useEffect(() => {
    if (isOpen && !toAgent && officeAgents.length > 0) {
      setToAgent(officeAgents[0].id);
    }
  }, [isOpen, officeAgents, toAgent]);

  // auto-scroll to bottom on new entries
  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, minimized]);

  // ── drag ──
  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        setPos({
          x: Math.max(0, dragRef.current.px - (ev.clientX - dragRef.current.sx)),
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

  // ── send ──
  const handleSend = async () => {
    if (!inputVal.trim() || !toAgent || !workspace) return;
    const msg = inputVal.trim();
    const agent = agents.find((a) => a.id === toAgent);
    setInput("");

    // add to live feed immediately
    pushUserMessage(msg, agent?.name ?? "Agent");

    // send to actual agent via API
    const convId = await openOrCreate(toAgent, workspace.id);
    sendMessageStream(convId, msg); // fire-and-forget; reply will come via conversation API
  };

  if (!isOpen) return null;

  const selectedAgent = agents.find((a) => a.id === toAgent);

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        right: pos.x,
        bottom: pos.y,
        width: 380,
        height: minimized ? "auto" : 520,
        background: "linear-gradient(160deg,#1a1040 0%,#130d2e 60%,#0e1929 100%)",
        border: "1px solid rgba(139,92,246,0.25)",
      }}
    >
      {/* ── Title bar (drag) ── */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex cursor-grab select-none items-center gap-2.5 px-4 py-3 active:cursor-grabbing"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="flex-1 text-sm font-semibold text-white tracking-wide">Live Chat</span>
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
          {/* ── Channel header ── */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl"
              style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
              💬
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-400 text-[6px] font-bold text-black">
                {officeAgents.length}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">OFFICE CHAT</span>
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <Users size={10} />
                  {officeAgents.length} Online
                </span>
              </div>
              <p className="text-[10px] text-white/40 truncate">AI Agents are working on tasks</p>
            </div>
          </div>

          {/* ── Message feed ── */}
          <div className="flex-1 overflow-y-auto space-y-0.5 px-2 py-2">
            {entries.length === 0 && (
              <div className="flex h-32 items-center justify-center text-xs text-white/30">
                รอ agent เริ่มคุยกัน…
              </div>
            )}

            {entries.map((entry) => {
              const isUser = !!entry.isUser;
              const emoji  = AGENT_EMOJI[entry.agentType] ?? "🤖";

              return (
                <div
                  key={entry.id}
                  className="flex gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.03]"
                >
                  {/* Avatar */}
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                    style={{
                      background: isUser
                        ? "linear-gradient(135deg,#0ea5e9,#06b6d4)"
                        : "linear-gradient(135deg,#7c3aed,#4f46e5)",
                    }}
                  >
                    {emoji}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-[#a78bfa]">
                        @{entry.agentName}
                      </span>
                      {!isUser && (
                        <span
                          className="rounded px-1.5 py-px text-[8px] font-bold uppercase tracking-wide"
                          style={{ background: "rgba(124,58,237,0.35)", color: "#c4b5fd" }}
                        >
                          AI AGENT
                        </span>
                      )}
                      {isUser && (
                        <span
                          className="rounded px-1.5 py-px text-[8px] font-bold uppercase tracking-wide"
                          style={{ background: "rgba(14,165,233,0.25)", color: "#7dd3fc" }}
                        >
                          USER
                        </span>
                      )}
                      <span className="text-[10px] text-white/30">{fmtTime(entry.timestamp)}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/80 break-words">
                      {isUser && (
                        <span className="text-[#93c5fd] font-medium mr-1">
                          {entry.agentName}
                        </span>
                      )}
                      {entry.content}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* typing indicator when sending */}
            {sending && selectedAgent && (
              <div className="flex gap-3 rounded-xl px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                  {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[#a78bfa]">@{selectedAgent.name}</span>
                    <span className="rounded px-1.5 py-px text-[8px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(124,58,237,0.35)", color: "#c4b5fd" }}>AI AGENT</span>
                  </div>
                  <span className="inline-flex gap-0.5 py-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400"
                        style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div
            className="px-3 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}
          >
            {/* agent selector */}
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] text-white/40 shrink-0">ส่งถึง:</span>
              <select
                value={toAgent ?? ""}
                onChange={(e) => setToAgent(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white focus:border-purple-500/50 focus:outline-none"
              >
                {officeAgents.map((a) => (
                  <option key={a.id} value={a.id} className="bg-[#1a1040]">
                    {AGENT_EMOJI[a.agent_type] ?? "🤖"} {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* text input + send */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg"
                style={{ background: "linear-gradient(135deg,#0ea5e9,#06b6d4)" }}>
                👤
              </div>
              <input
                value={inputVal}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Say something — @ to mention"
                disabled={sending}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white placeholder-white/30 focus:border-purple-500/40 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={sending || !inputVal.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}
              >
                <Send size={13} className="text-white" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

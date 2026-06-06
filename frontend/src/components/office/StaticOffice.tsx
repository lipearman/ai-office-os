"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { useTemplatesStore, resolveAssetUrl, type Marker } from "@/store/officeTemplates";
import { useOfficeChatsStore } from "@/store/officeChats";
import { useOfficeLiveFeed } from "@/store/officeLiveFeed";
import FloatingAgentChat from "@/components/office/FloatingAgentChat";
import FloatingAgentList from "@/components/office/FloatingAgentList";
import type { AgentData } from "@/store/office";

interface Props {
  agents: AgentData[];
  officeName: string;
}

type StatusKey = "idle" | "busy" | "offline" | "error";

const STATUS_TEXT: Record<StatusKey, string> = {
  idle: "ว่าง",
  busy: "กำลังทำงาน…",
  offline: "ออฟไลน์",
  error: "มีปัญหา",
};
const STATUS_COLOR: Record<StatusKey, string> = {
  idle: "#22d3ee",
  busy: "#ff2d75",
  offline: "#6b7280",
  error: "#f59e0b",
};

/** Backend enums come back UPPERCASE; normalize to our keys. */
function statusKey(status: string | undefined): StatusKey {
  const k = (status ?? "offline").toLowerCase();
  return (["idle", "busy", "offline", "error"].includes(k) ? k : "offline") as StatusKey;
}

function newMarkerId() {
  return `mk_${Math.random().toString(36).slice(2, 9)}`;
}

export default function StaticOffice({ agents, officeName }: Props) {
  const { current } = useWorkspaceStore();
  const {
    templates, activeTemplate, saving,
    fetchTemplates, createTemplate, updateTemplate, deleteTemplate, activate,
  } = useTemplatesStore();
  const { allMessagesByAgent, isActiveConversation, fetchLatest } = useOfficeChatsStore();
  const { pushAgentMessage, clear: clearFeed } = useOfficeLiveFeed();

  const [editMode, setEditMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [agentListOpen, setAgentListOpen] = useState(true);
  const [draftName, setDraftName] = useState("");
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [draftMarkers, setDraftMarkers] = useState<Marker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef   = useRef<HTMLImageElement>(null);
  const dragId   = useRef<string | null>(null);

  // ---- image bounds (accounts for object-contain letterboxing) ----
  // px offsets of the actual image display area inside the stage div
  type ImgBounds = { left: number; top: number; w: number; h: number };
  const [imgBounds, setImgBounds] = useState<ImgBounds | null>(null);

  const updateImgBounds = useCallback(() => {
    const stage = stageRef.current;
    const img   = imgRef.current;
    if (!stage || !img || !img.naturalWidth || !img.naturalHeight) {
      setImgBounds(null);
      return;
    }
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const ir = img.naturalWidth / img.naturalHeight;
    const sr = sw / sh;
    let left: number, top: number, w: number, h: number;
    if (ir > sr) {                     // image is wider → letterbox top/bottom
      w = sw; h = sw / ir;
      left = 0; top = (sh - h) / 2;
    } else {                           // image is taller → letterbox left/right
      h = sh; w = sh * ir;
      top = 0; left = (sw - w) / 2;
    }
    setImgBounds({ left, top, w, h });
  }, []);

  // ---- per-marker bubble animation with slot system ----
  // MAX_SPEAKERS agents can stream/show simultaneously; others show "..." while waiting
  type BubblePhase = {
    msgIdx: number;    // which message to show (advances when showing→typing)
    phase: "typing" | "streaming" | "showing";
    charIdx: number;   // streamed-char position
    countdown: number; // ms remaining for typing/showing phases
  };
  const MAX_SPEAKERS = 3;
  const SHOW_MS   = 1000;
  const TYPE_MS   = 1200;
  const SLOW_MS   = 400;
  const STREAM_MS = 60;
  const CHARS_PT  = 3;

  const [bubblePhases, setBubblePhases] = useState<Record<string, BubblePhase>>({});
  // stable ref so interval callbacks read current state without stale closures
  const phasesRef = useRef(bubblePhases);
  useEffect(() => { phasesRef.current = bubblePhases; }, [bubblePhases]);

  // watch stage div for size changes → recompute image bounds
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateImgBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateImgBounds]);

  // fetch templates
  useEffect(() => {
    if (current) fetchTemplates(current.id);
  }, [current, fetchTemplates]);

  // fetch & poll latest conversations for speech bubbles (every 15s)
  useEffect(() => {
    if (!current) return;
    fetchLatest(current.id);
    const t = setInterval(() => fetchLatest(current.id), 15_000);
    return () => clearInterval(t);
  }, [current, fetchLatest]);

  // load active template into draft when entering edit mode
  const loadDraft = useCallback(() => {
    setDraftName(activeTemplate?.name ?? "");
    setDraftImage(activeTemplate?.image_url ?? null);
    setDraftMarkers(activeTemplate ? activeTemplate.markers.map((m) => ({ ...m })) : []);
    setSelectedId(null);
  }, [activeTemplate]);

  useEffect(() => {
    if (!editMode) loadDraft();
  }, [editMode, loadDraft]);

  // ---- marker drag (edit mode) ----
  // returns % coordinates relative to the actual image display area (not the stage div)
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    if (imgBounds) {
      const relX = (e.clientX - rect.left - imgBounds.left) / imgBounds.w * 100;
      const relY = (e.clientY - rect.top  - imgBounds.top)  / imgBounds.h * 100;
      return { x: Math.max(0, Math.min(100, relX)), y: Math.max(0, Math.min(100, relY)) };
    }
    // fallback when no image
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  useEffect(() => {
    if (!editMode) return;
    const onMove = (e: MouseEvent) => {
      if (!dragId.current) return;
      const { x, y } = pctFromEvent(e);
      setDraftMarkers((ms) => ms.map((m) => (m.id === dragId.current ? { ...m, x, y } : m)));
    };
    const onUp = () => { dragId.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editMode]);

  const addMarker = () => {
    const id = newMarkerId();
    setDraftMarkers((ms) => {
      const used = new Set(ms.map((m) => m.agent_id));
      const firstFree = agents.find((a) => !used.has(a.id)) ?? agents[0];
      return [...ms, { id, agent_id: firstFree?.id ?? "", x: 50, y: 50, scale: 1 }];
    });
    setSelectedId(id);
  };

  const patchMarker = (id: string, patch: Partial<Marker>) =>
    setDraftMarkers((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const removeMarker = (id: string) => {
    setDraftMarkers((ms) => ms.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/uploads", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setDraftImage(data.url);
  };

  const saveDraft = async () => {
    if (!activeTemplate) return;
    await updateTemplate(activeTemplate.id, {
      name: draftName.trim() || "Untitled",
      image_url: draftImage,
      markers: draftMarkers,
    });
    setEditMode(false);
  };

  const onNewTemplate = async () => {
    if (!current) return;
    const t = await createTemplate(current.id, `Office ${templates.length + 1}`);
    await activate(t.id);
    setEditMode(true);
  };

  const showImage = resolveAssetUrl(editMode ? draftImage : activeTemplate?.image_url ?? null);
  const showMarkers = editMode ? draftMarkers : activeTemplate?.markers ?? [];
  const agentById = (id: string) => agents.find((a) => a.id === id);

  // init / sync per-marker phases when markers change
  useEffect(() => {
    if (editMode || showMarkers.length === 0) return;
    // full reset when template changes (activeTemplate?.id) or editMode toggled
    setBubblePhases(
      Object.fromEntries(
        showMarkers.map((m, i) => [
          m.id,
          { msgIdx: 0, phase: "typing" as const, charIdx: 0, countdown: i * 600 },
        ])
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id, editMode]);

  // ── interval 1 (400 ms): phase transitions with slot cap ──
  useEffect(() => {
    if (editMode) return;
    const timer = setInterval(() => {
      const prev = phasesRef.current;
      if (showMarkers.length === 0 || Object.keys(prev).length === 0) return;

      // count how many slots are currently occupied (streaming or showing)
      let slotsUsed = Object.values(prev).filter(
        (p) => p.phase === "streaming" || p.phase === "showing"
      ).length;

      const next = { ...prev };

      for (const [id, p] of Object.entries(next)) {
        if (p.phase === "streaming") continue; // handled by interval 2

        const remaining = p.countdown - SLOW_MS;

        if (p.phase === "showing") {
          if (remaining > 0) {
            next[id] = { ...p, countdown: remaining };
          } else {
            // showing done → back to typing, advance msgIdx for next round
            const marker = showMarkers.find((mk) => mk.id === id);
            const msgs   = allMessagesByAgent[marker?.agent_id ?? ""] ?? [];
            const nextMsgIdx = (p.msgIdx + 1) % Math.max(msgs.length, 1);
            next[id] = { ...p, phase: "typing", countdown: TYPE_MS, msgIdx: nextMsgIdx };
          }
          continue;
        }

        // typing phase ─────────────────────────────────────────────────────
        if (slotsUsed >= MAX_SPEAKERS) {
          // at capacity: keep showing "..." but freeze countdown until a slot opens
          continue;
        }
        // slot available
        if (remaining > 0) {
          next[id] = { ...p, countdown: remaining };
        } else {
          // promote to streaming: show msgs[p.msgIdx]
          const marker = showMarkers.find((mk) => mk.id === id);
          const msgs   = allMessagesByAgent[marker?.agent_id ?? ""] ?? [];
          const msg    = msgs[p.msgIdx];
          if (!msg) {
            // no message for this agent yet, reset countdown and wait
            next[id] = { ...p, countdown: TYPE_MS };
            continue;
          }
          if (marker) {
            const agent = agents.find((a) => a.id === marker.agent_id);
            if (agent) pushAgentMessage(agent.id, agent.name, agent.agent_type, msg);
          }
          next[id] = { ...p, phase: "streaming", charIdx: 0, countdown: 0 };
          slotsUsed++; // prevent more than MAX_SPEAKERS promotions in one tick
        }
      }

      setBubblePhases(next);
    }, SLOW_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, allMessagesByAgent, showMarkers, agents, pushAgentMessage]);

  // ── interval 2 (60 ms): char streaming for all streaming markers ──
  useEffect(() => {
    if (editMode) return;
    const timer = setInterval(() => {
      const prev = phasesRef.current;
      const hasStreaming = Object.values(prev).some((p) => p.phase === "streaming");
      if (!hasStreaming || showMarkers.length === 0) return;

      const next = { ...prev };
      for (const [id, p] of Object.entries(next)) {
        if (p.phase !== "streaming") continue;
        const marker = showMarkers.find((mk) => mk.id === id);
        const msgs   = allMessagesByAgent[marker?.agent_id ?? ""] ?? [];
        const text   = msgs[p.msgIdx] ?? "";
        const newChar = Math.min(p.charIdx + CHARS_PT, text.length);
        if (newChar >= text.length) {
          next[id] = { ...p, phase: "showing", charIdx: newChar, countdown: SHOW_MS };
        } else {
          next[id] = { ...p, charIdx: newChar };
        }
      }
      setBubblePhases(next);
    }, STREAM_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, allMessagesByAgent, showMarkers]);

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent">
      {/* ── top toolbar ── */}
      <div className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-2 backdrop-blur">
        <span className="text-sm font-semibold text-white">{officeName}</span>

        {templates.length > 0 && (
          <select
            value={activeTemplate?.id ?? ""}
            onChange={(e) => {
              clearFeed();
              setBubblePhases({});
              activate(e.target.value);
            }}
            disabled={editMode}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#1a1626]">{t.name}</option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Agents toggle */}
          {!editMode && activeTemplate && (
            <button
              onClick={() => setAgentListOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                agentListOpen
                  ? "bg-white/10 text-white"
                  : "border border-white/15 text-white hover:bg-white/10"
              }`}
            >
              <span className="text-xs">👥</span>
              Agents
            </button>
          )}

          {/* Live Chat toggle */}
          {!editMode && activeTemplate && (
            <button
              onClick={() => setChatOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                chatOpen
                  ? "bg-white/10 text-white"
                  : "border border-white/15 text-white hover:bg-white/10"
              }`}
            >
              <MessageCircle size={12} />
              Live Chat
            </button>
          )}

          <button
            onClick={onNewTemplate}
            className="rounded-md border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10"
          >
            + เทมเพลตใหม่
          </button>

          {activeTemplate && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="rounded-md bg-primary-500 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-600"
            >
              แก้ไข Office
            </button>
          )}
          {editMode && (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="rounded-md border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10"
              >
                ยกเลิก
              </button>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="rounded-md bg-accent-500 px-3 py-1 text-xs font-semibold text-black hover:bg-accent-400 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* ── stage ── */}
        <div
          ref={stageRef}
          className="absolute inset-0 select-none"
          onClick={() => editMode && setSelectedId(null)}
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={showImage}
              alt="office"
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={updateImgBounds}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-white/50">
                {editMode ? "อัปโหลดรูป Office ทางขวา →" : "ยังไม่มีรูป Office — กด “แก้ไข Office”"}
              </p>
            </div>
          )}

          {showMarkers.map((m) => {
            const agent = agentById(m.agent_id);
            const sk = statusKey(agent?.status);
            const selected = editMode && selectedId === m.id;

            // position marker relative to actual image area (respects letterboxing)
            const markerStyle = imgBounds
              ? {
                  left: imgBounds.left + (m.x / 100) * imgBounds.w,
                  top:  imgBounds.top  + (m.y / 100) * imgBounds.h,
                  transform: `translate(-50%, -50%) scale(${m.scale})`,
                }
              : {
                  left: `${m.x}%`,
                  top:  `${m.y}%`,
                  transform: `translate(-50%, -50%) scale(${m.scale})`,
                };

            // VIEW mode bubble state for this marker
            const bp   = bubblePhases[m.id];
            const msgs = allMessagesByAgent[agent?.id ?? ""] ?? [];
            const text = msgs[bp?.msgIdx ?? 0] ?? "";
            const displayText  = bp?.phase === "streaming" ? text.slice(0, bp.charIdx) : text;
            const isSpeaking   = bp?.phase === "streaming" || bp?.phase === "showing";
            const isWaiting    = bp?.phase === "typing";   // show "..." dots
            const isStreaming  = bp?.phase === "streaming"; // show cursor
            // flow is active when any marker has messages
            const hasActiveFlow = showMarkers.some(
              (mk) => (allMessagesByAgent[mk.agent_id] ?? []).length > 0
            );

            return (
              <div
                key={m.id}
                style={markerStyle}
                className={`absolute h-10 w-10 ${editMode ? "cursor-move" : ""}`}
                onMouseDown={(e) => {
                  if (!editMode) return;
                  e.stopPropagation();
                  dragId.current = m.id;
                  setSelectedId(m.id);
                }}
                onClick={(e) => editMode && e.stopPropagation()}
              >
                {/* avatar circle — always reserves space; invisible in view mode */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[#1a1626] text-sm font-bold text-white shadow-xl ${
                    editMode
                      ? selected
                        ? "border-accent-400 ring-2 ring-accent-400/50"
                        : "border-white/40"
                      : "invisible"
                  }`}
                >
                  {agent?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(agent.avatar_url) ?? ""}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    (agent?.name ?? "?").charAt(0).toUpperCase()
                  )}
                </div>

                {/* ── bubble / chip above the circle ── */}
                {editMode ? (
                  /* edit: status chip */
                  <div
                    className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                    style={{ background: STATUS_COLOR[sk] }}
                  >
                    {agent ? STATUS_TEXT[sk] : "—"}
                  </div>
                ) : agent ? (
                  hasActiveFlow ? (
                    isSpeaking ? (
                      /* ── speaking: stream / full text ── */
                      <div className="absolute bottom-full left-1/2 mb-1 w-max max-w-[200px] -translate-x-1/2 rounded-2xl bg-white/95 px-3 py-2 text-[11px] leading-snug text-gray-900 shadow-xl">
                        <span className="mb-0.5 block text-[9px] font-bold" style={{ color: STATUS_COLOR[sk] }}>
                          {agent.name}
                        </span>
                        <span>
                          {displayText}
                          {isStreaming && (
                            <span className="ml-px inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse rounded-sm bg-gray-500" />
                          )}
                        </span>
                        <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/95" />
                      </div>
                    ) : isWaiting ? (
                      /* ── waiting: small "..." dots ── */
                      <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 flex items-center gap-0.5 rounded-xl bg-black/50 px-2 py-1">
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="inline-block h-1 w-1 animate-bounce rounded-full bg-white/60"
                            style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    ) : null
                  ) : (
                    /* no active flow → ว่าง */
                    <div
                      className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                      style={{ background: STATUS_COLOR[sk] }}
                    >
                      {STATUS_TEXT[sk]}
                    </div>
                  )
                ) : null}

                {/* name label below circle — edit only */}
                {editMode && (
                  <div className="absolute top-full left-1/2 mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-white">
                    {agent?.name ?? "(ไม่ได้ผูก agent)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── edit panel ── */}
        {editMode && (
          <div className="absolute right-0 top-0 z-20 flex h-full w-72 flex-col gap-3 overflow-y-auto border-l border-white/10 bg-black/50 p-4 backdrop-blur">
            <div>
              <label className="mb-1 block text-xs text-white/60">ชื่อเทมเพลต</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/60">รูป Office</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                className="block w-full text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-primary-500 file:px-2 file:py-1 file:text-xs file:text-white"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">ตัวละคร ({draftMarkers.length})</span>
              <button
                onClick={addMarker}
                disabled={agents.length === 0}
                className="rounded bg-primary-500 px-2 py-0.5 text-xs text-white hover:bg-primary-600 disabled:opacity-40"
              >
                + เพิ่ม
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {draftMarkers.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md border p-2 ${
                    selectedId === m.id ? "border-accent-400 bg-white/5" : "border-white/10"
                  }`}
                  onClick={() => setSelectedId(m.id)}
                >
                  <select
                    value={m.agent_id}
                    onChange={(e) => patchMarker(m.id, { agent_id: e.target.value })}
                    className="mb-2 w-full rounded border border-white/15 bg-white/5 px-1.5 py-1 text-xs text-white"
                  >
                    <option value="" className="bg-[#1a1626]">— เลือก agent —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#1a1626]">{a.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50">ขนาด</span>
                    <input
                      type="range" min={0.5} max={2} step={0.1} value={m.scale}
                      onChange={(e) => patchMarker(m.id, { scale: parseFloat(e.target.value) })}
                      className="flex-1 accent-primary-500"
                    />
                    <button
                      onClick={() => removeMarker(m.id)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
              {draftMarkers.length === 0 && (
                <p className="text-[10px] text-white/40">กด "+ เพิ่ม" แล้วลากตัวละครไปวางบนรูป</p>
              )}
            </div>

            {activeTemplate && (
              <button
                onClick={async () => {
                  if (confirm(`ลบเทมเพลต "${activeTemplate.name}"?`)) {
                    await deleteTemplate(activeTemplate.id);
                    setEditMode(false);
                  }
                }}
                className="mt-auto rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
              >
                ลบเทมเพลตนี้
              </button>
            )}
          </div>
        )}

        {/* ── empty state ── */}
        {templates.length === 0 && !editMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-white/70">ยังไม่มีเทมเพลต Office</p>
            <button
              onClick={onNewTemplate}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
            >
              + สร้างเทมเพลตแรก
            </button>
          </div>
        )}
      </div>

      {/* ── Floating Live Chat panel ── */}
      <FloatingAgentChat
        agents={agents}
        markers={activeTemplate?.markers ?? []}
        isOpen={chatOpen && !editMode}
        onClose={() => setChatOpen(false)}
      />

      {/* ── Floating Agent List panel ── */}
      <FloatingAgentList
        agents={agents}
        isOpen={agentListOpen && !editMode}
        onClose={() => setAgentListOpen(false)}
        onOpenChat={() => setChatOpen(true)}
      />
    </div>
  );
}

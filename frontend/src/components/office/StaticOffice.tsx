"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { useTemplatesStore, resolveAssetUrl, type Marker } from "@/store/officeTemplates";
import { useOfficeSimulation } from "@/hooks/useOfficeSimulation";
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

/** Backend enums come back UPPERCASE (IDLE/BUSY/…); normalize to our keys. */
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

  const [editMode, setEditMode] = useState(false);
  // draft (edit-mode) copy of the active template's editable fields
  const [draftName, setDraftName] = useState("");
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [draftMarkers, setDraftMarkers] = useState<Marker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  // realtime conversation simulation (paused while editing)
  const sim = useOfficeSimulation(!editMode);

  useEffect(() => {
    if (current) fetchTemplates(current.id);
  }, [current, fetchTemplates]);

  // load active template into the draft when it changes (or when entering edit mode)
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
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
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

  // what to render: draft in edit mode, otherwise the persisted active template
  const showImage = resolveAssetUrl(editMode ? draftImage : activeTemplate?.image_url ?? null);
  const showMarkers = editMode ? draftMarkers : activeTemplate?.markers ?? [];
  const agentById = (id: string) => agents.find((a) => a.id === id);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0e0b16]">
      {/* top toolbar */}
      <div className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-2 backdrop-blur">
        <span className="text-sm font-semibold text-white">{officeName}</span>

        {templates.length > 0 && (
          <select
            value={activeTemplate?.id ?? ""}
            onChange={(e) => activate(e.target.value)}
            disabled={editMode}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#1a1626]">{t.name}</option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
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
        {/* stage */}
        <div
          ref={stageRef}
          className="absolute inset-0 select-none"
          onClick={() => editMode && setSelectedId(null)}
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={showImage} alt="office" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-white/50">
                {editMode ? "อัปโหลดรูป Office ทางขวา →" : "ยังไม่มีรูป Office — กด “แก้ไข Office”"}
              </p>
            </div>
          )}

          {showMarkers.map((m) => {
            const agent = agentById(m.agent_id);
            const status = statusKey(agent?.status);
            const selected = editMode && selectedId === m.id;
            // is this marker's agent the one currently speaking in the simulation?
            const speaking = !editMode && !!agent && agent.agent_type === sim.speakerType;
            return (
              <div
                key={m.id}
                style={{ left: `${m.x}%`, top: `${m.y}%`, transform: `translate(-50%, -50%) scale(${m.scale})` }}
                className={`absolute h-10 w-10 ${editMode ? "cursor-move" : ""}`}
                onMouseDown={(e) => {
                  if (!editMode) return;
                  e.stopPropagation();
                  dragId.current = m.id;
                  setSelectedId(m.id);
                }}
                onClick={(e) => editMode && e.stopPropagation()}
              >
                {/* avatar circle — fixed anchor at (x,y); only drawn in edit, but keeps
                    its space in view so the bubble above sits at the same level */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-[#1a1626] text-sm font-bold text-white shadow-xl ${
                    editMode
                      ? selected ? "border-accent-400 ring-2 ring-accent-400/50" : "border-white/40"
                      : "invisible"
                  }`}
                >
                  {agent?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(agent.avatar_url) ?? ""} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    (agent?.name ?? "?").charAt(0).toUpperCase()
                  )}
                </div>

                {/* bubble above the circle — same anchor in both modes */}
                {editMode ? (
                  <div
                    className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                    style={{ background: STATUS_COLOR[status] }}
                  >
                    {agent ? STATUS_TEXT[status] : "—"}
                  </div>
                ) : (
                  agent && (
                    // speaking now → message bubble (with a brief typing indicator);
                    // otherwise → "ว่าง" status chip
                    speaking ? (
                      <div className="absolute bottom-full left-1/2 mb-1 w-max max-w-[190px] -translate-x-1/2 rounded-2xl rounded-b-sm bg-white/95 px-3 py-1.5 text-[11px] leading-snug text-gray-900 shadow-xl">
                        <span className="mb-0.5 block text-[9px] font-bold" style={{ color: STATUS_COLOR.busy }}>
                          {agent.name}
                        </span>
                        {sim.typing ? (
                          <span className="inline-flex gap-0.5 py-0.5 align-middle">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                          </span>
                        ) : (
                          sim.text
                        )}
                        {/* tail pointing down to the character spot */}
                        <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/95" />
                      </div>
                    ) : (
                      <div
                        className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
                        style={{ background: STATUS_COLOR.idle }}
                      >
                        ว่าง
                      </div>
                    )
                  )
                )}

                {/* name below the circle — edit only */}
                {editMode && (
                  <div className="absolute top-full left-1/2 mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-white">
                    {agent?.name ?? "(ไม่ได้ผูก agent)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* edit panel */}
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
                <p className="text-[10px] text-white/40">กด “+ เพิ่ม” แล้วลากตัวละครไปวางบนรูป</p>
              )}
            </div>

            {activeTemplate && (
              <button
                onClick={async () => {
                  if (confirm(`ลบเทมเพลต “${activeTemplate.name}”?`)) {
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

        {/* empty state — no templates at all */}
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
    </div>
  );
}

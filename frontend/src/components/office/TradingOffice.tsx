"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { useTemplatesStore, resolveAssetUrl, type Marker } from "@/store/officeTemplates";
import { RefreshCw, Pencil } from "lucide-react";

interface DeskChar {
  key: string;
  name: string;
  emoji: string;
  role: string;
  message: string;
}

type Pos = { x: number; y: number; scale: number };

// default standing positions (% of stage) when nothing saved yet
const DEFAULTS: Record<string, Pos> = {
  coach:   { x: 50, y: 30, scale: 1 },
  analyst: { x: 23, y: 46, scale: 1 },
  news:    { x: 77, y: 46, scale: 1 },
  exec:    { x: 50, y: 52, scale: 1 },
  risk:    { x: 23, y: 72, scale: 1 },
  monitor: { x: 77, y: 72, scale: 1 },
  trader:  { x: 50, y: 78, scale: 1 },
};

const COLORS: Record<string, string> = {
  trader: "#22d3ee", analyst: "#a78bfa", news: "#f59e0b",
  risk: "#f87171", coach: "#4ade80", monitor: "#60a5fa", exec: "#ec4899",
};

const ORDER = ["coach", "analyst", "news", "exec", "risk", "monitor", "trader"];

interface Props {
  officeName: string;
}

function loadPositions(markers: Marker[] | undefined): Record<string, Pos> {
  const map: Record<string, Pos> = JSON.parse(JSON.stringify(DEFAULTS));
  (markers ?? []).forEach((m) => {
    if (DEFAULTS[m.agent_id]) map[m.agent_id] = { x: m.x, y: m.y, scale: m.scale || 1 };
  });
  return map;
}

export default function TradingOffice({ officeName }: Props) {
  const { current } = useWorkspaceStore();
  const { activeTemplate, fetchTemplates, updateTemplate, createTemplate, saving } = useTemplatesStore();

  const [chars, setChars] = useState<DeskChar[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const prevMsg = useRef<Record<string, string>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  // edit mode
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, Pos>>(DEFAULTS);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { if (current) fetchTemplates(current.id); }, [current, fetchTemplates]);

  // sync positions from active template (when not editing)
  useEffect(() => {
    if (!editMode) setPositions(loadPositions(activeTemplate?.markers));
  }, [activeTemplate, editMode]);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await api.get(`/trading/desk/workspace/${current.id}`);
      const next: DeskChar[] = r.data.characters ?? [];
      const changed: Record<string, boolean> = {};
      next.forEach((c) => {
        if (prevMsg.current[c.key] && prevMsg.current[c.key] !== c.message) changed[c.key] = true;
        prevMsg.current[c.key] = c.message;
      });
      setChars(next);
      setFlash(changed);
      setUpdated(new Date());
      setTimeout(() => setFlash({}), 2500);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [current]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!current || editMode) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [current, editMode, load]);

  // ── drag (edit mode) ──
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };
  useEffect(() => {
    if (!editMode) return;
    const onMove = (e: MouseEvent) => {
      if (!dragId.current) return;
      const { x, y } = pctFromEvent(e);
      setPositions((p) => ({ ...p, [dragId.current!]: { ...p[dragId.current!], x, y } }));
    };
    const onUp = () => { dragId.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editMode]);

  const onUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
    setDraftImage(data.url);
  };

  const enterEdit = () => {
    setPositions(loadPositions(activeTemplate?.markers));
    setDraftImage(activeTemplate?.image_url ?? null);
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!current) return;
    const markers: Marker[] = ORDER.map((k) => ({
      id: `desk_${k}`, agent_id: k, x: positions[k].x, y: positions[k].y, scale: positions[k].scale,
    }));
    let templateId = activeTemplate?.id;
    if (!templateId) {
      const t = await createTemplate(current.id, "Trading Floor");
      templateId = t.id;
    }
    await updateTemplate(templateId!, { image_url: draftImage, markers });
    setEditMode(false);
    setSelected(null);
  };

  const bg = resolveAssetUrl(editMode ? draftImage : (activeTemplate?.image_url ?? null));
  const charByKey = (k: string) => chars.find((c) => c.key === k);

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent">
      {/* toolbar */}
      <div className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-2 backdrop-blur">
        <span className="text-sm font-semibold text-white">{officeName}</span>
        <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold text-accent-300">
          Trading Floor · 7 ตัวช่วย · live
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/40">
          {!editMode && loading && <RefreshCw size={12} className="animate-spin" />}
          {!editMode && updated && <span className="hidden sm:inline">อัปเดต {updated.toLocaleTimeString()}</span>}
          {!editMode ? (
            <>
              <button onClick={load} className="rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">รีเฟรช</button>
              <button onClick={enterEdit} className="flex items-center gap-1 rounded-md bg-primary-500 px-3 py-1 font-semibold text-white hover:bg-primary-600">
                <Pencil size={12} /> แก้ไข Office
              </button>
            </>
          ) : (
            <>
              <label className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">
                อัปโหลดฉาก
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </label>
              <button onClick={() => { setEditMode(false); setSelected(null); }} className="rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">ยกเลิก</button>
              <button onClick={saveEdit} disabled={saving}
                className="rounded-md bg-accent-500 px-3 py-1 font-semibold text-black hover:bg-accent-400 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* scene */}
      <div ref={stageRef} className="relative flex-1 select-none overflow-hidden"
        onClick={() => editMode && setSelected(null)}>
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="office" className="absolute inset-0 h-full w-full object-cover opacity-60" draggable={false} />
        ) : (
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 20%, #1a1040 0%, #0e0b16 70%)" }} />
        )}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        {editMode && (
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70">
            ลากตัวละครเพื่อจัดตำแหน่ง · คลิกเพื่อปรับขนาด
          </div>
        )}

        {ORDER.map((key) => {
          const c = charByKey(key);
          const pos = positions[key] ?? DEFAULTS[key];
          const color = COLORS[key] ?? "#a78bfa";
          const name = c?.name ?? key;
          const isSel = selected === key;
          return (
            <div key={key}
              className={`absolute flex flex-col items-center ${editMode ? "cursor-move" : ""}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%,-50%) scale(${pos.scale})` }}
              onMouseDown={(e) => { if (editMode) { e.stopPropagation(); dragId.current = key; setSelected(key); } }}
              onClick={(e) => editMode && e.stopPropagation()}>
              {/* bubble (view) or status (edit) */}
              {!editMode && c && (
                <div className={`mb-1 w-max max-w-[200px] rounded-2xl bg-white/95 px-3 py-2 text-[11px] leading-snug text-gray-900 shadow-xl transition-all ${flash[key] ? "ring-2 ring-accent-400 scale-105" : ""}`}>
                  <span className="mb-0.5 block text-[9px] font-bold" style={{ color }}>{name}</span>
                  <span>{c.message}</span>
                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/95" />
                </div>
              )}
              {/* avatar */}
              <button
                onClick={() => !editMode && setSelected(isSel ? null : key)}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl shadow-xl transition ${editMode && isSel ? "ring-2 ring-accent-400/60" : ""} ${editMode ? "" : "hover:scale-110"}`}
                style={{ borderColor: color, background: "#1a1626" }}>
                {c?.emoji ?? "🙂"}
              </button>
              <span className="mt-0.5 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-white">
                {name}{c?.role === "engine" ? " ⚙️" : ""}
              </span>
            </div>
          );
        })}

        {/* scale slider for selected (edit) */}
        {editMode && selected && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 backdrop-blur"
            onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-white/60">ขนาด {charByKey(selected)?.name ?? selected}</span>
            <input type="range" min={0.6} max={1.8} step={0.1}
              value={positions[selected]?.scale ?? 1}
              onChange={(e) => setPositions((p) => ({ ...p, [selected]: { ...p[selected], scale: parseFloat(e.target.value) } }))}
              className="w-40 accent-primary-500" />
          </div>
        )}

        {chars.length === 0 && !editMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/50">กำลังเรียกทีมเทรด…</p>
          </div>
        )}
      </div>
    </div>
  );
}

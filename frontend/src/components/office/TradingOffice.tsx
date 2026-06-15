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

// ── bubble stream timings ──
const SHOW_MS = 5000;    // hold the full message 5s, then float away
const STREAM_MS = 35;    // typewriter tick
const CHARS_PER_TICK = 2;
const FADE_MS = 600;
const STAGGER_MS = 900;  // gap between characters reacting to fresh data
const POLL_MS = 15_000;  // refresh desk data (prices move → new things to say)

type Phase = "stream" | "show" | "fade";
type Bubble = { text: string; idx: number; phase: Phase; born: number };

interface Props { officeName: string; }

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
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);  // worker hasn't produced a snapshot yet

  // edit mode
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, Pos>>(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  // ── bubble engine ──
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const lastSpoken = useRef<Record<string, string>>({});  // last message streamed per char

  useEffect(() => { if (current) fetchTemplates(current.id); }, [current, fetchTemplates]);
  useEffect(() => { if (!editMode) setPositions(loadPositions(activeTemplate?.markers)); }, [activeTemplate, editMode]);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await api.get(`/trading/desk/workspace/${current.id}`);
      setChars(r.data.characters ?? []);
      setUpdated(new Date());
      setError(null);
      setWarming(r.data.status === "warming_up");
    } catch {
      setError("โหลดข้อมูลโต๊ะเทรดไม่ได้ — ลองรีเฟรช");
    } finally { setLoading(false); }
  }, [current]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!current || editMode) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [current, editMode, load]);

  // speak ONLY when a character's message is new (fresh data/analysis) —
  // no blind re-streaming of the same line. Stagger so they don't all talk at once.
  useEffect(() => {
    if (editMode) { setBubbles({}); return; }
    const fresh = chars.filter((c) => c.message && lastSpoken.current[c.key] !== c.message);
    if (fresh.length === 0) return;
    const timers = fresh.map((c, i) =>
      setTimeout(() => {
        lastSpoken.current[c.key] = c.message;
        setBubbles((b) => ({ ...b, [c.key]: { text: c.message, idx: 0, phase: "stream", born: Date.now() } }));
      }, i * STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [chars, editMode]);

  // streaming (typewriter)
  useEffect(() => {
    if (editMode) return;
    const t = setInterval(() => {
      setBubbles((prev) => {
        let changed = false;
        const next: Record<string, Bubble> = { ...prev };
        for (const k in next) {
          const s = next[k];
          if (s.phase !== "stream") continue;
          const ni = Math.min(s.idx + CHARS_PER_TICK, s.text.length);
          next[k] = ni >= s.text.length ? { ...s, idx: ni, phase: "show", born: Date.now() } : { ...s, idx: ni };
          changed = true;
        }
        return changed ? next : prev;
      });
    }, STREAM_MS);
    return () => clearInterval(t);
  }, [editMode]);

  // show -> fade -> remove (float away after 5s)
  useEffect(() => {
    if (editMode) return;
    const t = setInterval(() => {
      setBubbles((prev) => {
        let changed = false;
        const next: Record<string, Bubble> = { ...prev };
        const now = Date.now();
        for (const k in next) {
          const s = next[k];
          if (s.phase === "show" && now - s.born > SHOW_MS) { next[k] = { ...s, phase: "fade", born: now }; changed = true; }
          else if (s.phase === "fade" && now - s.born > FADE_MS) { delete next[k]; changed = true; }
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => clearInterval(t);
  }, [editMode]);

  // ── drag (edit) ──
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
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
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
    let id = activeTemplate?.id;
    if (!id) id = (await createTemplate(current.id, "Trading Floor")).id;
    await updateTemplate(id, { image_url: draftImage, markers });
    setEditMode(false);
    setSelected(null);
  };

  const bg = resolveAssetUrl(editMode ? draftImage : (activeTemplate?.image_url ?? null));
  const charByKey = (k: string) => chars.find((c) => c.key === k);

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent">
      {/* single slim toolbar */}
      <div className="z-10 flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-1.5 backdrop-blur">
        <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold text-accent-300">
          🏢 Trading Floor · live
        </span>
        {!editMode && error && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
            ⚠️ {error}
          </span>
        )}
        {!editMode && !error && warming && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            ⏳ worker กำลังเริ่มประมวลผล…
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/40">
          {!editMode && loading && <RefreshCw size={12} className="animate-spin" />}
          {!editMode && updated && <span className="hidden sm:inline">{updated.toLocaleTimeString()}</span>}
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
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </label>
              <button onClick={() => { setEditMode(false); setSelected(null); }} className="rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">ยกเลิก</button>
              <button onClick={saveEdit} disabled={saving} className="rounded-md bg-accent-500 px-3 py-1 font-semibold text-black hover:bg-accent-400 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* scene */}
      <div ref={stageRef} className="relative flex-1 select-none overflow-hidden" onClick={() => editMode && setSelected(null)}>
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="office" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 20%, #1a1040 0%, #0e0b16 70%)" }} />
        )}

        {editMode && (
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70">
            ลากตัวละครเพื่อจัดตำแหน่ง · คลิกเพื่อปรับขนาด
          </div>
        )}

        {/* ── EDIT MODE: draggable avatars (no bubbles) ── */}
        {editMode && ORDER.map((key) => {
          const c = charByKey(key);
          const pos = positions[key] ?? DEFAULTS[key];
          const color = COLORS[key] ?? "#a78bfa";
          const isSel = selected === key;
          return (
            <div key={key} className="absolute flex cursor-move flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%,-50%) scale(${pos.scale})` }}
              onMouseDown={(e) => { e.stopPropagation(); dragId.current = key; setSelected(key); }}
              onClick={(e) => e.stopPropagation()}>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl shadow-xl ${isSel ? "ring-2 ring-accent-400/60" : ""}`}
                style={{ borderColor: color, background: "#1a1626" }}>
                {c?.emoji ?? "🙂"}
              </div>
              <span className="mt-0.5 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-white">
                {c?.name ?? key}{c?.role === "engine" ? " ⚙️" : ""}
              </span>
            </div>
          );
        })}

        {/* ── VIEW MODE: bubbles only (streaming, turn-based, fade) ── */}
        {!editMode && ORDER.map((key) => {
          const b = bubbles[key];
          if (!b) return null;
          const c = charByKey(key);
          if (!c) return null;
          const pos = positions[key] ?? DEFAULTS[key];
          const color = COLORS[key] ?? "#a78bfa";
          const shown = b.text.slice(0, b.idx);
          const fading = b.phase === "fade";
          const streaming = b.phase === "stream";
          return (
            <div key={key}
              className="absolute flex flex-col items-center transition-all duration-500"
              style={{
                left: `${pos.x}%`, top: `${pos.y}%`,
                transform: `translate(-50%,-100%) ${fading ? "translateY(-12px)" : ""} scale(${pos.scale})`,
                opacity: fading ? 0 : 1,
              }}>
              <div className="w-max max-w-[230px] rounded-2xl bg-white/95 px-3 py-2 text-[12px] leading-snug text-gray-900 shadow-2xl"
                style={{ borderBottom: `3px solid ${color}` }}>
                {/* speaker header (who is talking) */}
                <span className="mb-0.5 flex items-center gap-1 text-[10px] font-bold" style={{ color }}>
                  <span className="text-sm leading-none">{c.emoji}</span>
                  {c.name}{c.role === "engine" ? " ⚙️" : ""}
                </span>
                <span>
                  {shown}
                  {streaming && <span className="ml-px inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse rounded-sm bg-gray-500" />}
                </span>
                {/* directional tail pointing down to the speaker's spot */}
                <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white/95"
                  style={{ borderRight: `3px solid ${color}`, borderBottom: `3px solid ${color}` }} />
              </div>
              {/* anchor dot = where the speaker stands */}
              <span className="mt-2 h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
            </div>
          );
        })}

        {/* scale slider (edit) */}
        {editMode && selected && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-black/60 px-3 py-2 backdrop-blur"
            onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-white/60">ขนาด {charByKey(selected)?.name ?? selected}</span>
            <input type="range" min={0.6} max={1.8} step={0.1} value={positions[selected]?.scale ?? 1}
              onChange={(e) => setPositions((p) => ({ ...p, [selected]: { ...p[selected], scale: parseFloat(e.target.value) } }))}
              className="w-40 accent-primary-500" />
          </div>
        )}
      </div>
    </div>
  );
}

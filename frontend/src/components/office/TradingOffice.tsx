"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { useTemplatesStore, resolveAssetUrl } from "@/store/officeTemplates";
import { RefreshCw } from "lucide-react";

interface DeskChar {
  key: string;
  name: string;
  emoji: string;
  role: string;
  message: string;
}

// where each character stands on the scene (% of the stage)
const POSITIONS: Record<string, { x: number; y: number }> = {
  coach:   { x: 50, y: 30 },   // head of the desk (back center)
  analyst: { x: 23, y: 46 },
  news:    { x: 77, y: 46 },
  exec:    { x: 50, y: 52 },
  risk:    { x: 23, y: 72 },
  monitor: { x: 77, y: 72 },
  trader:  { x: 50, y: 78 },   // front center (executes)
};

const COLORS: Record<string, string> = {
  trader: "#22d3ee", analyst: "#a78bfa", news: "#f59e0b",
  risk: "#f87171", coach: "#4ade80", monitor: "#60a5fa", exec: "#ec4899",
};

interface Props {
  officeName: string;
}

export default function TradingOffice({ officeName }: Props) {
  const { current } = useWorkspaceStore();
  const { activeTemplate, fetchTemplates } = useTemplatesStore();
  const [chars, setChars] = useState<DeskChar[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const prevMsg = useRef<Record<string, string>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  useEffect(() => { if (current) fetchTemplates(current.id); }, [current, fetchTemplates]);

  const load = async () => {
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
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current]);
  useEffect(() => {
    if (!current) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [current]);

  const bg = resolveAssetUrl(activeTemplate?.image_url ?? null);

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent">
      {/* toolbar */}
      <div className="z-10 flex items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-2 backdrop-blur">
        <span className="text-sm font-semibold text-white">{officeName}</span>
        <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold text-accent-300">
          Trading Floor · 7 ตัวช่วย · live
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/40">
          {loading && <RefreshCw size={12} className="animate-spin" />}
          {updated && <span>อัปเดต {updated.toLocaleTimeString()} · ทุก 30 วิ</span>}
          <button onClick={load} className="rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">
            รีเฟรช
          </button>
        </div>
      </div>

      {/* scene */}
      <div className="relative flex-1 overflow-hidden">
        {/* background */}
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="office" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        ) : (
          <div className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 20%, #1a1040 0%, #0e0b16 70%)" }} />
        )}
        {/* subtle floor grid */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        {/* characters */}
        {chars.map((c) => {
          const pos = POSITIONS[c.key] ?? { x: 50, y: 50 };
          const color = COLORS[c.key] ?? "#a78bfa";
          const isSel = selected === c.key;
          return (
            <div key={c.key}
              className="absolute flex flex-col items-center"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)" }}>
              {/* speech bubble */}
              <div
                className={`mb-1 w-max max-w-[200px] rounded-2xl bg-white/95 px-3 py-2 text-[11px] leading-snug text-gray-900 shadow-xl transition-all ${
                  flash[c.key] ? "ring-2 ring-accent-400 scale-105" : ""
                }`}
              >
                <span className="mb-0.5 block text-[9px] font-bold" style={{ color }}>{c.name}</span>
                <span>{c.message}</span>
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/95" />
              </div>
              {/* avatar */}
              <button
                onClick={() => setSelected(isSel ? null : c.key)}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl shadow-xl transition hover:scale-110"
                style={{ borderColor: color, background: "#1a1626" }}
                title={c.role === "engine" ? "engine (deterministic)" : "advisory"}
              >
                {c.emoji}
              </button>
              {/* name */}
              <span className="mt-0.5 whitespace-nowrap rounded bg-black/50 px-1.5 text-[10px] text-white">
                {c.name}{c.role === "engine" ? " ⚙️" : ""}
              </span>
            </div>
          );
        })}

        {chars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/50">กำลังเรียกทีมเทรด…</p>
          </div>
        )}
      </div>
    </div>
  );
}

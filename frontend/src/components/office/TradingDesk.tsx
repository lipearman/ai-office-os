"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import { TrendingUp, ChevronDown, RefreshCw } from "lucide-react";

interface DeskChar {
  key: string;
  name: string;
  emoji: string;
  role: string;
  message: string;
}

/**
 * Floating "Trading Desk" overlay for /office — 7 characters speaking from
 * live trading data (positions, opportunities, news, stats). Non-invasive:
 * sits on top of the office scene, polls /trading/desk every 30s.
 */
export default function TradingDesk() {
  const { current } = useWorkspaceStore();
  const [chars, setChars] = useState<DeskChar[]>([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const prevMsg = useRef<Record<string, string>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await api.get(`/trading/desk/workspace/${current.id}`);
      const next: DeskChar[] = r.data.characters ?? [];
      // flash characters whose message changed
      const changed: Record<string, boolean> = {};
      next.forEach((c) => {
        if (prevMsg.current[c.key] && prevMsg.current[c.key] !== c.message) changed[c.key] = true;
        prevMsg.current[c.key] = c.message;
      });
      setChars(next);
      setFlash(changed);
      setUpdated(new Date());
      setTimeout(() => setFlash({}), 2000);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current]);
  useEffect(() => {
    if (!current) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [current]);

  if (!current) return null;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-80 max-w-[calc(100%-2rem)]">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141228]/90 shadow-2xl backdrop-blur-md">
        {/* header */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 border-b border-white/10 px-3 py-2"
        >
          <TrendingUp size={14} className="text-accent-400" />
          <span className="text-xs font-semibold text-white">Trading Desk</span>
          <span className="text-[9px] text-white/30">7 ตัวช่วย · live</span>
          <div className="flex-1" />
          {loading && <RefreshCw size={11} className="animate-spin text-white/40" />}
          <ChevronDown size={13} className={`text-white/40 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>

        {open && (
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-2">
            {chars.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-white/30">กำลังโหลดทีมเทรด…</p>
            )}
            {chars.map((c) => (
              <div
                key={c.key}
                className={`flex gap-2 rounded-lg border p-2 transition-colors ${
                  flash[c.key] ? "border-accent-400/60 bg-accent-500/10" : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <span className="text-lg leading-none">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-white">{c.name}</span>
                    {c.role === "engine" && (
                      <span className="rounded bg-accent-500/20 px-1 text-[8px] font-semibold text-accent-300">engine</span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-white/70">{c.message}</p>
                </div>
              </div>
            ))}
            {updated && (
              <p className="px-1 pt-1 text-right text-[9px] text-white/25">
                อัปเดต {updated.toLocaleTimeString()} · ทุก 30 วิ
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

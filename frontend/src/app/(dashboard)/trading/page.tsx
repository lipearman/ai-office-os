"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import {
  TrendingUp, RefreshCw, Plus, X, Search, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus as MinusIcon,
} from "lucide-react";

interface WatchItem {
  id: string;
  symbol: string;
  enabled: boolean;
  strategies: string[];
}

interface ScanResult {
  symbol: string;
  signal: "BUY" | "SELL" | "HOLD";
  strength: number;
  alignment_score: number;
  bias: string;
  reason: string;
  warnings: string[];
  price: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
}

const SIGNAL_STYLE: Record<string, { bg: string; fg: string; Icon: any; label: string }> = {
  BUY:  { bg: "rgba(34,197,94,0.15)",  fg: "#4ade80", Icon: ArrowUpRight,   label: "BUY" },
  SELL: { bg: "rgba(239,68,68,0.15)",  fg: "#f87171", Icon: ArrowDownRight, label: "SELL" },
  HOLD: { bg: "rgba(148,163,184,0.12)", fg: "#94a3b8", Icon: MinusIcon,     label: "HOLD" },
};

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function TradingPage() {
  const { current } = useWorkspaceStore();

  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [results, setResults]     = useState<ScanResult[]>([]);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [scanning, setScanning]   = useState(false);
  const [lastScan, setLastScan]   = useState<Date | null>(null);
  const [selected, setSelected]   = useState<string | null>(null);
  const [brief, setBrief]         = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // ── load watchlist + symbol list ──
  const loadWatchlist = () => {
    if (!current) return;
    api.get(`/trading/watchlist/workspace/${current.id}`)
      .then((r) => setWatchlist(r.data)).catch(() => {});
  };
  useEffect(loadWatchlist, [current]);

  useEffect(() => {
    api.get(`/trading/symbols`)
      .then((r) => setAllSymbols(r.data.map((s: any) => s.symbol)))
      .catch(() => {});
  }, []);

  // ── scan ──
  const runScan = async () => {
    if (!current) return;
    setScanning(true);
    setError(null);
    try {
      const r = await api.get(`/trading/scan/workspace/${current.id}`);
      setResults(r.data.results);
      setLastScan(new Date());
    } catch (e: any) {
      setError("สแกนไม่สำเร็จ — ตรวจสอบว่า backend ทำงานอยู่");
    } finally {
      setScanning(false);
    }
  };

  // auto-scan once watchlist is loaded
  useEffect(() => {
    if (current && watchlist.length > 0 && results.length === 0) runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, watchlist.length]);

  // ── add / remove watchlist ──
  const addSymbol = async () => {
    if (!current || !newSymbol.trim()) return;
    try {
      await api.post(`/trading/watchlist/workspace/${current.id}`, { symbol: newSymbol.trim().toUpperCase() });
      setNewSymbol("");
      loadWatchlist();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "เพิ่มเหรียญไม่สำเร็จ");
    }
  };

  const removeSymbol = async (id: string) => {
    try {
      await api.delete(`/trading/watchlist/${id}`);
      loadWatchlist();
      setResults((rs) => rs.filter((r) => watchlist.find((w) => w.id === id)?.symbol !== r.symbol));
    } catch { /* ignore */ }
  };

  // ── daily brief detail ──
  const openBrief = async (symbol: string) => {
    setSelected(symbol);
    setBriefLoading(true);
    setBrief(null);
    try {
      const r = await api.get(`/trading/analyze/${symbol}`);
      setBrief(r.data);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { BUY: 0, SELL: 0, HOLD: 0 };
    results.forEach((r) => { c[r.signal] = (c[r.signal] ?? 0) + 1; });
    return c;
  }, [results]);

  return (
    <div className="animate-fade-in mx-auto w-full max-w-6xl">
      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <TrendingUp size={22} className="text-accent-400" />
            Daily Trading Intelligence
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Multi-Timeframe (1D→4H→1H→15M) · Bitkub · Paper mode
            {lastScan && <span className="ml-2 text-white/30">· สแกนล่าสุด {lastScan.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning || !current}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:opacity-50"
        >
          <RefreshCw size={15} className={scanning ? "animate-spin" : ""} />
          {scanning ? "กำลังสแกน…" : "สแกนสัญญาณ"}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* signal summary */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {(["BUY", "SELL", "HOLD"] as const).map((sig) => {
          const st = SIGNAL_STYLE[sig];
          return (
            <div key={sig} className="rounded-xl border border-white/10 bg-[#141228]/70 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{st.label}</span>
                <div className="rounded-lg p-1.5" style={{ background: st.bg }}>
                  <st.Icon size={14} style={{ color: st.fg }} />
                </div>
              </div>
              <p className="mt-1 text-2xl font-bold" style={{ color: st.fg }}>{counts[sig]}</p>
            </div>
          );
        })}
      </div>

      {/* watchlist add bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            list="symbol-list"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            placeholder="เพิ่มเหรียญ เช่น BTC_THB"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/30 focus:border-accent-500/50 focus:outline-none"
          />
          <datalist id="symbol-list">
            {allSymbols.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <button
          onClick={addSymbol}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white transition hover:bg-white/10"
        >
          <Plus size={14} /> เพิ่ม
        </button>
      </div>

      {/* watchlist chips */}
      {watchlist.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {watchlist.map((w) => (
            <span key={w.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              {w.symbol}
              <button onClick={() => removeSymbol(w.id)} className="text-white/30 hover:text-red-400">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* scanner table */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white/70">
              Signal Scanner
            </div>
            {results.length === 0 && !scanning && (
              <div className="px-4 py-10 text-center text-sm text-white/30">
                {watchlist.length === 0 ? "เพิ่มเหรียญใน watchlist แล้วกดสแกน" : "กด “สแกนสัญญาณ” เพื่อเริ่ม"}
              </div>
            )}
            {scanning && results.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-white/40">กำลังวิเคราะห์ทุก timeframe…</div>
            )}
            {results.map((r) => {
              const st = SIGNAL_STYLE[r.signal];
              return (
                <button
                  key={r.symbol}
                  onClick={() => openBrief(r.symbol)}
                  className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.03] ${
                    selected === r.symbol ? "bg-white/[0.04]" : ""
                  }`}
                >
                  {/* signal badge */}
                  <span className="flex w-16 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold"
                    style={{ background: st.bg, color: st.fg }}>
                    <st.Icon size={12} /> {st.label}
                  </span>
                  {/* symbol */}
                  <span className="w-24 shrink-0 font-semibold text-white">{r.symbol}</span>
                  {/* strength bar */}
                  <div className="hidden flex-1 sm:block">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${r.strength * 100}%`, background: st.fg }} />
                    </div>
                    <span className="mt-0.5 block truncate text-[10px] text-white/35">{r.reason}</span>
                  </div>
                  {/* price */}
                  <span className="w-24 shrink-0 text-right text-sm text-white/70">{fmtPrice(r.price)}</span>
                  {/* warnings */}
                  <span className="w-8 shrink-0 text-right">
                    {r.warnings.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/70" title={r.warnings.join("\n")}>
                        <AlertTriangle size={11} /> {r.warnings.length}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* daily brief detail */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-white/10 bg-[#141228]/70 p-4 backdrop-blur-md">
            <p className="mb-3 text-sm font-semibold text-white/70">📋 Daily Brief</p>
            {!selected && <p className="text-xs text-white/30">เลือกเหรียญจากตารางเพื่อดูแผนเทรด</p>}
            {briefLoading && <p className="text-xs text-white/40">กำลังวิเคราะห์…</p>}
            {brief && (
              <div className="space-y-3">
                <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/80">
                  {brief.brief.text}
                </pre>

                {brief.brief.plan?.entry && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { k: "Entry", v: brief.brief.plan.entry, c: "#22d3ee" },
                      { k: "Stop",  v: brief.brief.plan.stop,  c: "#f87171" },
                      { k: "Target",v: brief.brief.plan.target,c: "#4ade80" },
                    ].map(({ k, v, c }) => (
                      <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                        <p className="text-[9px] uppercase text-white/40">{k}</p>
                        <p className="text-xs font-bold" style={{ color: c }}>{fmtPrice(v)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {brief.brief.reasons?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase text-white/40">เหตุผล</p>
                    {brief.brief.reasons.map((x: string, i: number) => (
                      <p key={i} className="flex gap-1.5 text-[11px] text-green-300/80">
                        <span>✓</span>{x}
                      </p>
                    ))}
                  </div>
                )}

                {brief.brief.warnings?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase text-white/40">ข้อควรระวัง</p>
                    {brief.brief.warnings.map((x: string, i: number) => (
                      <p key={i} className="flex gap-1.5 text-[11px] text-amber-300/80">
                        <span>⚠</span>{x}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

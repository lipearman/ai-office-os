"use client";

// Daily Trading Intelligence — scanner, opportunities, backtest/optimizer/ML, paper trading
import { useEffect, useMemo, useState, useRef } from "react";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";
import {
  TrendingUp, RefreshCw, Plus, X, Search, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus as MinusIcon, Bell, BellOff,
} from "lucide-react";

interface WatchItem {
  id: string;
  symbol: string;
  enabled: boolean;
  strategies: any[];
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

  // ── backtest ──
  const [btSymbol, setBtSymbol]   = useState("BTC_THB");
  const [btTf, setBtTf]           = useState("4H");
  const [btResult, setBtResult]   = useState<any>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btView, setBtView]       = useState<"validated" | "baseline">("validated");

  // ── auto-optimizer + ML (AI, human-gated) ──
  const [optResult, setOptResult] = useState<any>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [mlResult, setMlResult]   = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(false);

  // ── today's opportunities ──
  const [opps, setOpps]           = useState<any[]>([]);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [oppsRun, setOppsRun]     = useState(false);

  // ── news & sentiment ──
  const [news, setNews]           = useState<any>(null);
  const [newsLoading, setNewsLoading] = useState(false);

  // ── paper trading ──
  const [paperStats, setPaperStats]   = useState<any>(null);
  const [paperPos, setPaperPos]       = useState<any[]>([]);
  const [paperTrades, setPaperTrades] = useState<any[]>([]);
  const [paperBusy, setPaperBusy]     = useState(false);

  // ── auto-alerts (loop เช็ครอบ) ──
  const [alertsOn, setAlertsOn]   = useState(false);
  const [alertMsgs, setAlertMsgs] = useState<{ id: number; text: string }[]>([]);
  const prevSignals = useRef<Set<string>>(new Set());
  const alertCheckedOnce = useRef(false);
  const serverAlertSeen = useRef<Set<string>>(new Set());
  const serverAlertFirst = useRef(true);

  // ── alert center (persistent history + read state) ──
  type ServerAlert = { id: string; text: string; symbol: string; is_read: boolean; ts: number | null };
  const [alertHistory, setAlertHistory] = useState<ServerAlert[]>([]);
  const [alertUnread, setAlertUnread] = useState(0);
  const [showAlertCenter, setShowAlertCenter] = useState(false);
  const markAllRead = async () => {
    if (!current) return;
    await api.post(`/trading/alerts/workspace/${current.id}/read-all`).catch(() => {});
    setAlertHistory((h) => h.map((a) => ({ ...a, is_read: true })));
    setAlertUnread(0);
  };
  const markRead = async (id: string) => {
    await api.post(`/trading/alerts/${id}/read`).catch(() => {});
    setAlertHistory((h) => h.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    setAlertUnread((n) => Math.max(0, n - 1));
  };

  // ── load watchlist + symbol list ──
  const loadWatchlist = () => {
    if (!current) return;
    api.get(`/trading/watchlist/workspace/${current.id}`)
      .then((r) => setWatchlist(r.data)).catch(() => {});
  };
  useEffect(loadWatchlist, [current]);

  // keep backtest symbol valid: default to a watchlist symbol if current isn't one
  useEffect(() => {
    if (watchlist.length > 0 && !watchlist.some((w) => w.symbol === btSymbol)) {
      setBtSymbol(watchlist[0].symbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

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
      loadOpportunities();   // win-chance per symbol, shown inline in the table
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

  const runBacktest = async () => {
    if (!btSymbol.trim()) return;
    setBtLoading(true);
    setBtResult(null);
    try {
      const r = await api.get(`/trading/backtest/${btSymbol.trim().toUpperCase()}`, {
        params: { timeframe: btTf, limit: 1500 },
      });
      setBtResult(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "backtest ไม่สำเร็จ");
    } finally {
      setBtLoading(false);
    }
  };

  const loadNews = async () => {
    if (!current) return;
    setNewsLoading(true);
    try {
      const r = await api.get(`/trading/news/workspace/${current.id}`);
      setNews(r.data);
    } catch { /* ignore */ } finally { setNewsLoading(false); }
  };
  useEffect(() => { loadNews(); /* eslint-disable-next-line */ }, [current]);

  const loadPaper = async () => {
    if (!current) return;
    try {
      const [s, p, t] = await Promise.all([
        api.get(`/trading/paper/stats/workspace/${current.id}`),
        api.get(`/trading/paper/positions/workspace/${current.id}`),
        api.get(`/trading/paper/trades/workspace/${current.id}`),
      ]);
      setPaperStats(s.data);
      setPaperPos(p.data.positions);
      setPaperTrades(t.data.trades);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadPaper(); /* eslint-disable-next-line */ }, [current]);

  const openPaper = async (o: any) => {
    if (!current) return;
    setPaperBusy(true);
    try {
      await api.post(`/trading/paper/open/workspace/${current.id}`, {
        symbol: o.symbol,
        size_thb: 10000,
        timeframe: o.timeframe ?? "1H",
        strategy: o.strategy ?? "manual",
        stop: o.plan?.stop ?? null,
        target: o.plan?.target ?? null,
        rationale: o.reasons?.[0] ?? o.label ?? "manual",
      });
      await loadPaper();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "เปิด paper ไม่สำเร็จ");
    } finally {
      setPaperBusy(false);
    }
  };

  const closePaper = async (id: string) => {
    setPaperBusy(true);
    try {
      await api.post(`/trading/paper/close/${id}`);
      await loadPaper();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "ปิด paper ไม่สำเร็จ");
    } finally {
      setPaperBusy(false);
    }
  };

  const loadOpportunities = async () => {
    if (!current) return;
    setOppsLoading(true);
    setOppsRun(true);
    try {
      const r = await api.get(`/trading/opportunities/workspace/${current.id}`);
      setOpps(r.data.results);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "ประเมินโอกาสไม่สำเร็จ");
    } finally {
      setOppsLoading(false);
    }
  };

  const runOptimize = async () => {
    if (!btSymbol.trim()) return;
    setOptLoading(true);
    setOptResult(null);
    try {
      const r = await api.get(`/trading/optimize/${btSymbol.trim().toUpperCase()}`, {
        params: { timeframe: btTf, limit: 2000 },
      });
      setOptResult(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "optimize ไม่สำเร็จ");
    } finally {
      setOptLoading(false);
    }
  };

  const applyStrategy = async () => {
    if (!optResult?.suggested) return;
    const item = watchlist.find((w) => w.symbol === optResult.symbol);
    if (!item) {
      setError(`${optResult.symbol} ไม่ได้อยู่ใน watchlist — เพิ่มก่อนจึงจะ Apply ได้`);
      return;
    }
    const config = {
      strategy: optResult.suggested.strategy,
      params: optResult.suggested.params,
      timeframe: optResult.timeframe,
      holdout: optResult.holdout,
      applied_at: new Date().toISOString(),
    };
    try {
      await api.patch(`/trading/watchlist/${item.id}`, { strategies: [config] });
      loadWatchlist();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Apply ไม่สำเร็จ");
    }
  };

  const runML = async () => {
    if (!btSymbol.trim()) return;
    setMlLoading(true);
    setMlResult(null);
    try {
      const r = await api.get(`/trading/ml/${btSymbol.trim().toUpperCase()}`, {
        params: { timeframe: btTf, limit: 2000 },
      });
      setMlResult(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "ML ไม่สำเร็จ");
    } finally {
      setMlLoading(false);
    }
  };

  const oppBySym = useMemo(
    () => Object.fromEntries(opps.map((o) => [o.symbol, o])),
    [opps]
  );

  const counts = useMemo(() => {
    const c = { BUY: 0, SELL: 0, HOLD: 0 };
    results.forEach((r) => { c[r.signal] = (c[r.signal] ?? 0) + 1; });
    return c;
  }, [results]);

  // detect symbols that NEWLY entered a setup → raise alert
  useEffect(() => {
    if (opps.length === 0) return;
    const nowSig = new Set<string>(opps.filter((o) => o.signal_today).map((o) => o.symbol));
    if (alertCheckedOnce.current) {
      const fresh = [...nowSig].filter((s) => !prevSignals.current.has(s));
      if (fresh.length) {
        const msgs = fresh.map((s) => {
          const o = opps.find((x) => x.symbol === s);
          return { id: Date.now() + Math.random(), text: `${s} เข้า setup (${o?.strategy}) — win ~${o?.win_chance_pct ?? "?"}%` };
        });
        setAlertMsgs((prev) => [...msgs, ...prev].slice(0, 5));
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          fresh.forEach((s) => new Notification("⭐ โอกาสเทรดวันนี้", { body: `${s} เข้า setup แล้ว` }));
        }
      }
    }
    prevSignals.current = nowSig;
    alertCheckedOnce.current = true;
  }, [opps]);

  // server-side alerts: poll every 60s so setups detected while away show up
  useEffect(() => {
    if (!current) return;
    const poll = async () => {
      try {
        const r = await api.get(`/trading/alerts/workspace/${current.id}`);
        const serverAlerts: any[] = r.data.alerts ?? [];
        setAlertHistory(serverAlerts);
        setAlertUnread(r.data.unread ?? 0);
        const fresh = serverAlerts.filter((a) => !serverAlertSeen.current.has(a.id));
        fresh.forEach((a) => serverAlertSeen.current.add(a.id));
        // on first poll just record (don't spam old alerts as new)
        if (!serverAlertFirst.current && fresh.length) {
          setAlertMsgs((prev) => [
            ...fresh.map((a) => ({ id: Date.now() + Math.random(), text: `🔔 ${a.text}` })),
            ...prev,
          ].slice(0, 5));
        }
        serverAlertFirst.current = false;
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // auto-alert loop: poll opportunities every 5 min while enabled
  useEffect(() => {
    if (!alertsOn || !current) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    loadOpportunities();
    const t = setInterval(loadOpportunities, 5 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsOn, current]);

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

      {/* ── Today's Opportunities ── */}
      <div className="mb-5 rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/70">⭐ โอกาสวันนี้</span>
          <span className="text-[10px] text-white/30">สัญญาณวันนี้ × สถิติชนะอดีต</span>
          <div className="flex-1" />
          <button
            onClick={() => setAlertsOn((v) => !v)}
            title={alertsOn ? "ปิดแจ้งเตือน (เช็คทุก 5 นาที)" : "เปิดแจ้งเตือนอัตโนมัติ (เช็คทุก 5 นาที)"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              alertsOn ? "bg-green-500/20 text-green-300" : "border border-white/15 text-white/60 hover:bg-white/10"
            }`}
          >
            {alertsOn ? <Bell size={13} /> : <BellOff size={13} />}
            {alertsOn ? "แจ้งเตือน: เปิด" : "แจ้งเตือน"}
          </button>
          <button onClick={loadOpportunities} disabled={oppsLoading || !current}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:opacity-50">
            <RefreshCw size={13} className={oppsLoading ? "animate-spin" : ""} />
            {oppsLoading ? "กำลังประเมิน…" : "ประเมินโอกาสวันนี้"}
          </button>
        </div>

        {/* alert center (persistent history + read state) */}
        <div className="relative flex items-center justify-end border-b border-white/10 px-4 py-1.5">
          <button onClick={() => setShowAlertCenter((s) => !s)}
            className="relative flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">
            <Bell size={12} /> Alerts
            {alertUnread > 0 && (
              <span className="ml-0.5 rounded-full bg-primary-500 px-1.5 text-[9px] font-bold text-white">{alertUnread}</span>
            )}
          </button>
          {showAlertCenter && (
            <div className="absolute right-4 top-full z-20 mt-1 max-h-[60vh] w-[320px] overflow-auto rounded-xl border border-white/15 bg-[#13111c] p-2 shadow-2xl">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-white">ประวัติ Alert</span>
                <button onClick={markAllRead} disabled={alertUnread === 0}
                  className="text-[10px] text-accent-300 hover:underline disabled:text-white/25 disabled:no-underline">อ่านทั้งหมด</button>
              </div>
              {alertHistory.length === 0 && <p className="px-1 py-3 text-center text-[10px] text-white/30">ยังไม่มี alert</p>}
              <div className="space-y-1">
                {alertHistory.map((a) => (
                  <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${a.is_read ? "border-white/5 text-white/40" : "border-green-500/30 bg-green-500/10 text-green-100"}`}>
                    <Bell size={11} className="mt-0.5 shrink-0" />
                    <span className="flex-1 leading-snug">{a.text}</span>
                    {!a.is_read && (
                      <button onClick={() => markRead(a.id)} title="ทำเครื่องหมายอ่านแล้ว" className="text-white/30 hover:text-white"><X size={11} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* alert banners */}
        {alertMsgs.length > 0 && (
          <div className="space-y-1 border-b border-white/10 px-4 py-2">
            {alertMsgs.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-[11px] text-green-200">
                <Bell size={12} /> <span className="flex-1">{m.text}</span>
                <button onClick={() => setAlertMsgs((p) => p.filter((x) => x.id !== m.id))} className="text-white/30 hover:text-white">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {alertsOn && (
          <div className="border-b border-white/10 px-4 py-1.5 text-[10px] text-white/30">
            🔔 กำลังเฝ้าดูทุก 5 นาที — จะเตือนเมื่อมีเหรียญเข้า setup ใหม่
          </div>
        )}
        {!oppsRun && !oppsLoading && (
          <p className="px-4 py-6 text-center text-xs text-white/30">
            กดเพื่อประเมินว่าวันนี้เหรียญใน watchlist เหรียญไหนมีโอกาสชนะ (ใช้กลยุทธ์ที่ผูกไว้ต่อ symbol)
          </p>
        )}
        {oppsLoading && <p className="px-4 py-6 text-center text-xs text-white/40">กำลังประเมินทุกเหรียญ…</p>}
        {oppsRun && !oppsLoading && opps.length > 0 && (
          <div className="divide-y divide-white/5">
            {opps.map((o) => (
              <div key={o.symbol} className="flex items-center gap-3 px-4 py-2.5">
                {/* rank score donut-ish */}
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <span className="text-lg font-bold" style={{
                    color: o.signal_today ? (o.win_chance_pct >= 55 ? "#4ade80" : o.win_chance_pct >= 45 ? "#f59e0b" : "#f87171") : "#64748b",
                  }}>
                    {o.win_chance_pct != null ? `${o.win_chance_pct}%` : "—"}
                  </span>
                  <span className="text-[8px] text-white/30">win chance</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{o.symbol}</span>
                    <span className="rounded bg-white/5 px-1.5 py-px text-[9px] text-white/50">
                      {o.strategy === "rsi_reversion" ? "reversion" : "pullback"} · {o.timeframe}
                    </span>
                    <span className="text-xs">{o.label}</span>
                  </div>
                  <p className="truncate text-[10px] text-white/35">{o.reasons?.[0]}{o.reasons?.[1] ? ` · ${o.reasons[1]}` : ""}</p>
                </div>
                {/* plan when signal today */}
                {o.plan && (
                  <div className="hidden shrink-0 gap-2 text-right text-[10px] sm:flex">
                    {[["entry", "#22d3ee"], ["stop", "#f87171"], ["target", "#4ade80"]].map(([k, c]) => (
                      <div key={k}>
                        <p className="text-[8px] uppercase text-white/30">{k}</p>
                        <p className="font-semibold" style={{ color: c as string }}>{o.plan[k]?.toLocaleString?.() ?? o.plan[k]}</p>
                      </div>
                    ))}
                  </div>
                )}
                <span className="w-10 shrink-0 text-right text-[10px] text-white/30" title="opportunity score">
                  {o.opportunity_score}
                </span>
                <button
                  onClick={() => openPaper(o)}
                  disabled={paperBusy}
                  title="เปิด paper trade ที่ราคาตลาด (จำลอง)"
                  className="shrink-0 rounded-md border border-accent-500/40 px-2 py-1 text-[10px] font-semibold text-accent-300 transition hover:bg-accent-500/10 disabled:opacity-40"
                >
                  📝 เทรด
                </button>
              </div>
            ))}
            <p className="px-4 py-2 text-[10px] text-amber-300/60">🔒 {opps[0]?.disclaimer}</p>
          </div>
        )}
        {oppsRun && !oppsLoading && opps.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-white/30">ยังไม่มีเหรียญใน watchlist</p>
        )}
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
          {watchlist.map((w) => {
            const cfg = w.strategies?.[0];
            const stratLabel = cfg?.strategy === "rsi_reversion" ? "reversion" : cfg?.strategy === "ema_pullback" ? "pullback" : null;
            return (
              <span key={w.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                {w.symbol}
                {stratLabel && (
                  <span className="rounded bg-accent-500/20 px-1.5 text-[9px] font-semibold text-accent-300" title={`กลยุทธ์ที่ผูกไว้: ${cfg.strategy} (${cfg.timeframe})`}>
                    {stratLabel}
                  </span>
                )}
                <button onClick={() => removeSymbol(w.id)} className="text-white/30 hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* scanner table */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white/70">Signal Scanner</span>
              <span className="text-[10px] text-white/30">signal · win% วันนี้ · ราคา</span>
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
                  {/* win chance today */}
                  {(() => {
                    const o = oppBySym[r.symbol];
                    const wc = o?.win_chance_pct;
                    const color = o?.signal_today
                      ? (wc >= 55 ? "#4ade80" : wc >= 45 ? "#f59e0b" : "#f87171")
                      : "#475569";
                    return (
                      <span className="w-14 shrink-0 text-right" title={o ? o.label : "กดสแกน/ประเมินเพื่อดูโอกาสวันนี้"}>
                        <span className="text-xs font-bold" style={{ color }}>
                          {o?.signal_today && wc != null ? `${wc}%` : (o ? "—" : "·")}
                        </span>
                      </span>
                    );
                  })()}
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

      {/* ── News & Sentiment ── */}
      <div className="mt-6 rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/70">📰 News & Sentiment</span>
          <span className="text-[10px] text-white/30">RSS · ข่าวเหรียญใน watchlist</span>
          <div className="flex-1" />
          <button onClick={loadNews} disabled={newsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 disabled:opacity-50">
            <RefreshCw size={13} className={newsLoading ? "animate-spin" : ""} /> รีเฟรช
          </button>
        </div>

        {newsLoading && !news && <p className="px-4 py-6 text-center text-xs text-white/40">กำลังดึงข่าว…</p>}
        {news && (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {/* per-asset sentiment */}
            <div>
              <p className="mb-2 text-[11px] font-semibold text-white/50">Sentiment รายเหรียญ</p>
              {news.assets?.length === 0 && <p className="text-[11px] text-white/30">ยังไม่มีข่าวที่เกี่ยวกับเหรียญใน watchlist</p>}
              <div className="space-y-1.5">
                {news.assets?.map((a: any) => (
                  <div key={a.asset} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px]">
                    <span className="w-12 shrink-0 font-bold text-white">{a.asset}</span>
                    <span className="w-16 shrink-0">{a.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full"
                        style={{
                          width: `${Math.abs(a.sentiment) * 100}%`,
                          marginLeft: a.sentiment < 0 ? `${(1 - Math.abs(a.sentiment)) * 100}%` : 0,
                          background: a.sentiment > 0.15 ? "#4ade80" : a.sentiment < -0.15 ? "#f87171" : "#64748b",
                        }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-white/30">
                      {a.count} ข่าว · {a.bullish}↑/{a.bearish}↓
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* headlines */}
            <div>
              <p className="mb-2 text-[11px] font-semibold text-white/50">พาดหัวล่าสุด</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {news.items?.slice(0, 12).map((it: any, i: number) => (
                  <a key={i} href={it.url} target="_blank" rel="noreferrer"
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] transition hover:bg-white/[0.04]">
                    <span className="shrink-0">{it.stance === "bullish" ? "🟢" : it.stance === "bearish" ? "🔴" : "⚪"}</span>
                    <span className="flex-1 text-white/70">
                      {it.title}
                      <span className="ml-1 text-white/25">· {it.source} · {it.assets.join(",")}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
            <p className="lg:col-span-2 text-[10px] text-amber-300/50">🔒 {news.disclaimer}</p>
          </div>
        )}
      </div>

      {/* ── Backtest ── */}
      <div className="mt-6 rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/70">🧪 Backtest</span>
          <span className="text-[10px] text-white/30">เจาะลึกทีละเหรียญ</span>
          <div className="flex-1" />
          {watchlist.length > 0 ? (
            <select
              value={btSymbol}
              onChange={(e) => setBtSymbol(e.target.value)}
              className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-accent-500/50 focus:outline-none"
            >
              {watchlist.map((w) => (
                <option key={w.id} value={w.symbol} className="bg-[#1a1040]">{w.symbol}</option>
              ))}
            </select>
          ) : (
            <input
              list="symbol-list"
              value={btSymbol}
              onChange={(e) => setBtSymbol(e.target.value)}
              placeholder="BTC_THB"
              className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:border-accent-500/50 focus:outline-none"
            />
          )}
          <select
            value={btTf}
            onChange={(e) => setBtTf(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            {["15M", "1H", "4H", "1D"].map((tf) => (
              <option key={tf} value={tf} className="bg-[#1a1040]">{tf}</option>
            ))}
          </select>
          <button
            onClick={runBacktest}
            disabled={btLoading}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-accent-400 disabled:opacity-50"
          >
            <RefreshCw size={13} className={btLoading ? "animate-spin" : ""} />
            {btLoading ? "กำลังรัน…" : "รัน Backtest"}
          </button>
        </div>

        {!btResult && !btLoading && (
          <p className="px-4 py-8 text-center text-sm text-white/30">
            เลือกเหรียญ + timeframe แล้วกด “รัน Backtest” เพื่อดูผลย้อนหลัง
          </p>
        )}
        {btLoading && (
          <p className="px-4 py-8 text-center text-sm text-white/40">กำลังจำลองการเทรดย้อนหลัง…</p>
        )}

        {btResult && (btResult.baseline?.stats?.total_trades > 0 || btResult.validated?.stats?.total_trades > 0) && (() => {
          const view = btResult[btView] ?? btResult.validated;
          const stats = view.stats ?? {};
          const bs = btResult.baseline.stats ?? {};
          const vs = btResult.validated.stats ?? {};
          const metric = (label: string, key: string, fmt: (x: any) => string) => (
            <div key={key} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-white/50">{label}</span>
              <span className="w-20 text-right text-white/40">{fmt(bs[key])}</span>
              <span className="w-20 text-right font-semibold text-white">{fmt(vs[key])}</span>
            </div>
          );
          return (
          <div className="p-4">
            {/* baseline vs validated comparison */}
            <div className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className="w-28 text-white/50">เทียบผล</span>
                <span className="w-20 text-right text-white/40">Baseline</span>
                <span className="w-20 text-right text-accent-400">+ Validator</span>
              </div>
              {metric("เทรด", "total_trades", (x) => `${x ?? "—"}`)}
              {metric("Win Rate", "win_rate", (x) => x != null ? `${x}%` : "—")}
              {metric("Profit Factor", "profit_factor", (x) => x != null ? `${x}` : "∞")}
              {metric("ผลตอบแทน", "total_return_pct", (x) => x != null ? `${x}%` : "—")}
              {metric("Max DD", "max_drawdown_pct", (x) => x != null ? `${x}%` : "—")}
              <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/40">
                Signal Validator กรองสัญญาณหลอก (volume + ema-stack + macd&gt;0 + ไม่ไล่ราคา + cooldown)
              </p>
            </div>

            {/* view toggle */}
            <div className="mb-3 flex items-center gap-2">
              {(["validated", "baseline"] as const).map((v) => (
                <button key={v} onClick={() => setBtView(v)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    btView === v ? "bg-accent-500 text-black" : "border border-white/15 text-white/60 hover:bg-white/10"
                  }`}>
                  {v === "validated" ? "+ Validator" : "Baseline"}
                </button>
              ))}
              <span className="text-[10px] text-white/30">{view.bars} แท่ง · {btResult.timeframe}</span>
            </div>

            {/* stat cards for selected view */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { k: "เทรด", v: stats.total_trades, c: "#a78bfa" },
                { k: "Win Rate", v: `${stats.win_rate}%`, c: "#4ade80" },
                { k: "Profit Factor", v: stats.profit_factor ?? "∞", c: (stats.profit_factor ?? 0) >= 1.5 ? "#4ade80" : "#f59e0b" },
                { k: "ผลตอบแทนรวม", v: `${stats.total_return_pct}%`, c: stats.total_return_pct >= 0 ? "#4ade80" : "#f87171" },
                { k: "Max DD", v: `${stats.max_drawdown_pct}%`, c: "#f87171" },
                { k: "Avg R", v: stats.avg_r, c: "#22d3ee" },
              ].map(({ k, v, c }) => (
                <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] text-white/40">{k}</p>
                  <p className="text-lg font-bold" style={{ color: c }}>{v}</p>
                </div>
              ))}
            </div>

            {/* verdict */}
            <div className="mb-4 rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/60">
              {(() => {
                const pf = stats.profit_factor;
                if (stats.total_trades === 0) return "ไม่มีดีลในช่วงนี้ (เงื่อนไขเข้าไม่เกิด) — ลอง timeframe อื่น";
                if (pf == null) return "ยังไม่มีดีลขาดทุน — ตัวอย่างน้อยเกินไป";
                if (pf >= 1.5) return "✅ กลยุทธ์มี edge ในช่วงนี้ (PF ≥ 1.5) — แต่ต้องทดสอบหลายช่วง/หลายเหรียญก่อนเชื่อ";
                if (pf >= 1.0) return "🟡 เกือบ breakeven — ยังไม่คุ้ม fee/ความเสี่ยง ควรปรับเงื่อนไข";
                return "🔴 กลยุทธ์ขาดทุนในช่วงนี้ (PF < 1) — ควรปรับ filter หรือใช้เฉพาะตลาดที่เหมาะ";
              })()}
            </div>

            {/* equity curve */}
            {view.equity_curve?.length > 1 && (
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold text-white/50">Equity Curve</p>
                <div className="flex h-20 items-end gap-px">
                  {view.equity_curve.map((p: any, i: number) => {
                    const eqs = view.equity_curve.map((x: any) => x.equity);
                    const min = Math.min(...eqs), max = Math.max(...eqs);
                    const h = max > min ? ((p.equity - min) / (max - min)) * 100 : 50;
                    return (
                      <div key={i} className="flex-1 rounded-t"
                        style={{ height: `${Math.max(2, h)}%`, background: p.equity >= 1 ? "#22d3ee" : "#f87171" }}
                        title={`#${p.i}: ${p.equity}`} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* trade list */}
            <p className="mb-2 text-[11px] font-semibold text-white/50">
              ประวัติเทรด ({view.trades.length})
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
              {view.trades.map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5 text-[11px]">
                  <span className={`w-12 shrink-0 font-bold ${t.result === "WIN" ? "text-green-400" : "text-red-400"}`}>
                    {t.result}
                  </span>
                  <span className="w-28 shrink-0 text-white/40">{t.entry_at?.slice(0, 16)}</span>
                  <span className="w-20 shrink-0 text-white/50">{t.exit_reason}</span>
                  <span className={`w-16 shrink-0 text-right font-semibold ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct}%
                  </span>
                  <span className="w-12 shrink-0 text-right text-white/30">{t.r_multiple}R</span>
                  <span className="hidden flex-1 truncate text-white/30 sm:block">{t.reason}</span>
                </div>
              ))}
            </div>
          </div>
          );
        })()}
      </div>

      {/* ── AI: Auto-optimizer + ML ensemble (human-gated) ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Auto-optimizer */}
        <div className="rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white/70">🤖 Auto-Optimizer</span>
            <span className="text-[10px] text-white/30">walk-forward</span>
            <div className="flex-1" />
            <button onClick={runOptimize} disabled={optLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:opacity-50">
              <RefreshCw size={13} className={optLoading ? "animate-spin" : ""} />
              {optLoading ? "กำลังหา…" : "หาค่าที่ดีสุด"}
            </button>
          </div>
          {!optResult && !optLoading && (
            <p className="px-4 py-6 text-center text-xs text-white/30">
              ค้นหาพารามิเตอร์ที่ดีสุด ({btSymbol} {btTf}) แล้วพิสูจน์ด้วย out-of-sample
            </p>
          )}
          {optLoading && <p className="px-4 py-6 text-center text-xs text-white/40">กำลังลองหลายกลยุทธ์ + walk-forward…</p>}
          {optResult && !optResult.error && optResult.suggested && (
            <div className="space-y-3 p-4">
              {/* chosen strategy + params */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[11px]">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-white/40">กลยุทธ์ที่เหมาะกับ {optResult.symbol}:</span>
                  <span className="rounded bg-accent-500/20 px-2 py-0.5 font-bold text-accent-300">
                    {optResult.suggested.strategy === "rsi_reversion" ? "RSI Reversion (range)" : "EMA Pullback (trend)"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(optResult.suggested.params).filter(([k]) => k !== "strategy").map(([k, v]: any) => (
                    <span key={k} className="rounded bg-white/5 px-2 py-0.5 text-white/70">
                      {k}: <span className="font-semibold text-accent-400">{String(v)}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* holdout (untouched) vs default */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[11px]">
                <div className="mb-1 flex font-semibold text-white/50">
                  <span className="flex-1">Holdout (ไม่เคยเห็น)</span>
                  <span className="w-16 text-right">Default</span>
                  <span className="w-16 text-right text-accent-400">เลือก</span>
                </div>
                {[
                  ["Profit Factor", "profit_factor", ""],
                  ["ผลตอบแทน", "total_return_pct", "%"],
                  ["Win Rate", "win_rate", "%"],
                  ["เทรด", "total_trades", ""],
                ].map(([label, key, unit]) => (
                  <div key={key} className="flex text-white/70">
                    <span className="flex-1">{label}</span>
                    <span className="w-16 text-right text-white/40">{optResult.default_holdout?.[key] ?? "—"}{unit}</span>
                    <span className="w-16 text-right font-semibold text-white">{optResult.holdout?.[key] ?? "—"}{unit}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">
                {optResult.verdict}
              </div>
              <button
                onClick={applyStrategy}
                className="w-full rounded-lg bg-accent-500 py-2 text-xs font-semibold text-black transition hover:bg-accent-400"
              >
                ✓ Apply กลยุทธ์นี้ให้ {optResult.symbol}
              </button>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300/80">
                🔒 {optResult.human_gate}
              </div>
            </div>
          )}
          {optResult && !optResult.error && !optResult.suggested && (
            <div className="space-y-2 p-4">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">{optResult.verdict}</div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300/80">🔒 {optResult.human_gate}</div>
            </div>
          )}
          {optResult?.error && <p className="px-4 py-6 text-center text-xs text-white/40">{optResult.error}</p>}
        </div>

        {/* ML ensemble */}
        <div className="rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white/70">🧠 ML Ensemble</span>
            <span className="text-[10px] text-white/30">XGBoost + Logistic</span>
            <div className="flex-1" />
            <button onClick={runML} disabled={mlLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:opacity-50">
              <RefreshCw size={13} className={mlLoading ? "animate-spin" : ""} />
              {mlLoading ? "กำลังเทรน…" : "เทรน + ประเมิน"}
            </button>
          </div>
          {!mlResult && !mlLoading && (
            <p className="px-4 py-6 text-center text-xs text-white/30">
              เทรนโมเดลทำนาย P(ขึ้น) แล้ววัด out-of-sample + เทียบ rule vs ensemble
            </p>
          )}
          {mlLoading && <p className="px-4 py-6 text-center text-xs text-white/40">กำลังเทรน walk-forward…</p>}
          {mlResult && !mlResult.error && (
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { k: "AUC (OOS)", v: mlResult.walk_forward?.auc ?? "—", c: (mlResult.walk_forward?.auc ?? 0) >= 0.58 ? "#4ade80" : "#f59e0b" },
                  { k: "Accuracy", v: mlResult.walk_forward?.accuracy ?? "—", c: "#22d3ee" },
                  { k: "Samples", v: mlResult.samples ?? "—", c: "#a78bfa" },
                ].map(({ k, v, c }) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                    <p className="text-[9px] text-white/40">{k}</p>
                    <p className="text-sm font-bold" style={{ color: c }}>{v}</p>
                  </div>
                ))}
              </div>
              {/* rule vs ensemble */}
              {mlResult.ensemble_compare && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[11px]">
                  <div className="mb-1 flex font-semibold text-white/50">
                    <span className="flex-1">OOS</span>
                    <span className="w-16 text-right">Rule</span>
                    <span className="w-20 text-right text-accent-400">+ ML</span>
                  </div>
                  {[
                    ["เทรด", "total_trades", ""],
                    ["Win Rate", "win_rate", "%"],
                    ["ผลตอบแทน", "total_return_pct", "%"],
                  ].map(([label, key, unit]) => (
                    <div key={key} className="flex text-white/70">
                      <span className="flex-1">{label}</span>
                      <span className="w-16 text-right text-white/50">{mlResult.ensemble_compare.rule_only?.[key] ?? "—"}{unit}</span>
                      <span className="w-20 text-right font-semibold text-white">{mlResult.ensemble_compare.ensemble?.[key] ?? "—"}{unit}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* top features */}
              {mlResult.feature_importance?.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-white/40">Feature importance</p>
                  {mlResult.feature_importance.slice(0, 4).map((f: any) => (
                    <div key={f.feature} className="flex items-center gap-2 text-[10px]">
                      <span className="w-24 text-white/50">{f.feature}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full bg-accent-500" style={{ width: `${f.importance * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-white/30">{f.importance}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">
                {mlResult.verdict}
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300/80">
                🔒 {mlResult.human_gate}
              </div>
            </div>
          )}
          {mlResult?.error && <p className="px-4 py-6 text-center text-xs text-white/40">{mlResult.error}</p>}
        </div>
      </div>

      {/* ── Paper Trading ── */}
      <div className="mt-6 rounded-xl border border-white/10 bg-[#141228]/70 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/70">📝 Paper Trading</span>
          <span className="text-[10px] text-white/30">จำลอง — fee 0.25%, สะสมสถิติจริง</span>
          <div className="flex-1" />
          <button onClick={loadPaper}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10">
            <RefreshCw size={13} /> รีเฟรช
          </button>
        </div>

        {/* accumulated stats */}
        {paperStats && (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {[
              { k: "เทรดทั้งหมด", v: paperStats.total_trades ?? 0, c: "#a78bfa" },
              { k: "Win Rate", v: paperStats.total_trades ? `${paperStats.win_rate}%` : "—", c: "#4ade80" },
              { k: "Profit Factor", v: paperStats.profit_factor ?? "—", c: (paperStats.profit_factor ?? 0) >= 1.5 ? "#4ade80" : "#f59e0b" },
              { k: "กำไรรวม (฿)", v: (paperStats.total_pnl_thb ?? 0).toLocaleString(), c: (paperStats.total_pnl_thb ?? 0) >= 0 ? "#4ade80" : "#f87171" },
            ].map(({ k, v, c }) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[10px] text-white/40">{k}</p>
                <p className="text-lg font-bold" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>
        )}

        {/* open positions */}
        <div className="px-4 pb-2">
          <p className="mb-1.5 text-[11px] font-semibold text-white/50">Open Positions ({paperPos.length})</p>
          {paperPos.length === 0 && (
            <p className="py-3 text-center text-[11px] text-white/30">ยังไม่มี position — กด “📝 เทรด” ที่ ⭐ โอกาสวันนี้</p>
          )}
          {paperPos.map((t) => (
            <div key={t.id} className="flex items-center gap-3 border-b border-white/5 py-2 text-[11px]">
              <span className="w-24 shrink-0 font-semibold text-white">{t.symbol}</span>
              <span className="w-16 shrink-0 text-white/40">{t.size_thb?.toLocaleString()}฿</span>
              <span className="hidden w-28 shrink-0 text-white/40 sm:block">
                เข้า {t.entry_price?.toLocaleString()} → {t.live?.cur_price?.toLocaleString() ?? "—"}
              </span>
              <span className={`flex-1 text-right font-semibold ${(t.live?.pnl_thb ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {t.live ? `${t.live.pnl_thb >= 0 ? "+" : ""}${t.live.pnl_thb.toLocaleString()}฿ (${t.live.pnl_pct}%)` : "—"}
              </span>
              <button onClick={() => closePaper(t.id)} disabled={paperBusy}
                className="shrink-0 rounded-md border border-red-500/40 px-2 py-1 text-[10px] font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40">
                ปิด
              </button>
            </div>
          ))}
        </div>

        {/* closed journal */}
        {paperTrades.length > 0 && (
          <div className="px-4 pb-4">
            <p className="mb-1.5 mt-2 text-[11px] font-semibold text-white/50">Journal — ปิดแล้ว ({paperTrades.length})</p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10">
              {paperTrades.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5 text-[11px]">
                  <span className={`w-12 shrink-0 font-bold ${t.result === "WIN" ? "text-green-400" : "text-red-400"}`}>{t.result}</span>
                  <span className="w-24 shrink-0 text-white">{t.symbol}</span>
                  <span className="hidden w-28 shrink-0 text-white/40 sm:block">{t.exit_at?.slice(0, 16)}</span>
                  <span className={`flex-1 text-right font-semibold ${(t.pnl_thb ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.pnl_thb >= 0 ? "+" : ""}{t.pnl_thb?.toLocaleString()}฿ ({t.pnl_pct}%)
                  </span>
                  <span className="hidden w-32 shrink-0 truncate text-white/30 md:block" title={t.rationale}>{t.rationale}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

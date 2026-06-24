"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { wsManager } from "@/hooks/useWebSocket";
import { useWorkspaceStore } from "@/store/workspace";
import { useTemplatesStore, resolveAssetUrl, type Marker } from "@/store/officeTemplates";
import { RefreshCw, Pencil } from "lucide-react";
import { DraggableBox } from "@/components/office/DraggableBox";

interface DeskChar {
  key: string;
  name: string;
  emoji: string;
  role: string;
  message: string;        // deterministic fact (always current)
  commentary?: string;    // optional LLM in-character remark (heavy tick)
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
  summary: { x: 50, y: 10, scale: 0.85 },
};
const COLORS: Record<string, string> = {
  trader: "#22d3ee", analyst: "#a78bfa", news: "#f59e0b",
  risk: "#f87171", coach: "#4ade80", monitor: "#60a5fa", exec: "#ec4899",
  summary: "#34d399",
};
const ORDER = ["summary", "coach", "analyst", "news", "exec", "risk", "monitor", "trader"];

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
  const imgRef = useRef<HTMLImageElement>(null);
  const dragId = useRef<string | null>(null);
  const [imgRect, setImgRect] = useState<{ left: number; top: number; w: number; h: number; cw: number; ch: number } | null>(null);

  // compute rendered image rect (object-cover → actual visible area)
  const computeImgRect = useCallback(() => {
    const img = imgRef.current;
    const ctr = stageRef.current;
    if (!img || !ctr) { setImgRect(null); return; }
    const cw = ctr.clientWidth, ch = ctr.clientHeight;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!cw || !ch || !nw || !nh) { setImgRect(null); return; }
    // object-cover: image scales so it fully covers the container (cropping excess)
    const scale = Math.max(cw / nw, ch / nh);
    const rw = nw * scale;
    const rh = nh * scale;
    setImgRect({ left: (cw - rw) / 2, top: (ch - rh) / 2, w: rw, h: rh, cw, ch });
  }, []);

  // map image-relative % → container-relative %
  const imgPctToCss = useCallback((x: number, y: number): { left: string; top: string } => {
    if (!imgRect) return { left: `${x}%`, top: `${y}%` };
    // container% = 50 + (renderedSize / containerSize) * (image% - 50)
    const lx = 50 + (imgRect.w / imgRect.cw) * (x - 50);
    const ly = 50 + (imgRect.h / imgRect.ch) * (y - 50);
    return { left: `${lx}%`, top: `${ly}%` };
  }, [imgRect]);

  // pipeline report overlay (separate from chars so desk.update doesn't overwrite)
  const [pipelineReports, setPipelineReports] = useState<Record<string, string>>({});

  // ── bubble engine ──
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const lastSpoken = useRef<Record<string, string>>({});  // last message streamed per char

  // ── pipeline feed ──
  const [pipelineSteps, setPipelineSteps] = useState<{ node_id: string; report?: string; status: string; ts: number }[]>([]);
  // เริ่มต้นเปิดเฉพาะ Symbols — box อื่นกดเปิดเองจาก toolbar
  const [showPipelineFeed, setShowPipelineFeed] = useState(false);
  const [showSymbols, setShowSymbols] = useState(true);
  const [showNews, setShowNews] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const pipelineRunRef = useRef<string>("idle");
  const [rankedCoins, setRankedCoins] = useState<string[]>([]);
  const [tickerMap, setTickerMap] = useState<Record<string, { s: string; p: number; c: number; v: number; h: number; l: number; closes?: number[] }>>({});
  const [newsAgg, setNewsAgg] = useState<{ assets?: { asset: string; sentiment: number; label: string; count: number; bullish: number; bearish: number; headlines: { title: string; source: string; url: string; stance: string }[] }[]; total_items?: number }>({});

  // per-role LLM provider/model config (edit mode panel)
  const [llmConfig, setLlmConfig] = useState<Record<string, { provider?: string; model?: string }>>({});
  const [showLlm, setShowLlm] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmOpts, setLlmOpts] = useState<{ providers: string[]; models: Record<string, string[]> }>({ providers: ["auto"], models: {} });
  const [bulk, setBulk] = useState<{ provider: string; model: string }>({ provider: "", model: "" });

  // chat
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages, chatLoading]);

  useEffect(() => { if (current) fetchTemplates(current.id); }, [current, fetchTemplates]);
  useEffect(() => {
    if (!current) return;
    api.get(`/trading/desk/llm-config/workspace/${current.id}`)
      .then((r) => setLlmConfig(r.data.roles ?? {}))
      .catch(() => {});
  }, [current]);
  useEffect(() => { api.get(`/agents/llm/options`).then((r) => setLlmOpts(r.data)).catch(() => {}); }, []);

  const saveLlmConfig = async () => {
    if (!current) return;
    setLlmSaving(true);
    try {
      // drop empty entries so unset roles fall back to the default provider
      const roles: Record<string, { provider?: string; model?: string }> = {};
      for (const k of ORDER) {
        const c = llmConfig[k];
        if (c && (c.provider?.trim() || c.model?.trim())) roles[k] = c;
      }
      await api.put(`/trading/desk/llm-config/workspace/${current.id}`, { roles });
      setLlmConfig(roles);
      setShowLlm(false);
    } finally { setLlmSaving(false); }
  };
  useEffect(() => { if (!editMode) setPositions(loadPositions(activeTemplate?.markers)); }, [activeTemplate, editMode]);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await api.get(`/trading/desk/workspace/${current.id}`);
      setChars(r.data.characters ?? []);
      const t = r.data.ticker ?? {};
      if (Object.keys(t).length > 0) setTickerMap(t);
      if (r.data.news_agg) setNewsAgg(r.data.news_agg);
      setUpdated(new Date());
      setError(null);
      setWarming(r.data.status === "warming_up");
    } catch {
      setError("โหลดข้อมูลโต๊ะเทรดไม่ได้ — ลองรีเฟรช");
    } finally { setLoading(false); }
  }, [current]);

  useEffect(() => { load();   }, [load]);

  const sendChat = useCallback(async () => {
    if (!current || !chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((p) => [...p, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const r = await api.post(`/trading/desk/workspace/${current.id}/chat`, { message: msg });
      setChatMessages((p) => [...p, { role: "assistant", text: r.data.response }]);
    } catch {
      setChatMessages((p) => [...p, { role: "assistant", text: "ขออภัย ไม่สามารถตอบได้ในตอนนี้" }]);
    } finally {
      setChatLoading(false);
    }
  }, [current, chatInput, chatLoading]);

  // realtime push from the worker (Redis → WS) — update instantly, no waiting for the poll
  useEffect(() => {
    if (!current || editMode) return;
    const onDeskUpdate = (e: Record<string, unknown> & { type: string }) => {
      const wsId = e.workspace_id as string | undefined;
      if (wsId && wsId !== current.id) return;
      setChars((e.characters as DeskChar[]) ?? []);
      const t = e.ticker as Record<string, any> | undefined;
      if (t && Object.keys(t).length > 0) setTickerMap(t);
      if (e.news_agg) setNewsAgg(e.news_agg as any);
      setUpdated(new Date());
      setUpdated(new Date());
      setWarming(false);
      setError(null);
    };
    wsManager.on("desk.update", onDeskUpdate);
    return () => wsManager.off("desk.update", onDeskUpdate);
  }, [current, editMode]);

  // pipeline step → overlay message + auto-create character if missing
  useEffect(() => {
    if (!current || editMode) return;
    const onPipelineStep = (e: any) => {
      const step = e.step as { node_id: string; report?: string; status: string; ts: number; ranked_coins?: string[] } | undefined;
      const runStatus = e.run_status as string;
      if (runStatus === "running" && pipelineRunRef.current !== "running") {
        setPipelineReports({});
        setPipelineSteps([]);
        setBubbles({});
        setRankedCoins([]);
        setNewsAgg({});
      }
      pipelineRunRef.current = runStatus;
      if (step?.node_id === "__complete__") {
        // Pipeline done → trigger agent meeting in background
        api.post(`/trading/desk/workspace/${current!.id}/meeting`).then((r) => {
          const cm = r.data.commentary as Record<string, string> | undefined;
          if (!cm) return;
          setPipelineReports((prev) => ({ ...prev, ...cm }));
        }).catch(() => {});
        return;
      }
      if (!step || !step.report) return;
      if (step.ranked_coins) setRankedCoins(step.ranked_coins);
      setPipelineSteps((prev) => [...prev.slice(-50), step!]);
      setPipelineReports((prev) => ({ ...prev, [step!.node_id]: step!.report! }));
      setChars((prev) => {
        if (prev.some((c) => c.key === step!.node_id)) return prev;
        const name = step!.node_id.charAt(0).toUpperCase() + step!.node_id.slice(1);
        return [...prev, { key: step!.node_id, name, emoji: "🤖", role: "pipeline", message: "", commentary: "" }];
      });
    };
    wsManager.on("desk.pipeline_step", onPipelineStep);
    return () => wsManager.off("desk.pipeline_step", onPipelineStep);
  }, [current, editMode]);

  // only show bubble when a pipeline step report arrives
  const spokenText = (c: DeskChar) => (pipelineReports[c.key]?.trim()) || "";

  // speak ONLY when a character's spoken line is new (fresh data/analysis) —
  // no blind re-streaming of the same line. Stagger so they don't all talk at once.
  useEffect(() => {
    if (editMode) { setBubbles({}); return; }
    const fresh = chars.filter((c) => spokenText(c) && lastSpoken.current[c.key] !== spokenText(c));
    if (fresh.length === 0) return;
    const timers = fresh.map((c, i) =>
      setTimeout(() => {
        lastSpoken.current[c.key] = spokenText(c);
        setBubbles((b) => ({ ...b, [c.key]: { text: spokenText(c), idx: 0, phase: "stream", born: Date.now() } }));
      }, i * STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [chars, pipelineReports, editMode]);

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

  // recompute img rect on container resize
  useEffect(() => {
    const ctr = stageRef.current;
    if (!ctr) return;
    const ro = new ResizeObserver(() => computeImgRect());
    ro.observe(ctr);
    return () => ro.disconnect();
  }, [computeImgRect]);

  // ── drag (edit) ──
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const cxp = ((e.clientX - rect.left) / rect.width) * 100;
    const cyp = ((e.clientY - rect.top) / rect.height) * 100;
    if (!imgRect) return { x: Math.max(2, Math.min(98, cxp)), y: Math.max(4, Math.min(96, cyp)) };
    // image% = 50 + (containerSize / renderedSize) * (container% - 50)
    const ix = 50 + (imgRect.cw / imgRect.w) * (cxp - 50);
    const iy = 50 + (imgRect.ch / imgRect.h) * (cyp - 50);
    return { x: Math.max(0, Math.min(100, ix)), y: Math.max(0, Math.min(100, iy)) };
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
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-300/80"
                title="Pipeline steps received via WS">
                📨 {pipelineSteps.length}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/40"
                title="Active bubbles">
                💬 {Object.keys(bubbles).length}
              </span>
              <button onClick={() => setShowSymbols((s) => !s)}
                className={`rounded-md border px-2 py-1 text-[10px] ${showSymbols ? "border-accent-400 text-accent-300" : "border-white/15 text-white/70"} hover:bg-white/10`}>
                {showSymbols ? "⊟ Symbols" : "⊞ Symbols"}
              </button>
              <button onClick={() => setShowPipelineFeed((s) => !s)}
                className={`rounded-md border px-2 py-1 text-[10px] ${showPipelineFeed ? "border-accent-400 text-accent-300" : "border-white/15 text-white/70"} hover:bg-white/10`}>
                {showPipelineFeed ? "⊟ Pipeline" : "⊞ Pipeline"}
              </button>
              <button onClick={() => setShowNews((s) => !s)}
                className={`rounded-md border px-2 py-1 text-[10px] ${showNews ? "border-accent-400 text-accent-300" : "border-white/15 text-white/70"} hover:bg-white/10`}>
                {showNews ? "⊟ News" : "⊞ News"}
              </button>
              <button onClick={() => setShowChat((s) => !s)}
                className={`rounded-md border px-2 py-1 text-[10px] ${showChat ? "border-accent-400 text-accent-300" : "border-white/15 text-white/70"} hover:bg-white/10`}>
                {showChat ? "⊟ Chat" : "⊞ Chat"}
              </button>
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
              <button onClick={() => setShowLlm((s) => !s)} className={`rounded-md border px-2 py-1 ${showLlm ? "border-accent-400 text-accent-300" : "border-white/15 text-white/70"} hover:bg-white/10`}>⚙️ LLM</button>
              <button onClick={() => { setEditMode(false); setSelected(null); setShowLlm(false); }} className="rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10">ยกเลิก</button>
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
          <img ref={imgRef} src={bg} alt="office" className="absolute inset-0 h-full w-full object-cover" draggable={false} onLoad={computeImgRect} />
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
              style={{ ...imgPctToCss(pos.x, pos.y), transform: `translate(-50%,-50%) scale(${pos.scale})` }}
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
        {!editMode && (
          // all characters that have a bubble (ORDER + pipeline auto-created)
          Object.keys(bubbles).filter((k) => bubbles[k] && charByKey(k)).map((key, _, arr) => {
          const b = bubbles[key];
          const c = charByKey(key)!;
          const inOrder = ORDER.includes(key);
          const pos = inOrder ? (positions[key] ?? DEFAULTS[key]) : (() => {
            // auto-place unknown characters in a column on the right
            const idx = arr.filter((k2) => !ORDER.includes(k2)).indexOf(key);
            return { x: 92, y: 15 + idx * 11, scale: 0.8 };
          })();
          const color = COLORS[key] ?? "#a78bfa";
          const shown = b.text.slice(0, b.idx);
          const fading = b.phase === "fade";
          const streaming = b.phase === "stream";
          return (
            <div key={key}
              className="absolute flex flex-col items-center transition-[opacity,transform] duration-500"
              style={{
                ...imgPctToCss(pos.x, pos.y),
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
        }))}

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

        {/* pipeline feed panel (view mode) */}
        {!editMode && (
          <>
            {showSymbols && rankedCoins.length > 0 && (
              <DraggableBox title="📊 Symbols" defaultPos={{ x: 12, y: 300 }} storageKey="office-symbols-box">
                <div className="min-w-[340px]">
                <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-x-2 px-3 py-1.5 text-[9px] font-semibold text-white/40 border-b border-white/10">
                  <span>Symbol</span>
                  <span className="text-right">Price</span>
                  <span className="text-right w-14">Chg%</span>
                  <span>Trend</span>
                </div>
                <div className="px-3 py-1 space-y-0.5 max-h-[300px] overflow-y-auto">
                  {rankedCoins.map((sym) => {
                    const t = tickerMap[sym];
                    const cls = t?.closes;
                    const trendUp = t ? t.c >= 0 : true;
                    return (
                      <div key={sym} className="grid grid-cols-[1fr_auto_auto_1fr] gap-x-2 text-[11px] items-center">
                        <span className="font-semibold text-white/90">{sym.replace("_THB", "")}</span>
                        <span className="text-right font-mono text-white/80">{t ? (t.p >= 1000000 ? (t.p/1000000).toFixed(2) + "M" : t.p >= 1000 ? (t.p/1000).toFixed(2) + "K" : t.p.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})) : "—"}</span>
                        <span className={`text-right font-mono w-14 ${t ? (t.c >= 0 ? "text-emerald-400" : "text-red-400") : "text-white/30"}`}>
                          {t ? `${t.c >= 0 ? "+" : ""}${t.c.toFixed(2)}%` : "—"}
                        </span>
                        <span className="h-6 flex items-center">
                          {cls && cls.length > 1 ? (() => {
                            const w = 48, h = 20;
                            const min = Math.min(...cls), max = Math.max(...cls), rng = max - min || 1;
                            const pts = cls.map((v, i) => `${(i / (cls.length - 1)) * w},${h - ((v - min) / rng) * h}`).join(" ");
                            return (
                              <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-12 shrink-0">
                                <polyline fill="none" stroke={trendUp ? "#34d399" : "#f87171"} strokeWidth={1.5} points={pts} />
                              </svg>
                            );
                          })() : <span className="text-[9px] text-white/30">—</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/10 px-3 py-1 text-[8px] text-white/25">
                  Live · {Object.keys(tickerMap).length > 0 ? new Date().toLocaleTimeString() : "—"}
                </div>
                </div>
              </DraggableBox>
            )}
            {showPipelineFeed && pipelineSteps.length > 0 && (
              <DraggableBox title="⚡ Pipeline" defaultPos={{ x: 480, y: 12 }} storageKey="office-pipeline-box">
                <div className="w-[320px] flex flex-col max-h-[300px]">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-white/60">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Pipeline
              </span>
              <span className="text-[9px] text-white/30">{pipelineSteps.length} steps</span>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {[...pipelineSteps].reverse().slice(0, 30).map((s, i) => {
                const ts = s.ts ? new Date(s.ts * 1000) : null;
                const timeStr = ts ? ts.toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
                const node = DEFAULTS[s.node_id] ? null : null;
                return (
                  <div key={`${s.node_id}_${s.ts}_${i}`} className="flex items-start gap-1.5 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px]">
                    <span className="shrink-0 whitespace-nowrap text-[8px] text-white/25">{timeStr}</span>
                    <span className={`mt-1 h-1 w-1 shrink-0 rounded-full ${
                      s.status === "completed" ? "bg-emerald-400" :
                      s.status === "running" ? "bg-amber-400 animate-pulse" : "bg-white/20"
                    }`} />
                    <span className="font-semibold text-white/70">{s.node_id}</span>
                    <span className="text-white/50">{s.report ? s.report.substring(0, 120) : ""}</span>
                  </div>
                );
              })}
            </div>
            </div>
            </DraggableBox>
          )}
          </>
        )}

        {/* news floating panel */}
        {!editMode && showNews && newsAgg?.assets && newsAgg.assets.length > 0 && (
          <DraggableBox title="📰 News" defaultPos={{ x: 12, y: 12 }} storageKey="office-news-box">
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {newsAgg.assets.flatMap((a) => a.headlines).filter(Boolean).slice(0, 15).map((h, i) => (
                <a key={i} href={h.url} target="_blank" rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug transition-colors hover:bg-white/5">
                  <span className={`mt-0.5 shrink-0 ${h.stance === "bullish" ? "text-emerald-400" : h.stance === "bearish" ? "text-red-400" : "text-yellow-400"}`}>
                    {h.stance === "bullish" ? "▲" : h.stance === "bearish" ? "▼" : "◆"}
                  </span>
                  <span className="text-white/80 transition-colors group-hover:text-white">{h.title}</span>
                </a>
                ))}
            </div>
          </DraggableBox>
        )}

        {/* chat box */}
        {!editMode && showChat && (
          <DraggableBox title="💬 Desk Chat" defaultPos={{ x: 280, y: 12 }} storageKey="office-chat-box"
            className="w-80">
            <div className="flex flex-col" style={{ height: 320 }}>
              <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto p-2">
                {chatMessages.length === 0 && (
                  <p className="text-[11px] text-white/40">ถามอะไรก็ได้เกี่ยวกับข้อมูล pipeline ล่าสุด</p>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`rounded-lg px-2 py-1.5 text-[11px] leading-snug ${m.role === "user" ? "bg-accent-500/20 text-accent-200 ml-4" : "bg-white/10 text-white/80 mr-4"}`}>
                    {m.text}
                  </div>
                ))}
                {chatLoading && <div className="rounded-lg bg-white/10 px-2 py-1.5 text-[11px] text-white/50 mr-4">กำลังพิมพ์...</div>}
              </div>
              <div className="flex items-center gap-1 border-t border-white/10 p-1.5 shrink-0">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="ถามเกี่ยวกับตลาด..."
                  className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white placeholder-white/25 focus:border-accent-500/50 focus:outline-none" />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="rounded bg-accent-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-accent-400 disabled:opacity-40">
                  ส่ง
                </button>
              </div>
            </div>
          </DraggableBox>
        )}

        {/* per-role LLM provider/model panel (edit) */}
        {editMode && showLlm && (
          <div className="absolute right-3 top-3 max-h-[80%] w-[320px] overflow-auto rounded-xl border border-white/15 bg-black/80 p-3 backdrop-blur"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">LLM ราย agent</span>
              <button onClick={saveLlmConfig} disabled={llmSaving}
                className="rounded-md bg-accent-500 px-2 py-0.5 text-[11px] font-semibold text-black hover:bg-accent-400 disabled:opacity-50">
                {llmSaving ? "บันทึก…" : "บันทึก LLM"}
              </button>
            </div>
            <p className="mb-2 text-[10px] leading-snug text-white/40">เว้นว่าง = ใช้ default (ollama · qwen2.5:7b-instruct)</p>

            {/* preset: apply one provider/model to all roles */}
            <div className="mb-2 rounded-lg border border-accent-500/20 bg-accent-500/5 p-2">
              <span className="mb-1 block text-[10px] font-semibold text-accent-300">ตั้งทุก agent พร้อมกัน</span>
              <div className="flex gap-1.5">
                <select value={bulk.provider} onChange={(e) => setBulk({ provider: e.target.value, model: "" })}
                  className="w-1/2 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white focus:border-accent-500/50 focus:outline-none">
                  <option value="">default</option>
                  {llmOpts.providers.filter((p) => p !== "auto").map((p) => <option key={p} value={p} className="bg-gray-900">{p}</option>)}
                </select>
                <input list="models-bulk" value={bulk.model} onChange={(e) => setBulk({ ...bulk, model: e.target.value })}
                  placeholder="model" className="w-1/2 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white placeholder-white/25 focus:border-accent-500/50 focus:outline-none" />
                <datalist id="models-bulk">{(llmOpts.models[bulk.provider] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <button
                onClick={() => setLlmConfig(Object.fromEntries(ORDER.map((k) => [k, { provider: bulk.provider, model: bulk.model }])))}
                className="mt-1.5 w-full rounded border border-white/15 py-1 text-[10px] text-white/70 hover:bg-white/10">
                ใช้กับทุก agent
              </button>
            </div>

            <div className="space-y-2">
              {ORDER.map((key) => {
                const c = charByKey(key);
                const conf = llmConfig[key] ?? {};
                const set = (patch: { provider?: string; model?: string }) =>
                  setLlmConfig((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
                const known = llmOpts.models[conf.provider ?? ""] ?? [];
                // validation: model typed but not present on the server's known list
                const modelUnknown = !!conf.model?.trim() && known.length > 0 && !known.includes(conf.model.trim());
                const hasOverride = !!(conf.provider?.trim() || conf.model?.trim());
                return (
                  <div key={key} className="rounded-lg border border-white/10 p-2">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color: COLORS[key] ?? "#a78bfa" }}>
                      {c?.emoji ?? "🙂"} {c?.name ?? key}
                      {hasOverride && (
                        <button onClick={() => set({ provider: "", model: "" })} className="ml-auto text-white/30 hover:text-white/70" title="คืนค่า default">✕</button>
                      )}
                    </span>
                    <div className="flex gap-1.5">
                      <select value={conf.provider ?? ""} onChange={(e) => set({ provider: e.target.value, model: "" })}
                        className="w-1/2 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white focus:border-accent-500/50 focus:outline-none">
                        <option value="">default</option>
                        {llmOpts.providers.filter((p) => p !== "auto").map((p) => <option key={p} value={p} className="bg-gray-900">{p}</option>)}
                      </select>
                      <input list={`models-${key}`} value={conf.model ?? ""} onChange={(e) => set({ model: e.target.value })}
                        placeholder="model" className={`w-1/2 rounded border bg-white/5 px-2 py-1 text-[11px] text-white placeholder-white/25 focus:outline-none ${modelUnknown ? "border-amber-500/60" : "border-white/10 focus:border-accent-500/50"}`} />
                      <datalist id={`models-${key}`}>{known.map((m) => <option key={m} value={m} />)}</datalist>
                    </div>
                    {modelUnknown && <span className="mt-0.5 block text-[9px] text-amber-400/80">⚠ ไม่พบ model นี้บน server</span>}
                    {conf.provider?.trim() && !conf.model?.trim() && <span className="mt-0.5 block text-[9px] text-white/35">ใช้ model เริ่มต้นของ {conf.provider}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

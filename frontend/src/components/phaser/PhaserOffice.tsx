"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentData } from "@/store/office";
import { useOfficeGameStore } from "@/store/officeGame";
import { defaultSpriteFor, DEFAULT_BACKGROUND } from "@/components/canvas2d/defaultAssets";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useImageUpload } from "@/components/canvas2d/useImageUpload";
import { SpriteUploadModal } from "@/components/canvas2d/SpriteUploadModal";
import { defaultSpriteFor as _def } from "@/components/canvas2d/defaultAssets";
import { PhaserBus, PEVENTS } from "./eventBus";
import type { SceneData, SpriteMeta, AgentSpawn, FurnitureSpawn } from "./OfficeScene";
import { X, MessageSquare, Pencil, Check, ImageIcon, Plus, Trash2, UserCircle, Users, Sofa, SlidersHorizontal, RotateCcw } from "lucide-react";

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
  ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

function loadDims(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = url;
  });
}
const keyOf = (url: string) => "tex_" + url.replace(/[^a-z0-9]/gi, "_");

interface Props { agents: AgentData[]; officeName: string; }

export default function PhaserOffice({ agents, officeName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const [editor, setEditor] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [spriteAgent, setSpriteAgent] = useState<AgentData | null>(null);
  const [selFurnId, setSelFurnId] = useState<string | null>(null);
  const [uploadingFurn, setUploadingFurn] = useState(false);
  const [tab, setTab] = useState<"bg" | "chars" | "furn" | "settings">("bg");

  const { backgroundUrl, agentSprites, furniture, catalog, settings, updateSettings, reset, addFurniture, updateFurniture, removeFurniture, setBackground, setAgentSprite, addCatalogItem, updateCatalogItem, removeCatalogItem } = useOfficeGameStore();
  const replaceCatalogRef = useRef<string | null>(null);
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();
  const { upload } = useImageUpload();

  // Build sprite metadata + boot Phaser (recreate when background changes)
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = (await import("phaser")).default;
      const { OfficeScene } = await import("./OfficeScene");

      const bgUrl = backgroundUrl || "/assets/maps/office_floor.png";
      const spriteByUrl = new Map<string, SpriteMeta>();
      const agentSpawns: AgentSpawn[] = [];

      for (const a of agentsRef.current) {
        const cfg = agentSprites[a.id] ?? defaultSpriteFor(a.agent_type);
        if (!cfg) continue;
        const key = keyOf(cfg.url);
        if (!spriteByUrl.has(cfg.url)) {
          const dims = await loadDims(cfg.url);
          const cols = cfg.cols || 1, rows = cfg.rows || 1;
          spriteByUrl.set(cfg.url, {
            key, url: cfg.url,
            frameW: cfg.frameW || Math.floor(dims.w / cols),
            frameH: cfg.frameH || Math.floor(dims.h / rows),
            cols, rows,
          });
        }
        agentSpawns.push({
          id: a.id, name: a.name, agentType: a.agent_type, status: a.status,
          spriteKey: key, color: AGENT_COLORS[a.agent_type] ?? "#6366f1",
        });
      }

      const furnitureSpawns: FurnitureSpawn[] = furniture
        .filter((f) => f.imageUrl)
        .map((f) => ({ id: f.id, url: f.imageUrl!, x: f.x, y: f.y, w: f.width, h: f.height }));

      if (destroyed) return;

      const sceneData: SceneData = {
        bgKey: keyOf(bgUrl), bgUrl,
        sprites: Array.from(spriteByUrl.values()),
        agents: agentSpawns, furniture: furnitureSpawns,
        settings: useOfficeGameStore.getState().settings,
      };

      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: containerRef.current!,
        width: containerRef.current!.clientWidth, height: containerRef.current!.clientHeight,
        backgroundColor: "#0e0b16", pixelArt: true,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [OfficeScene],
      });
      gameRef.current = game;
      game.scene.start("OfficeScene", sceneData);
      PhaserBus.once(PEVENTS.READY, (scene: any) => {
        sceneRef.current = scene;
        scene.setEditorMode(editor);
      });
    })();

    return () => {
      destroyed = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // Boot ONCE on mount — never recreate the game (keeps agents alive)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background change → swap live in the scene (no recreate, agents stay)
  const bgFirst = useRef(true);
  useEffect(() => {
    if (bgFirst.current) { bgFirst.current = false; return; }
    const url = backgroundUrl || "/assets/maps/office_floor.png";
    sceneRef.current?.changeBackground?.(url);
  }, [backgroundUrl]);

  // Agent click → panel
  useEffect(() => {
    const h = (a: AgentSpawn) => setSelectedAgent(agentsRef.current.find((x) => x.id === a.id) ?? null);
    PhaserBus.on(PEVENTS.AGENT_CLICKED, h);
    return () => { PhaserBus.off(PEVENTS.AGENT_CLICKED, h); };
  }, []);

  // Furniture drag → persist
  useEffect(() => {
    const h = ({ id, x, y }: { id: string; x: number; y: number }) => updateFurniture(id, { x, y });
    PhaserBus.on(PEVENTS.FURNITURE_MOVED, h);
    return () => { PhaserBus.off(PEVENTS.FURNITURE_MOVED, h); };
  }, [updateFurniture]);

  // Furniture click in editor → select (for delete)
  useEffect(() => {
    const h = (id: string) => setSelFurnId(id);
    PhaserBus.on(PEVENTS.FURNITURE_SELECTED, h);
    return () => { PhaserBus.off(PEVENTS.FURNITURE_SELECTED, h); };
  }, []);

  // Delete key removes the selected furniture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor && selFurnId && (e.key === "Delete" || e.key === "Backspace")) {
        removeFurniture(selFurnId); setSelFurnId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, selFurnId, removeFurniture]);

  // Sync furniture list → scene (live, no rebuild)
  useEffect(() => {
    const spawns: FurnitureSpawn[] = furniture
      .filter((f) => f.imageUrl)
      .map((f) => ({ id: f.id, url: f.imageUrl!, x: f.x, y: f.y, w: f.width, h: f.height }));
    sceneRef.current?.syncFurniture?.(spawns);
  }, [furniture]);

  // Push status updates
  useEffect(() => {
    sceneRef.current?.updateAgentStatuses?.(agents.map((a) => ({ id: a.id, status: a.status })));
  }, [agents]);

  // Apply adjustable values (Settings tab) live to the scene
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setCharScale?.(settings.charScale);
    s.setWalkSpeed?.(settings.walkSpeed);
    s.setShowLabels?.(settings.showLabels);
    s.setCollision?.(settings.collision);
  }, [settings]);

  const toggleEditor = () => {
    const next = !editor;
    setEditor(next);
    sceneRef.current?.setEditorMode?.(next);
  };

  // Place a catalog item into the scene
  const addFurn = async (name: string, url: string) => {
    const dims = await loadDims(url);
    const ratio = dims.w && dims.h ? dims.w / dims.h : 1.4;
    const h = 90;
    addFurniture({
      id: `f_${Date.now()}`, label: name, imageUrl: url,
      x: 300, y: 300, width: Math.round(h * ratio), height: h, emoji: "🪑",
    });
  };

  // Upload a brand-new catalog item (persists, reusable)
  const uploadFurn = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFurn(true);
    try {
      const url = await upload(file);
      addCatalogItem({ id: `cat_${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ""), url });
    } finally {
      setUploadingFurn(false);
      e.target.value = "";
    }
  };

  // Replace the image of an existing catalog item
  const replaceCatalogImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceCatalogRef.current;
    if (!file || !id) return;
    const url = await upload(file);
    updateCatalogItem(id, { url });
    replaceCatalogRef.current = null;
    e.target.value = "";
  };

  const uploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try { setBackground(await upload(file), "fill"); }
    finally { setUploadingBg(false); }
  };

  // Save uploaded character sprite + apply to the scene live
  const applySprite = async (agentId: string, sprite: any) => {
    setAgentSprite(agentId, sprite);
    const cfg = sprite ?? _def(agents.find((a) => a.id === agentId)?.agent_type ?? "reception");
    if (!cfg) return;
    const dims = await loadDims(cfg.url);
    const cols = cfg.cols || 1, rows = cfg.rows || 1;
    const meta: SpriteMeta = {
      key: keyOf(cfg.url), url: cfg.url,
      frameW: cfg.frameW || Math.floor(dims.w / cols),
      frameH: cfg.frameH || Math.floor(dims.h / rows),
      cols, rows,
    };
    sceneRef.current?.updateAgentSprite?.(agentId, meta);
  };

  const handleChat = useCallback(async () => {
    if (!selectedAgent || !workspace) return;
    const convId = await openOrCreate(selectedAgent.id, workspace.id);
    setActive(convId);
    window.dispatchEvent(new CustomEvent("open-chat"));
    setSelectedAgent(null);
  }, [selectedAgent, workspace, openOrCreate, setActive]);

  const online = agents.filter((a) => a.status !== "OFFLINE" && a.status !== "offline").length;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0e0b16]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-5 py-3 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(5,5,16,0.75), transparent)" }}>
        <span className="text-lg">🏢</span>
        <span className="text-sm font-bold text-white">{officeName}</span>
        <div className="h-4 w-px bg-white/20" />
        <span className="text-xs text-white/60"><span className="text-green-400 font-bold">{online}</span>/{agents.length} online</span>
        {editor
          ? <span className="ml-2 text-xs text-yellow-400 font-bold">✏️ Editor — ลากเฟอร์นิเจอร์เพื่อย้าย</span>
          : <span className="ml-auto text-[11px] text-white/30">คลิกตัวละคร → คุย · คลิกพื้น → เดิน</span>}
      </div>

      {/* Editor toggle */}
      <button onClick={toggleEditor}
        className={`absolute bottom-6 right-6 z-20 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition-all ${
          editor ? "bg-green-500 text-black hover:bg-green-400" : "bg-white/10 border border-white/20 text-white hover:bg-white/15"}`}>
        {editor ? <><Check size={15}/> เสร็จ</> : <><Pencil size={15}/> แก้ไข Office</>}
      </button>

      {/* Editor panel — Phaser-style tabbed resource menu */}
      {editor && (
        <div className="absolute left-4 top-14 bottom-4 w-72 z-20 flex flex-col rounded-2xl border border-primary-500/25 bg-[#1a1730]/92 backdrop-blur-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(34,211,238,0.3)]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10">
            <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-sm font-bold text-transparent">🎨 Office Editor</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/10 p-2">
            {([
              { k: "bg", icon: ImageIcon, label: "ฉากหลัง" },
              { k: "chars", icon: Users, label: "ตัวละคร" },
              { k: "furn", icon: Sofa, label: "เฟอร์นิเจอร์" },
              { k: "settings", icon: SlidersHorizontal, label: "ตั้งค่า" },
            ] as const).map(({ k, icon: Icon, label }) => (
              <button key={k} onClick={() => setTab(k)} title={label}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[9px] font-medium transition-colors ${
                  tab === k ? "bg-primary-600/25 text-primary-300" : "text-white/45 hover:bg-white/5 hover:text-white/70"}`}>
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* ── ฉากหลัง ────────────────────────────────────────── */}
            {tab === "bg" && (
              <div className="space-y-3">
                <label className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-white/15 bg-white/5 py-5 cursor-pointer hover:border-primary-500/50">
                  <ImageIcon size={20} className="text-white/40" />
                  <span className="text-xs text-white/60">{uploadingBg ? "กำลังอัปโหลด…" : "อัปโหลดรูปพื้นหลัง"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={uploadBg} />
                </label>
                {backgroundUrl && (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <img src={backgroundUrl} alt="background" className="h-24 w-full object-cover" />
                  </div>
                )}
                <button onClick={() => setBackground(DEFAULT_BACKGROUND, "fill")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-xs text-white/60 hover:bg-white/10">
                  <RotateCcw size={13} /> คืนค่าพื้นหลังเริ่มต้น
                </button>
              </div>
            )}

            {/* ── ตัวละคร ────────────────────────────────────────── */}
            {tab === "chars" && (
              <div className="space-y-1">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">อัปโหลด sprite ต่อตัวละคร</p>
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                    <span className="text-base">{AGENT_EMOJI[a.agent_type] ?? "🤖"}</span>
                    <span className="flex-1 truncate text-xs text-white/70">{a.name}</span>
                    <span className="rounded px-1.5 py-0.5 text-[9px]"
                      style={{ background: (AGENT_COLORS[a.agent_type] ?? "#6366f1") + "22", color: AGENT_COLORS[a.agent_type] ?? "#6366f1" }}>
                      {agentSprites[a.id] ? "custom" : "default"}
                    </span>
                    <button onClick={() => setSpriteAgent(a)} className="text-white/40 hover:text-primary-400" title="อัปโหลด sprite">
                      <ImageIcon size={13} />
                    </button>
                    {agentSprites[a.id] && (
                      <button onClick={() => applySprite(a.id, null)} className="text-white/30 hover:text-red-400" title="คืนค่าเริ่มต้น">
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── เฟอร์นิเจอร์ ────────────────────────────────────── */}
            {tab === "furn" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">คลิกเพื่อวาง</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {catalog.map((item) => (
                      <button key={item.id} onClick={() => addFurn(item.name, item.url)} title={item.name}
                        className="flex flex-col items-center gap-1 rounded-lg border border-white/8 bg-white/5 p-2 hover:border-primary-500/40 hover:bg-primary-600/10">
                        <img src={item.url} alt={item.name} className="h-8 w-8 object-contain" />
                        <span className="w-full truncate text-center text-[8px] text-white/40">{item.name}</span>
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/5 py-2 hover:border-primary-500/40">
                    <Plus size={13} className="text-white/40" />
                    <span className="text-[11px] text-white/60">{uploadingFurn ? "กำลังอัปโหลด…" : "เพิ่ม furniture (อัปโหลดรูป)"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={uploadFurn} />
                  </label>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">จัดการ catalog ({catalog.length})</p>
                  <div className="space-y-1">
                    {catalog.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
                        <img src={item.url} className="h-5 w-5 shrink-0 object-contain" alt="" />
                        <input value={item.name} onChange={(e) => updateCatalogItem(item.id, { name: e.target.value })}
                          className="min-w-0 flex-1 bg-transparent text-xs text-white/70 outline-none" />
                        <label className="cursor-pointer text-white/30 hover:text-primary-400" title="เปลี่ยนรูป">
                          <ImageIcon size={12} />
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(e) => { replaceCatalogRef.current = item.id; replaceCatalogImg(e); }} />
                        </label>
                        <button onClick={() => removeCatalogItem(item.id)} className="text-white/30 hover:text-red-400" title="ลบออกจาก catalog">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {furniture.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">วางแล้ว ({furniture.length}) — คลิกในฉาก แล้วกด Delete</p>
                    <div className="space-y-1">
                      {furniture.map((f) => (
                        <div key={f.id}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${selFurnId === f.id ? "border border-primary-500/40 bg-primary-600/20" : "border border-transparent bg-white/5"}`}>
                          {f.imageUrl && <img src={f.imageUrl} className="h-5 w-5 object-contain" alt="" />}
                          <span className="flex-1 truncate text-xs text-white/60">{f.label}</span>
                          <button onClick={() => { removeFurniture(f.id); if (selFurnId === f.id) setSelFurnId(null); }}
                            className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ตั้งค่า (ค่าต่างๆ) ──────────────────────────────── */}
            {tab === "settings" && (
              <div className="space-y-5">
                {/* Character size */}
                <div>
                  <div className="mb-1.5 flex justify-between">
                    <span className="text-xs text-white/70">ขนาดตัวละคร</span>
                    <span className="font-mono text-xs text-primary-300">{settings.charScale.toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0.5} max={2} step={0.1} value={settings.charScale}
                    onChange={(e) => updateSettings({ charScale: parseFloat(e.target.value) })}
                    className="w-full accent-pink-500" />
                </div>
                {/* Walk speed */}
                <div>
                  <div className="mb-1.5 flex justify-between">
                    <span className="text-xs text-white/70">ความเร็วเดิน</span>
                    <span className="font-mono text-xs text-primary-300">{settings.walkSpeed}</span>
                  </div>
                  <input type="range" min={30} max={220} step={5} value={settings.walkSpeed}
                    onChange={(e) => updateSettings({ walkSpeed: parseInt(e.target.value) })}
                    className="w-full accent-pink-500" />
                </div>
                {/* Toggles */}
                {([
                  { key: "showLabels" as const, label: "แสดงป้ายชื่อ" },
                  { key: "collision" as const, label: "การชน (กำแพง/เฟอร์นิเจอร์)" },
                ]).map(({ key, label }) => (
                  <button key={key} onClick={() => updateSettings({ [key]: !settings[key] } as any)}
                    className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 hover:bg-white/8">
                    <span className="text-xs text-white/70">{label}</span>
                    <span className={`relative h-5 w-9 rounded-full transition-colors ${settings[key] ? "bg-primary-500" : "bg-white/15"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${settings[key] ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                  </button>
                ))}
                {/* Reset all */}
                <button onClick={() => { if (confirm("รีเซ็ต office ทั้งหมด (พื้นหลัง / เฟอร์นิเจอร์ / ตัวละคร / ค่าต่างๆ)?")) reset(); }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/15 py-2 text-xs text-red-400 hover:bg-red-500/25">
                  <RotateCcw size={13} /> รีเซ็ตทั้งหมด
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent panel */}
      {!editor && selectedAgent && (
        <div className="absolute right-5 top-16 z-10 w-60 animate-slide-up">
          <div className="rounded-2xl border p-5 backdrop-blur-xl"
            style={{ background: "rgba(5,5,22,0.9)", borderColor: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "44" }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "33", border: `2px solid ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}` }}>
                  {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{selectedAgent.name}</p>
                  <p className="text-xs text-white/40 capitalize">{selectedAgent.agent_type} · {selectedAgent.status?.toLowerCase()}</p>
                </div>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="text-white/30 hover:text-white"><X size={15} /></button>
            </div>
            <button onClick={handleChat}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1" }}>
              <MessageSquare size={14} /> คุยกับ {selectedAgent.name}
            </button>
          </div>
        </div>
      )}

      {/* Character sprite upload modal */}
      {spriteAgent && (
        <SpriteUploadModal
          agentName={spriteAgent.name}
          current={agentSprites[spriteAgent.id] ?? null}
          onSave={(sprite) => applySprite(spriteAgent.id, sprite)}
          onClose={() => setSpriteAgent(null)}
        />
      )}
    </div>
  );
}

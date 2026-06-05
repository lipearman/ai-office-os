"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentData } from "@/store/office";
import { useOfficeGameStore } from "@/store/officeGame";
import { defaultSpriteFor } from "@/components/canvas2d/defaultAssets";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useImageUpload } from "@/components/canvas2d/useImageUpload";
import { SpriteUploadModal } from "@/components/canvas2d/SpriteUploadModal";
import { defaultSpriteFor as _def } from "@/components/canvas2d/defaultAssets";
import { PhaserBus, PEVENTS } from "./eventBus";
import type { SceneData, SpriteMeta, AgentSpawn, FurnitureSpawn } from "./OfficeScene";
import { X, MessageSquare, Pencil, Check, ImageIcon, Plus, Trash2, UserCircle } from "lucide-react";

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
  ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

const FURNITURE_CATALOG = [
  "desk", "computer", "chair", "sofa", "coffee_table", "plant", "bookshelf",
  "cabinet", "locker", "vending_machine", "water_dispenser", "whiteboard",
  "notice_board", "box", "door", "stairs",
];
const furnUrl = (n: string) => `/assets/furniture/${n}.png`;

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

  const { backgroundUrl, agentSprites, furniture, addFurniture, updateFurniture, removeFurniture, setBackground, setAgentSprite } = useOfficeGameStore();
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
      };

      const game = new Phaser.Game({
        type: Phaser.AUTO, parent: containerRef.current!,
        width: containerRef.current!.clientWidth, height: containerRef.current!.clientHeight,
        backgroundColor: "#0a0a1a", pixelArt: true,
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

  const toggleEditor = () => {
    const next = !editor;
    setEditor(next);
    sceneRef.current?.setEditorMode?.(next);
  };

  const addFurn = async (name: string) => {
    const url = furnUrl(name);
    const dims = await loadDims(url);
    const ratio = dims.w && dims.h ? dims.w / dims.h : 1.4;
    const h = 90;
    addFurniture({
      id: `f_${Date.now()}`, label: name, imageUrl: url,
      x: 300, y: 300, width: Math.round(h * ratio), height: h, emoji: "🪑",
    });
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
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a1a]">
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

      {/* Editor panel */}
      {editor && (
        <div className="absolute left-4 top-14 bottom-4 w-64 z-20 flex flex-col rounded-2xl border border-white/10 bg-black/85 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
            <span className="text-sm font-bold text-white">🎨 Editor</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Background */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">พื้นหลัง</p>
              <label className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-white/15 bg-white/3 py-4 cursor-pointer hover:border-primary-500/50">
                <ImageIcon size={18} className="text-white/40" />
                <span className="text-xs text-white/60">{uploadingBg ? "กำลังอัปโหลด…" : "อัปโหลดรูปพื้นหลัง"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={uploadBg} />
              </label>
            </div>
            {/* Characters — upload sprite per agent */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">ตัวละคร (อัปโหลด sprite)</p>
              <div className="space-y-1">
                {agents.map((a) => (
                  <button key={a.id} onClick={() => setSpriteAgent(a)}
                    className="flex items-center gap-2 w-full rounded-lg bg-white/3 px-2 py-1.5 hover:bg-white/8 text-left">
                    <span className="text-base">{AGENT_EMOJI[a.agent_type] ?? "🤖"}</span>
                    <span className="text-xs text-white/70 flex-1 truncate">{a.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: (AGENT_COLORS[a.agent_type] ?? "#6366f1") + "22", color: AGENT_COLORS[a.agent_type] ?? "#6366f1" }}>
                      {agentSprites[a.id] ? "custom" : "default"}
                    </span>
                    <UserCircle size={13} className="text-white/30" />
                  </button>
                ))}
              </div>
            </div>
            {/* Furniture palette */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">เฟอร์นิเจอร์ (คลิกเพื่อวาง)</p>
              <div className="grid grid-cols-3 gap-1.5">
                {FURNITURE_CATALOG.map((n) => (
                  <button key={n} onClick={() => addFurn(n)} title={n}
                    className="flex flex-col items-center gap-1 rounded-lg border border-white/8 bg-white/3 p-2 hover:border-primary-500/40 hover:bg-primary-600/10">
                    <img src={furnUrl(n)} alt={n} className="h-8 w-8 object-contain" />
                    <span className="text-[8px] text-white/40 truncate w-full text-center">{n}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Placed furniture list */}
            {furniture.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">วางแล้ว ({furniture.length})</p>
                <div className="space-y-1">
                  {furniture.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/3 px-2 py-1.5">
                      {f.imageUrl && <img src={f.imageUrl} className="h-5 w-5 object-contain" alt="" />}
                      <span className="text-xs text-white/60 flex-1 truncate">{f.label}</span>
                      <button onClick={() => removeFurniture(f.id)} className="text-white/30 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
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

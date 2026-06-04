"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentData } from "@/store/office";
import { useOfficeGameStore } from "@/store/officeGame";
import { defaultSpriteFor } from "@/components/canvas2d/defaultAssets";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { PhaserBus, PEVENTS } from "./eventBus";
import type { SceneData, SpriteMeta, AgentSpawn } from "./OfficeScene";
import { X, MessageSquare } from "lucide-react";

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
  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const { backgroundUrl, agentSprites } = useOfficeGameStore();
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  // Boot Phaser once
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let destroyed = false;

    (async () => {
      const Phaser = (await import("phaser")).default;
      const { OfficeScene } = await import("./OfficeScene");

      // Build sprite metadata (need image dims for frame size)
      const bgUrl = backgroundUrl || "/assets/maps/office_floor.png";
      const spriteByUrl = new Map<string, SpriteMeta>();
      const agentSpawns: AgentSpawn[] = [];

      for (const a of agents) {
        const cfg = agentSprites[a.id] ?? defaultSpriteFor(a.agent_type);
        if (!cfg) continue;
        const key = keyOf(cfg.url);
        if (!spriteByUrl.has(cfg.url)) {
          const dims = await loadDims(cfg.url);
          const cols = cfg.cols || 1;
          const rows = cfg.rows || 1;
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

      if (destroyed) return;

      const sceneData: SceneData = {
        bgKey: keyOf(bgUrl), bgUrl,
        sprites: Array.from(spriteByUrl.values()),
        agents: agentSpawns,
      };

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
        backgroundColor: "#0a0a1a",
        pixelArt: true,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [OfficeScene],
      });
      gameRef.current = game;
      game.scene.start("OfficeScene", sceneData);

      PhaserBus.once(PEVENTS.READY, (scene: any) => { sceneRef.current = scene; });
    })();

    return () => {
      destroyed = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent click → open panel
  useEffect(() => {
    const h = (a: AgentSpawn) => {
      const full = agents.find((x) => x.id === a.id) ?? null;
      setSelectedAgent(full);
    };
    PhaserBus.on(PEVENTS.AGENT_CLICKED, h);
    return () => { PhaserBus.off(PEVENTS.AGENT_CLICKED, h); };
  }, [agents]);

  // Push status updates to scene
  useEffect(() => {
    sceneRef.current?.updateAgentStatuses?.(agents.map((a) => ({ id: a.id, status: a.status })));
  }, [agents]);

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
        <span className="ml-auto text-[11px] text-white/30">คลิกตัวละคร → เลือก · คลิกพื้น → เดินไป</span>
      </div>

      {/* Agent panel */}
      {selectedAgent && (
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
    </div>
  );
}

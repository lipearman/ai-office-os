"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Phaser from "phaser";
import { EventBus, EVENTS } from "./systems/EventBus";
import { FurniturePalette } from "./editor/FurniturePalette";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { cn } from "@/lib/utils";
import { Pencil, X, ZoomIn, ZoomOut, Maximize2, Save } from "lucide-react";
import type { AgentData } from "@/store/office";

interface OfficeGameProps {
  agents: AgentData[];
  officeName: string;
}

export default function OfficeGame({ agents, officeName }: OfficeGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<any>(null);

  const [editorMode, setEditorMode] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const [showPalette, setShowPalette] = useState(false);

  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  // Bootstrap Phaser
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    let game: Phaser.Game;

    const init = async () => {
      const Phaser = (await import("phaser")).default;
      const { PreloadScene } = await import("./scenes/PreloadScene");
      const { OfficeScene } = await import("./scenes/OfficeScene");

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
        backgroundColor: "#050510",
        antialias: true,
        scene: [PreloadScene, OfficeScene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });

      gameRef.current = game;

      // Wait for scene to be ready, then pass agents
      EventBus.once(EVENTS.SCENE_READY, (scene: any) => {
        sceneRef.current = scene;
        scene.updateAgents(agents);
      });

      // Start with agent data
      game.events.once("ready", () => {
        setTimeout(() => {
          const scene = game.scene.getScene("OfficeScene") as any;
          if (scene?.sys?.isActive()) {
            sceneRef.current = scene;
          }
        }, 2000);
      });
    };

    init();

    return () => {
      game?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Update agent statuses when they change
  useEffect(() => {
    sceneRef.current?.updateAgents?.(agents);
  }, [agents]);

  // Listen for agent clicks
  useEffect(() => {
    const handler = ({ agent }: { agent: AgentData }) => setSelectedAgent(agent);
    EventBus.on(EVENTS.AGENT_CLICKED, handler);
    return () => { EventBus.off(EVENTS.AGENT_CLICKED, handler); };
  }, []);

  // Listen for furniture remove
  useEffect(() => {
    const handler = ({ instanceId, roomId }: { instanceId: string; roomId: string }) => {
      sceneRef.current?.removeFurnitureInstance?.(instanceId, roomId);
    };
    EventBus.on(EVENTS.EDITOR_REMOVE, handler);
    return () => { EventBus.off(EVENTS.EDITOR_REMOVE, handler); };
  }, []);

  const toggleEditor = useCallback(() => {
    const next = !editorMode;
    setEditorMode(next);
    setShowPalette(next);
    sceneRef.current?.setEditorMode?.(next);
    if (!next) {
      setSelectedFurniture(null);
      sceneRef.current?.setEditorFurnitureType?.(null);
    }
  }, [editorMode]);

  const handleFurnitureSelect = useCallback((id: string | null) => {
    setSelectedFurniture(id);
    sceneRef.current?.setEditorFurnitureType?.(id);
  }, []);

  const handleChat = useCallback(async () => {
    if (!selectedAgent || !workspace) return;
    const convId = await openOrCreate(selectedAgent.id, workspace.id);
    setActive(convId);
    window.dispatchEvent(new CustomEvent("open-chat"));
    setSelectedAgent(null);
  }, [selectedAgent, workspace, openOrCreate, setActive]);

  const zoomIn  = () => { const s = gameRef.current?.scene.getScene("OfficeScene") as any; s?.cameras?.main?.setZoom(Phaser_zoom(s, 0.1)); };
  const zoomOut = () => { const s = gameRef.current?.scene.getScene("OfficeScene") as any; s?.cameras?.main?.setZoom(Phaser_zoom(s, -0.1)); };
  const resetCam = () => { const s = gameRef.current?.scene.getScene("OfficeScene") as any; if (s) { s.cameras.main.setZoom(0.75); s.cameras.main.centerOn(0, 300); } };

  function Phaser_zoom(scene: any, delta: number) {
    const current = scene?.cameras?.main?.zoom ?? 0.75;
    return Math.max(0.3, Math.min(2, current + delta));
  }

  const AGENT_COLORS: Record<string, string> = {
    reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
    ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
  };
  const AGENT_EMOJI: Record<string, string> = {
    reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
    dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Phaser canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2.5 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #050510dd, transparent)" }}>
        <span className="text-lg">🏢</span>
        <span className="text-sm font-bold text-white">{officeName}</span>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-xs text-white/50">
          <span className="text-green-400 font-bold">{agents.filter(a => a.status !== "OFFLINE").length}</span> / {agents.length} agents online
        </span>
        {editorMode && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-xs text-yellow-400 font-bold animate-pulse">✏️ Editor Mode</span>
            {selectedFurniture && <span className="text-xs text-white/50">— Click floor to place · Click item to remove</span>}
          </>
        )}
      </div>

      {/* Camera controls */}
      <div className="absolute bottom-6 left-4 z-10 flex flex-col gap-1.5 pointer-events-auto">
        {[
          { icon: <ZoomIn size={14}/>, onClick: zoomIn, title: "Zoom In" },
          { icon: <ZoomOut size={14}/>, onClick: zoomOut, title: "Zoom Out" },
          { icon: <Maximize2 size={14}/>, onClick: resetCam, title: "Reset Camera" },
        ].map((b, i) => (
          <button key={i} onClick={b.onClick} title={b.title}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/60 hover:text-white hover:bg-white/10 backdrop-blur-sm transition-all">
            {b.icon}
          </button>
        ))}
      </div>

      {/* Editor toggle */}
      <div className="absolute bottom-6 right-4 z-10 pointer-events-auto">
        <button
          onClick={toggleEditor}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition-all",
            editorMode
              ? "bg-yellow-500 text-black hover:bg-yellow-400"
              : "bg-white/10 border border-white/20 text-white hover:bg-white/15"
          )}
        >
          {editorMode ? <><Save size={14}/> Save Layout</> : <><Pencil size={14}/> Edit Office</>}
        </button>
      </div>

      {/* Furniture palette (editor mode) */}
      {showPalette && editorMode && (
        <div className="absolute left-4 top-14 bottom-16 w-60 z-10 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 overflow-hidden flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-white">Furniture</span>
            <button onClick={() => setShowPalette(false)} className="text-white/30 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <FurniturePalette selected={selectedFurniture} onSelect={handleFurnitureSelect} />
        </div>
      )}

      {/* Agent info panel */}
      {selectedAgent && (
        <div className="absolute right-4 top-14 z-10 w-56 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 pointer-events-auto animate-slide-up">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 flex items-center justify-center rounded-full text-2xl"
                style={{ background: (AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1") + "33", border: `2px solid ${AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1"}` }}>
                {AGENT_EMOJI[selectedAgent.agent_type] ?? "🤖"}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{selectedAgent.name}</p>
                <p className="text-xs text-white/40 capitalize">{selectedAgent.agent_type}</p>
              </div>
            </div>
            <button onClick={() => setSelectedAgent(null)} className="text-white/30 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <button
            onClick={handleChat}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all"
            style={{ background: AGENT_COLORS[selectedAgent.agent_type] ?? "#6366f1" }}
          >
            💬 Chat with {selectedAgent.name}
          </button>
        </div>
      )}
    </div>
  );
}

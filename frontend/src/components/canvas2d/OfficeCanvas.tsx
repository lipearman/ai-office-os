"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import type { AgentData } from "@/store/office";
import type { AgentGameState, FurnitureItem } from "./types";
import {
  makeAgentState, updateAgent,
  drawBackground, drawFurniture, drawAgent,
  loadImage, AGENT_W, AGENT_H,
} from "./engine";
import { useOfficeGameStore } from "@/store/officeGame";
import { defaultSpriteFor } from "./defaultAssets";

interface Props {
  agents: AgentData[];
  selectedAgentId: string | null;
  selectedFurnitureId: string | null;
  editorMode: boolean;
  onAgentClick: (id: string) => void;
  onFurnitureClick: (item: FurnitureItem | null) => void;
}

export interface OfficeCanvasHandle {
  walkSelectedTo: (x: number, y: number) => void;
}

export const OfficeCanvas = forwardRef<OfficeCanvasHandle, Props>(function OfficeCanvas(
  { agents, selectedAgentId, selectedFurnitureId, editorMode, onAgentClick, onFurnitureClick },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<AgentGameState[]>([]);
  const rafRef    = useRef<number>(0);
  const lastRef   = useRef<number>(0);
  const dragRef   = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const wanderRef = useRef<number>(0);

  const selectedIdRef = useRef(selectedAgentId);
  selectedIdRef.current = selectedAgentId;
  const editorRef = useRef(editorMode);
  editorRef.current = editorMode;

  const { backgroundUrl, backgroundFit, furniture, agentSprites, updateFurniture } = useOfficeGameStore();

  // Sync agents
  useEffect(() => {
    const existing = new Map(agentsRef.current.map((a) => [a.id, a]));
    const cw = canvasRef.current?.clientWidth  ?? 900;
    agentsRef.current = agents.map((a, idx) => {
      const prev = existing.get(a.id);
      const sprite = agentSprites[a.id] ?? defaultSpriteFor(a.agent_type);
      if (prev) return { ...prev, status: a.status, sprite, name: a.name };
      const cols = Math.ceil(Math.sqrt(Math.max(agents.length, 1)));
      const col = idx % cols, row = Math.floor(idx / cols);
      const x = 120 + col * ((cw - 240) / Math.max(cols - 1, 1));
      const y = 160 + row * 130;
      return makeAgentState(a.id, a.name, a.agent_type, a.status, x, y, sprite);
    });
  }, [agents, agentSprites]);

  // Preload images
  useEffect(() => {
    if (backgroundUrl) loadImage(backgroundUrl).catch(() => {});
    furniture.forEach((f) => f.imageUrl && loadImage(f.imageUrl).catch(() => {}));
    Object.values(agentSprites).forEach((s) => s?.url && loadImage(s.url).catch(() => {}));
    // Default character sprites
    agents.forEach((a) => {
      const sp = agentSprites[a.id] ?? defaultSpriteFor(a.agent_type);
      if (sp?.url) loadImage(sp.url).catch(() => {});
    });
  }, [backgroundUrl, furniture, agentSprites, agents]);

  // Expose walk method
  useImperativeHandle(ref, () => ({
    walkSelectedTo: (x, y) => {
      const id = selectedIdRef.current;
      if (!id) return;
      agentsRef.current = agentsRef.current.map((a) =>
        a.id === id ? { ...a, targetX: x - AGENT_W / 2, targetY: y - AGENT_H } : a
      );
    },
  }));

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const loop = (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
      }
      const W = canvas.width, H = canvas.height;

      // Idle wander
      wanderRef.current += dt;
      if (wanderRef.current > 3 && !editorRef.current) {
        wanderRef.current = 0;
        for (const a of agentsRef.current) {
          if (a.id === selectedIdRef.current) continue;
          if (a.status === "BUSY" || a.status === "busy") continue;
          if (Math.random() > 0.5 && !a.walking) {
            a.targetX = Math.max(40, Math.min(W - AGENT_W - 40, a.x + (Math.random() - 0.5) * 220));
            a.targetY = Math.max(80, Math.min(H - AGENT_H - 20, a.y + (Math.random() - 0.5) * 160));
          }
        }
      }

      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, backgroundUrl, backgroundFit, W, H);

      const fSorted = [...furniture].sort((a, b) => (a.y + a.height) - (b.y + b.height));
      for (const item of fSorted) drawFurniture(ctx, item, selectedFurnitureId === item.id);

      for (let i = 0; i < agentsRef.current.length; i++) {
        agentsRef.current[i] = updateAgent(agentsRef.current[i], dt);
      }
      const aSorted = [...agentsRef.current].sort((a, b) => a.y - b.y);
      for (const agent of aSorted) {
        drawAgent(ctx, agent, agent.id === selectedIdRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [backgroundUrl, backgroundFit, furniture, selectedFurnitureId]);

  // Input
  const getPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const onDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getPos(e);

    if (editorMode) {
      const f = [...furniture].reverse().find(
        (f) => x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height
      );
      if (f) {
        dragRef.current = { id: f.id, ox: x - f.x, oy: y - f.y };
        onFurnitureClick(f);
      } else {
        onFurnitureClick(null);
      }
      return;
    }

    const agent = [...agentsRef.current].reverse().find(
      (a) => x >= a.x && x <= a.x + AGENT_W && y >= a.y - 24 && y <= a.y + AGENT_H
    );
    if (agent) { onAgentClick(agent.id); return; }

    const id = selectedIdRef.current;
    if (id) {
      agentsRef.current = agentsRef.current.map((a) =>
        a.id === id ? { ...a, targetX: x - AGENT_W / 2, targetY: y - AGENT_H } : a
      );
    }
  }, [editorMode, furniture, getPos, onAgentClick, onFurnitureClick]);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const { x, y } = getPos(e);
    updateFurniture(dragRef.current.id, { x: x - dragRef.current.ox, y: y - dragRef.current.oy });
  }, [getPos, updateFurniture]);

  const onUp = useCallback(() => { dragRef.current = null; }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ cursor: editorMode ? "grab" : "pointer" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    />
  );
});

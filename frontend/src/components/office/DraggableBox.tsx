"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Minus, Plus, GripVertical } from "lucide-react";

interface Pos { x: number; y: number }

export function DraggableBox({ children, title, defaultPos, className, storageKey }: {
  children: ReactNode;
  title: string;
  defaultPos: Pos;
  className?: string;
  storageKey?: string;
}) {
  const loadPos = (): Pos => {
    if (!storageKey) return defaultPos;
    try { const s = localStorage.getItem(storageKey); if (s) { const p = JSON.parse(s); return { x: p.x ?? defaultPos.x, y: p.y ?? defaultPos.y }; } } catch {}
    return defaultPos;
  };
  const [pos, setPos] = useState<Pos>(loadPos);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; elX: number; elY: number; dragging: boolean }>({ startX: 0, startY: 0, elX: 0, elY: 0, dragging: false });
  const posRef = useRef<Pos>(pos);
  posRef.current = pos;
  const elRef = useRef<HTMLDivElement>(null);

  const savePos = useCallback((p: Pos) => {
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch {}
  }, [storageKey]);

  // Keep the box inside its parent — important on small/mobile viewports where a
  // stored desktop position (or a wide default) would render off-screen.
  const clampToParent = useCallback(() => {
    const el = elRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const maxX = Math.max(0, pr.width - el.offsetWidth);
    const maxY = Math.max(0, pr.height - el.offsetHeight);
    setPos((p) => {
      const nx = Math.min(maxX, Math.max(0, p.x));
      const ny = Math.min(maxY, Math.max(0, p.y));
      return nx === p.x && ny === p.y ? p : { x: nx, y: ny };
    });
  }, []);

  useEffect(() => {
    clampToParent();
    window.addEventListener("resize", clampToParent);
    return () => window.removeEventListener("resize", clampToParent);
  }, [clampToParent]);

  // Pointer events cover mouse + touch + pen with a single handler.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // let the minimize button work
    const el = elRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, elX: rect.left - parentRect.left, elY: rect.top - parentRect.top, dragging: true };
    try { el.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const pr = parent.getBoundingClientRect();
      const maxX = Math.max(0, pr.width - el.offsetWidth);
      const maxY = Math.max(0, pr.height - el.offsetHeight);
      const nx = Math.min(maxX, Math.max(0, dragRef.current.elX + ev.clientX - dragRef.current.startX));
      const ny = Math.min(maxY, Math.max(0, dragRef.current.elY + ev.clientY - dragRef.current.startY));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      savePos(posRef.current);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [savePos]);

  return (
    <div ref={elRef}
      style={{ left: pos.x, right: "auto", top: pos.y, bottom: "auto", maxWidth: "calc(100vw - 0.5rem)" }}
      className={`absolute z-30 flex max-h-[calc(100%-0.5rem)] flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md ${className ?? ""} ${minimized ? "min-w-[200px]" : ""}`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 cursor-move select-none touch-none"
        onPointerDown={onPointerDown}>
        <GripVertical size={12} className="text-white/30 shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-white/60 truncate">{title}</span>
        <button onClick={() => setMinimized(!minimized)} className="rounded p-0.5 text-white/40 hover:text-white/80 transition-colors">
          {minimized ? <Plus size={13} /> : <Minus size={13} />}
        </button>
      </div>
      {!minimized && <div className="overflow-auto">{children}</div>}
    </div>
  );
}

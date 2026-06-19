"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
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

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!elRef.current) return;
    const rect = elRef.current.getBoundingClientRect();
    const parent = elRef.current.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, elX: rect.left - parentRect.left, elY: rect.top - parentRect.top, dragging: true };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      const nx = Math.max(0, dragRef.current.elX + ev.clientX - dragRef.current.startX);
      const ny = Math.max(0, dragRef.current.elY + ev.clientY - dragRef.current.startY);
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      savePos(posRef.current);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [savePos]);

  return (
    <div ref={elRef}
      style={{ left: pos.x, right: "auto", top: pos.y, bottom: "auto" }}
      className={`absolute z-30 flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md ${className ?? ""} ${minimized ? "min-w-[200px]" : ""}`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 cursor-move select-none"
        onMouseDown={onMouseDown}>
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

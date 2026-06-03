"use client";

import { FURNITURE_DEFS, type FurnitureDef } from "../data/furnitureDefs";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "desk",    label: "Desks",    emoji: "🖥️" },
  { id: "tech",    label: "Tech",     emoji: "💻" },
  { id: "seat",    label: "Seating",  emoji: "🪑" },
  { id: "lounge",  label: "Lounge",   emoji: "🛋️" },
  { id: "storage", label: "Storage",  emoji: "📚" },
  { id: "deco",    label: "Deco",     emoji: "🌿" },
];

interface Props {
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function FurniturePalette({ selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
      {CATEGORIES.map(cat => {
        const items = FURNITURE_DEFS.filter(f => f.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5 px-1">
              {cat.emoji} {cat.label}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(selected === item.id ? null : item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all",
                    selected === item.id
                      ? "bg-primary-600/30 border border-primary-500/50 text-white"
                      : "border border-white/5 bg-white/3 text-white/70 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <span className="text-base shrink-0">{item.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{item.label}</p>
                    <p className="text-[10px] text-white/30">{item.w}×{item.h}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

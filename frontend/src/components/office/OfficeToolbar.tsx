"use client";

import { Home, ZoomIn, ZoomOut, RotateCcw, Users } from "lucide-react";
import { useThree } from "@react-three/fiber";
import { useOfficeStore } from "@/store/office";
import { cn } from "@/lib/utils";

const ROOM_SHORTCUTS = [
  { type: "lobby",   label: "Lobby",   emoji: "🚪" },
  { type: "ceo",     label: "CEO",     emoji: "👔" },
  { type: "ba",      label: "BA",      emoji: "📊" },
  { type: "dev",     label: "Dev",     emoji: "💻" },
  { type: "dba",     label: "DBA",     emoji: "🗄️" },
  { type: "qa",      label: "QA",      emoji: "🔍" },
  { type: "rag",     label: "Library", emoji: "📚" },
  { type: "meeting", label: "Meeting", emoji: "🤝" },
];

export function OfficeToolbar() {
  const { office, selectedRoom, selectRoom, agents } = useOfficeStore();

  const onlineCount = agents.filter((a) => a.status !== "offline").length;

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center gap-3 pointer-events-none">
        <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-xl pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏢</span>
            <span className="text-sm font-semibold text-white">{office?.name ?? "Office"}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-xl pointer-events-auto">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Users size={13} />
            <span>{onlineCount} agent{onlineCount !== 1 ? "s" : ""} online</span>
          </div>
        </div>
      </div>

      {/* Room shortcuts — bottom bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-xl">
          {ROOM_SHORTCUTS.map(({ type, label, emoji }) => {
            const room = office?.rooms.find((r) => r.room_type === type);
            const isActive = selectedRoom?.room_type === type;
            return (
              <button
                key={type}
                onClick={() => room && selectRoom(isActive ? null : room)}
                disabled={!room}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition-all disabled:opacity-30",
                  isActive
                    ? "bg-primary-600/30 text-primary-300"
                    : "text-white/50 hover:bg-white/10 hover:text-white"
                )}
                title={label}
              >
                <span className="text-base">{emoji}</span>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

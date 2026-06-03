"use client";

import type { AgentData } from "@/store/office";
import { Users, Cpu, Activity, Zap } from "lucide-react";

interface OfficeHUDProps {
  agents: AgentData[];
  officeName: string;
  selectedRoom: string | null;
}

export function OfficeHUD({ agents, officeName, selectedRoom }: OfficeHUDProps) {
  const online  = agents.filter(a => a.status !== "OFFLINE" && a.status !== "offline").length;
  const busy    = agents.filter(a => a.status === "BUSY"    || a.status === "busy").length;
  const idle    = online - busy;

  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-2.5 pointer-events-none"
      style={{ background: "linear-gradient(to bottom, #0a0a1a, transparent)" }}>

      {/* Office name */}
      <div className="flex items-center gap-2 mr-2">
        <span className="text-lg">🏢</span>
        <span className="text-sm font-bold text-white">{officeName}</span>
      </div>

      <div className="h-4 w-px bg-white/10" />

      {/* Stats */}
      <StatChip icon={<Users size={12}/>} label="Staff" value={agents.length} color="#6366f1" />
      <StatChip icon={<Activity size={12}/>} label="Online" value={online} color="#10b981" />
      <StatChip icon={<Zap size={12}/>} label="Busy" value={busy} color="#f59e0b" />
      <StatChip icon={<Cpu size={12}/>} label="Idle" value={idle} color="#3b82f6" />

      {selectedRoom && (
        <>
          <div className="h-4 w-px bg-white/10 ml-2" />
          <div className="flex items-center gap-1.5 rounded-md border border-primary-500/30 bg-primary-600/20 px-2.5 py-1">
            <span className="text-xs text-primary-300">Room selected</span>
          </div>
        </>
      )}

      {/* Right side hint */}
      <div className="ml-auto text-[10px] text-white/25 hidden lg:block">
        Click room to select · Click agent to chat
      </div>
    </div>
  );
}

function StatChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1"
      style={{ background: `${color}18`, border: `1px solid ${color}33` }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-[10px] font-semibold" style={{ color }}>{value}</span>
      <span className="text-[10px] text-white/40 hidden sm:block">{label}</span>
    </div>
  );
}

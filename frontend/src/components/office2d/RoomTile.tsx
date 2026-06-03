"use client";

import { useState } from "react";
import type { AgentData } from "@/store/office";
import type { RoomConfig } from "./constants";
import { AgentSprite } from "./AgentSprite";
import { cn } from "@/lib/utils";

interface RoomTileProps {
  room: RoomConfig;
  agents: AgentData[];
  isSelected: boolean;
  selectedAgent: AgentData | null;
  onSelect: () => void;
  onAgentSelect: (agent: AgentData) => void;
}

export function RoomTile({ room, agents, isSelected, selectedAgent, onSelect, onAgentSelect }: RoomTileProps) {
  const [hovered, setHovered] = useState(false);

  const onlineAgents = agents.filter(a => a.status !== "OFFLINE" && a.status !== "offline");

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative cursor-pointer overflow-hidden transition-all duration-200 select-none"
      style={{
        gridColumn: `${room.gridCol} / span ${room.colSpan}`,
        gridRow:    `${room.gridRow} / span ${room.rowSpan}`,
        background: room.color,
        border: `2px solid ${isSelected ? room.wallColor : hovered ? room.wallColor + "88" : "#1f2937"}`,
        boxShadow: isSelected ? `inset 0 0 40px ${room.wallColor}22, 0 0 20px ${room.wallColor}33` : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Floor texture - subtle grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(${room.wallColor} 1px, transparent 1px), linear-gradient(90deg, ${room.wallColor} 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />

      {/* Wall accent - top border glow */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-200"
        style={{
          background: `linear-gradient(90deg, transparent, ${room.wallColor}, transparent)`,
          opacity: isSelected || hovered ? 1 : 0.3,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 transition-opacity duration-200"
        style={{
          background: `linear-gradient(90deg, transparent, ${room.wallColor}44, transparent)`,
          opacity: isSelected || hovered ? 0.6 : 0.1,
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-1 left-1 h-3 w-3 border-t-2 border-l-2 opacity-40" style={{ borderColor: room.wallColor }} />
      <div className="absolute top-1 right-1 h-3 w-3 border-t-2 border-r-2 opacity-40" style={{ borderColor: room.wallColor }} />
      <div className="absolute bottom-1 left-1 h-3 w-3 border-b-2 border-l-2 opacity-40" style={{ borderColor: room.wallColor }} />
      <div className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 opacity-40" style={{ borderColor: room.wallColor }} />

      {/* Room label */}
      <div className="absolute top-2 left-0 right-0 flex justify-center">
        <div
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-widest"
          style={{
            background: `${room.wallColor}22`,
            border: `1px solid ${room.wallColor}44`,
            color: room.wallColor,
            textShadow: `0 0 8px ${room.wallColor}`,
          }}
        >
          <span>{room.emoji}</span>
          <span>{room.label}</span>
        </div>
      </div>

      {/* Online count badge */}
      {onlineAgents.length > 0 && (
        <div
          className="absolute top-2 right-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: `${room.wallColor}22`, border: `1px solid ${room.wallColor}44`, color: room.wallColor }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          {onlineAgents.length}
        </div>
      )}

      {/* Agents */}
      {agents.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pt-8">
          <div className="flex flex-wrap items-end justify-center gap-3 px-4">
            {agents.map((agent, i) => (
              <AgentSprite
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent?.id === agent.id}
                onClick={() => onAgentSelect(agent)}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty room decoration */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pt-6">
          <div className="flex gap-3 opacity-10">
            {["🖥️", "📋", "🪑"].map((d, i) => (
              <span key={i} style={{ fontSize: 24 }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* Selection overlay */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, ${room.wallColor}11, transparent 70%)` }}
        />
      )}
    </div>
  );
}

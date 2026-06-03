"use client";

import { useState, useCallback } from "react";
import type { AgentData, OfficeData } from "@/store/office";
import { ROOM_LAYOUT, AGENT_ROOM_MAP, type RoomConfig } from "./constants";
import { RoomTile } from "./RoomTile";
import { OfficeHUD } from "./OfficeHUD";
import { AgentPanel } from "./AgentPanel";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";

interface OfficeMapProps {
  office: OfficeData;
  agents: AgentData[];
}

export function OfficeMap({ office, agents }: OfficeMapProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const { openOrCreate, setActive } = useChatStore();
  const { current: workspace } = useWorkspaceStore();

  const selectedRoom = ROOM_LAYOUT.find(r => r.id === selectedRoomId) ?? null;

  // Map each agent to a room
  const agentsByRoom = ROOM_LAYOUT.reduce<Record<string, AgentData[]>>((acc, room) => {
    acc[room.id] = agents.filter(a => {
      const mappedRoom = AGENT_ROOM_MAP[a.agent_type];
      return mappedRoom === room.type || mappedRoom === room.id;
    });
    return acc;
  }, {});

  const handleRoomClick = useCallback((roomId: string) => {
    setSelectedRoomId(prev => prev === roomId ? null : roomId);
    setSelectedAgent(null);
  }, []);

  const handleAgentClick = useCallback((agent: AgentData) => {
    setSelectedAgent(prev => prev?.id === agent.id ? null : agent);
    // Find and select the agent's room
    const roomType = AGENT_ROOM_MAP[agent.agent_type];
    if (roomType) setSelectedRoomId(roomType);
  }, []);

  const handleChat = useCallback(async (agent: AgentData) => {
    if (!workspace) return;
    const convId = await openOrCreate(agent.id, workspace.id);
    setActive(convId);
    window.dispatchEvent(new CustomEvent("open-chat"));
  }, [workspace, openOrCreate, setActive]);

  const handleClose = useCallback(() => {
    setSelectedRoomId(null);
    setSelectedAgent(null);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#050510" }}>
      {/* HUD */}
      <OfficeHUD
        agents={agents}
        officeName={office.name}
        selectedRoom={selectedRoomId}
      />

      {/* Office Grid — slight perspective tilt for depth */}
      <div
        className="absolute inset-0 flex items-center justify-center pt-12 pb-4 px-4"
        onClick={() => handleClose()}
      >
        <div
          className="w-full max-w-6xl"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gridTemplateRows: "repeat(6, 1fr)",
            gap: 3,
            height: "calc(100vh - 80px)",
            // Subtle perspective tilt matching reference images
            transform: "perspective(1200px) rotateX(8deg) scale(0.97)",
            transformOrigin: "center top",
          }}
          onClick={e => e.stopPropagation()}
        >
          {ROOM_LAYOUT.map(room => (
            <RoomTile
              key={room.id}
              room={room}
              agents={agentsByRoom[room.id] ?? []}
              isSelected={selectedRoomId === room.id}
              selectedAgent={selectedAgent}
              onSelect={() => handleRoomClick(room.id)}
              onAgentSelect={handleAgentClick}
            />
          ))}
        </div>
      </div>

      {/* Agent / Room panel */}
      {(selectedRoom || selectedAgent) && (
        <AgentPanel
          room={selectedRoom}
          agent={selectedAgent}
          allAgents={selectedRoom ? (agentsByRoom[selectedRoom.id] ?? []) : []}
          onClose={handleClose}
          onChat={handleChat}
          onSelectAgent={handleAgentClick}
        />
      )}
    </div>
  );
}

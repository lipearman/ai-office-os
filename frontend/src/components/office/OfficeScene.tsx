"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Fog } from "@react-three/drei";
import { useOfficeStore } from "@/store/office";
import { OfficeLighting } from "./Lighting";
import { OfficeFloor } from "./Floor";
import { RoomMesh } from "./RoomMesh";
import { AgentAvatar } from "./AgentAvatar";
import { CameraController } from "./CameraController";
import { FloatingParticles } from "./Particles";

export function OfficeScene() {
  const { office, agents, selectedRoom, selectedAgent, selectRoom, selectAgent } = useOfficeStore();

  const agentsByRoom = agents.reduce<Record<string, typeof agents>>((acc, agent) => {
    if (agent.room_id) {
      if (!acc[agent.room_id]) acc[agent.room_id] = [];
      acc[agent.room_id].push(agent);
    }
    return acc;
  }, {});

  return (
    <Canvas
      shadows
      camera={{ position: [40, 40, 40], fov: 45 }}
      style={{ background: "#0a0a1a" }}
      gl={{ antialias: true, toneMappingExposure: 1.2 }}
    >
      <fog attach="fog" args={["#0a0a1a", 60, 120]} />

      <CameraController />
      <OfficeLighting />
      <FloatingParticles count={100} />

      <Suspense fallback={null}>
        <OfficeFloor />

        {office?.rooms.map((room) => (
          <RoomMesh
            key={room.id}
            room={room}
            isSelected={selectedRoom?.id === room.id}
            hasAgent={(agentsByRoom[room.id]?.length ?? 0) > 0}
            onClick={() => selectRoom(selectedRoom?.id === room.id ? null : room)}
          />
        ))}

        {agents.map((agent) => (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent?.id === agent.id}
            onClick={() => selectAgent(selectedAgent?.id === agent.id ? null : agent)}
          />
        ))}
      </Suspense>
    </Canvas>
  );
}

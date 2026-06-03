"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AgentData } from "@/store/office";

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1",
  ceo:       "#f59e0b",
  ba:        "#10b981",
  dev:       "#3b82f6",
  dba:       "#8b5cf6",
  qa:        "#ef4444",
  rag:       "#ec4899",
};

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖",
  ceo:       "👔",
  ba:        "📊",
  dev:       "💻",
  dba:       "🗄️",
  qa:        "🔍",
  rag:       "📚",
};

interface AgentAvatarProps {
  agent: AgentData;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentAvatar({ agent, isSelected, onClick }: AgentAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const color = AGENT_COLORS[agent.agent_type] ?? "#6366f1";
  const emoji = AGENT_EMOJI[agent.agent_type] ?? "🤖";

  // Bob animation
  useFrame(() => {
    if (!groupRef.current) return;
    const t = Date.now() * 0.001;
    groupRef.current.position.y = agent.position_y + Math.sin(t + agent.position_x) * 0.12;
    if (isSelected || hovered) {
      groupRef.current.rotation.y += 0.02;
    }
  });

  const isOnline = agent.status === "idle" || agent.status === "busy";

  return (
    <group
      ref={groupRef}
      position={[agent.position_x, agent.position_y + 1.0, agent.position_z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Body */}
      <mesh castShadow position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.35, 0.6, 8, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected || hovered ? 0.5 : 0.1}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.6 : 0.15}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Status ring */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.52, 32]} />
        <meshBasicMaterial
          color={agent.status === "busy" ? "#f59e0b" : agent.status === "idle" ? "#10b981" : "#6b7280"}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Selection glow sphere */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.75, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>
      )}

      {/* Name label */}
      <Html position={[0, 2.0, 0]} center distanceFactor={18} zIndexRange={[20, 0]}>
        <div
          className="pointer-events-none select-none rounded-full px-2.5 py-1 text-center shadow-lg"
          style={{
            background: `${color}33`,
            border: `1px solid ${color}77`,
            backdropFilter: "blur(6px)",
          }}
        >
          <span className="text-xs font-bold text-white">{emoji} {agent.name}</span>
          {agent.status === "busy" && (
            <div className="text-[10px] text-yellow-400 animate-pulse">thinking...</div>
          )}
        </div>
      </Html>
    </group>
  );
}

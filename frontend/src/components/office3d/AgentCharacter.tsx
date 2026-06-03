"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AgentData } from "@/store/office";

const AGENT_COLORS: Record<string, string> = {
  reception: "#6366f1", ceo: "#f59e0b", pm: "#f59e0b",
  ba: "#10b981", dev: "#3b82f6", dba: "#8b5cf6", qa: "#ef4444", rag: "#ec4899",
};
const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};
// Hair colors for variety
const HAIR_COLORS: Record<string, number> = {
  reception: 0x1A1A1A, ceo: 0x8B6914, pm: 0x4A3728,
  ba: 0xC4922A, dev: 0x2D2D2D, dba: 0x8B8B00, qa: 0xFF6B6B, rag: 0x6B4EAA,
};
// Shirt colors
const SHIRT_COLORS: Record<string, string> = {
  reception: "#4F46E5", ceo: "#DC2626", pm: "#B45309",
  ba: "#059669", dev: "#1D4ED8", dba: "#7C3AED", qa: "#DC2626", rag: "#9D174D",
};

interface Props {
  agent: AgentData;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCharacter({ agent, position, isSelected, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const [targetPos, setTargetPos] = useState(new THREE.Vector3(...position));
  const currentPos = useRef(new THREE.Vector3(...position));
  const isMoving = useRef(false);
  const [hovered, setHovered] = useState(false);

  const color = AGENT_COLORS[agent.agent_type] ?? "#6366f1";
  const hairColor = HAIR_COLORS[agent.agent_type] ?? 0x1A1A1A;
  const shirtColor = SHIRT_COLORS[agent.agent_type] ?? "#4F46E5";
  const isBusy = agent.status === "BUSY" || agent.status === "busy";

  // Idle wander
  useEffect(() => {
    const baseX = position[0];
    const baseZ = position[2];
    const timer = setInterval(() => {
      if (isBusy) return;
      const nx = baseX + (Math.random() - 0.5) * 2;
      const nz = baseZ + (Math.random() - 0.5) * 2;
      setTargetPos(new THREE.Vector3(nx, position[1], nz));
      isMoving.current = true;
    }, 4000 + Math.random() * 6000);
    return () => clearInterval(timer);
  }, [position, isBusy]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const t = Date.now() * 0.003;

    // Move toward target
    if (isMoving.current) {
      currentPos.current.lerp(targetPos, dt * 2.5);
      groupRef.current.position.copy(currentPos.current);
      if (currentPos.current.distanceTo(targetPos) < 0.05) {
        isMoving.current = false;
      }
      // Walking animation
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x  = Math.sin(t * 4) * 0.4;
        rightLegRef.current.rotation.x = -Math.sin(t * 4) * 0.4;
      }
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x  = -Math.sin(t * 4) * 0.3;
        rightArmRef.current.rotation.x = Math.sin(t * 4) * 0.3;
      }
      // Face direction of movement
      const dir = targetPos.clone().sub(currentPos.current);
      if (dir.length() > 0.1) {
        groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
      }
    } else {
      // Idle bob
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.5 + Math.sin(t + parseFloat(agent.id) || 0) * 0.03;
      }
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
    }

    // Busy thinking animation
    if (isBusy && bodyRef.current) {
      bodyRef.current.rotation.y = Math.sin(t) * 0.1;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.28, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.2} />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.3, 0.38, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
      )}

      {/* Body group with bob */}
      <group ref={bodyRef as any} position={[0, 0.5, 0]}>
        {/* Legs */}
        <mesh ref={leftLegRef} position={[-0.1, -0.28, 0]}>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#1F2937" roughness={0.7} />
        </mesh>
        <mesh ref={rightLegRef} position={[0.1, -0.28, 0]}>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#1F2937" roughness={0.7} />
        </mesh>
        {/* Shoes */}
        {[-0.1, 0.1].map((x, i) => (
          <mesh key={i} position={[x, -0.48, 0.04]}>
            <boxGeometry args={[0.16, 0.1, 0.22]} />
            <meshStandardMaterial color="#111" roughness={0.6} />
          </mesh>
        ))}

        {/* Body/torso */}
        <mesh castShadow>
          <boxGeometry args={[0.38, 0.42, 0.24]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>

        {/* Arms */}
        <mesh ref={leftArmRef} position={[-0.26, 0.02, 0]}>
          <boxGeometry args={[0.13, 0.36, 0.13]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>
        <mesh ref={rightArmRef} position={[0.26, 0.02, 0]}>
          <boxGeometry args={[0.13, 0.36, 0.13]} />
          <meshStandardMaterial color={shirtColor} roughness={0.7} />
        </mesh>
        {/* Hands */}
        {[-0.26, 0.26].map((x, i) => (
          <mesh key={i} position={[x, -0.2, 0]}>
            <sphereGeometry args={[0.075, 8, 8]} />
            <meshStandardMaterial color="#FFDAAA" roughness={0.5} />
          </mesh>
        ))}

        {/* Neck */}
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.12, 8]} />
          <meshStandardMaterial color="#FFDAAA" roughness={0.5} />
        </mesh>

        {/* Head */}
        <group position={[0, 0.47, 0]}>
          {/* Head base */}
          <mesh castShadow>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial color="#FFDAAA" roughness={0.4} />
          </mesh>
          {/* Hair */}
          <mesh position={[0, 0.1, -0.02]}>
            <sphereGeometry args={[0.23, 16, 12]} />
            <meshStandardMaterial color={`#${hairColor.toString(16).padStart(6, "0")}`} roughness={0.8} />
          </mesh>
          {/* Eyes */}
          {[-0.08, 0.08].map((x, i) => (
            <group key={i} position={[x, 0.02, 0.19]}>
              <mesh>
                <circleGeometry args={[0.04, 10]} />
                <meshBasicMaterial color="#1A202C" />
              </mesh>
              {/* Glint */}
              <mesh position={[0.015, 0.015, 0.001]}>
                <circleGeometry args={[0.012, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {/* Smile */}
          <mesh position={[0, -0.05, 0.2]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.06, 0.012, 6, 10, Math.PI]} />
            <meshBasicMaterial color="#C07040" />
          </mesh>
        </group>

        {/* Busy: thought bubble */}
        {isBusy && (
          <group position={[0.3, 0.8, 0]}>
            {[0, 1, 2].map(i => (
              <mesh key={i} position={[i * 0.08, i * 0.08, 0]}>
                <sphereGeometry args={[0.04 + i * 0.02, 8, 8]} />
                <meshStandardMaterial color="#E5E7EB" transparent opacity={0.8} />
              </mesh>
            ))}
            <mesh position={[0.28, 0.32, 0]}>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color="#E5E7EB" transparent opacity={0.9} />
            </mesh>
            <Html position={[0.28, 0.32, 0.13]} center>
              <div style={{ fontSize: 10 }}>💭</div>
            </Html>
          </group>
        )}
      </group>

      {/* Name tag */}
      <Html position={[0, 1.4, 0]} center distanceFactor={6} zIndexRange={[50, 0]}>
        <div
          className="pointer-events-none select-none rounded-full px-2.5 py-0.5 text-center whitespace-nowrap"
          style={{
            background: `${color}cc`,
            border: `1px solid ${color}`,
            fontSize: 11,
            color: "white",
            fontWeight: "bold",
            fontFamily: "system-ui",
            boxShadow: `0 2px 8px ${color}66`,
            opacity: hovered || isSelected ? 1 : 0.85,
          }}
        >
          {AGENT_EMOJI[agent.agent_type]} {agent.name}
        </div>
      </Html>
    </group>
  );
}

"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "@/store/office";

interface RoomMeshProps {
  room: Room;
  isSelected: boolean;
  hasAgent: boolean;
  onClick: () => void;
}

const WALL_HEIGHT = 3.5;
const WALL_THICKNESS = 0.2;

export function RoomMesh({ room, isSelected, hasAgent, onClick }: RoomMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const color = room.config.color ?? "#6366f1";
  const emoji = room.config.emoji ?? "🏠";

  const floorColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.15);
    return c;
  }, [color]);

  const wallColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.3);
    return c;
  }, [color]);

  // Pulse animation when selected
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (isSelected) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.003) * 0.08;
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        0,
        delta * 5
      );
    }
  });

  const w = room.width;
  const d = room.depth;
  const px = room.position_x;
  const pz = room.position_z;

  return (
    <group
      ref={groupRef}
      position={[px, 0, pz]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[w - 0.4, d - 0.4]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>

      {/* Walls */}
      {/* Front */}
      <mesh position={[0, WALL_HEIGHT / 2, d / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.7}
          transparent
          opacity={hovered || isSelected ? 0.6 : 0.85}
        />
      </mesh>
      {/* Back */}
      <mesh position={[0, WALL_HEIGHT / 2, -d / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={wallColor} roughness={0.7} transparent opacity={hovered || isSelected ? 0.4 : 0.85} />
      </mesh>
      {/* Left */}
      <mesh position={[-w / 2, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, d]} />
        <meshStandardMaterial color={wallColor} roughness={0.7} transparent opacity={hovered || isSelected ? 0.4 : 0.85} />
      </mesh>
      {/* Right */}
      <mesh position={[w / 2, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, d]} />
        <meshStandardMaterial color={wallColor} roughness={0.7} transparent opacity={hovered || isSelected ? 0.4 : 0.85} />
      </mesh>

      {/* Ceiling accent glow */}
      <mesh position={[0, WALL_HEIGHT, 0]}>
        <boxGeometry args={[w - 0.2, 0.05, d - 0.2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.8 : 0.3} transparent opacity={0.6} />
      </mesh>

      {/* Selection outline glow */}
      {(hovered || isSelected) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} />
        </mesh>
      )}

      {/* Room label */}
      <Html position={[0, WALL_HEIGHT + 1, 0]} center distanceFactor={20} zIndexRange={[10, 0]}>
        <div
          className="pointer-events-none select-none rounded-lg px-3 py-1.5 text-center shadow-lg"
          style={{
            background: `${color}22`,
            border: `1px solid ${color}55`,
            backdropFilter: "blur(8px)",
            minWidth: "90px",
          }}
        >
          <div className="text-xl leading-none mb-0.5">{emoji}</div>
          <div className="text-xs font-semibold text-white whitespace-nowrap">{room.name}</div>
          {hasAgent && (
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400">Online</span>
            </div>
          )}
        </div>
      </Html>

      {/* Point light inside room */}
      <pointLight
        position={[0, WALL_HEIGHT - 0.5, 0]}
        color={color}
        intensity={isSelected ? 1.5 : 0.4}
        distance={12}
      />
    </group>
  );
}

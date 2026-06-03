"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Cloud({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.position.x += dt * 0.3; });

  return (
    <group ref={ref} position={position}>
      {[
        [0, 0, 0, 2.0, 1.0],
        [1.5, 0.3, 0, 1.5, 0.8],
        [-1.4, 0.2, 0, 1.2, 0.7],
        [0, 0.6, 0, 1.2, 0.7],
      ].map(([x, y, z, rx, ry], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color="#ffffff"
            transparent opacity={0.9}
            roughness={1} metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Sky() {
  return (
    <group>
      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[80, 32, 16]} />
        <meshBasicMaterial side={THREE.BackSide}>
          <primitive
            object={(() => {
              const c = document.createElement("canvas");
              c.width = 2; c.height = 512;
              const ctx = c.getContext("2d")!;
              const g = ctx.createLinearGradient(0, 0, 0, 512);
              g.addColorStop(0, "#5B9BD5");
              g.addColorStop(0.5, "#87CEEB");
              g.addColorStop(1, "#C9E8F5");
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, 2, 512);
              return new THREE.CanvasTexture(c);
            })()}
            attach="map"
          />
        </meshBasicMaterial>
      </mesh>

      {/* Clouds */}
      <Cloud position={[-20, 22, -40]} />
      <Cloud position={[15, 25, -50]} />
      <Cloud position={[-5, 20, -35]} />
      <Cloud position={[30, 24, -45]} />

      {/* City skyline silhouette */}
      {[
        [-35, 0, -38, 3, 14],
        [-28, 0, -38, 4, 10],
        [-22, 0, -38, 3.5, 18],
        [-15, 0, -38, 2.5, 8],
        [-10, 0, -38, 4, 12],
        [-4, 0, -38, 3, 16],
        [2, 0, -38, 5, 9],
        [8, 0, -38, 3, 20],
        [14, 0, -38, 4, 13],
        [20, 0, -38, 3, 11],
        [26, 0, -38, 5, 15],
        [32, 0, -38, 3, 8],
        [38, 0, -38, 4, 18],
      ].map(([x, y, z, w, h], i) => (
        <mesh key={i} position={[x, (h / 2) - 6, z]}>
          <boxGeometry args={[w, h, 2]} />
          <meshStandardMaterial color={i % 3 === 0 ? "#7A8FA6" : i % 3 === 1 ? "#8C9DAB" : "#6B7E8F"} />
        </mesh>
      ))}
    </group>
  );
}

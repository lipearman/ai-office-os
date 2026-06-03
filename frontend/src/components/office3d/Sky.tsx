"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Sky as DreiSky } from "@react-three/drei";
import * as THREE from "three";

function Cloud({ position, speed = 0.2 }: { position: [number, number, number]; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.position.x += dt * speed;
      if (ref.current.position.x > 50) ref.current.position.x = -50;
    }
  });

  return (
    <group ref={ref} position={position}>
      {([
        [0, 0, 0, 2.2], [1.6, 0.3, 0, 1.6], [-1.5, 0.2, 0, 1.3],
        [0.2, 0.7, 0, 1.3], [-0.5, -0.2, 0.5, 1.0],
      ] as [number, number, number, number][]).map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 8, 6]} />
          <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.88} />
        </mesh>
      ))}
    </group>
  );
}

export function Sky() {
  const buildings = useMemo(() => [
    [-35, 14, -38, 3], [-28, 10, -38, 4], [-22, 18, -38, 3.5],
    [-15, 8,  -38, 2.5], [-10, 12, -38, 4], [-4, 16, -38, 3],
    [2,   9,  -38, 5],  [8,  20, -38, 3],  [14, 13, -38, 4],
    [20,  11, -38, 3],  [26, 15, -38, 5],  [32,  8, -38, 3],
    [38,  18, -38, 4],
  ], []);

  return (
    <group>
      {/* Drei procedural sky — no canvas texture needed */}
      <DreiSky
        distance={80}
        sunPosition={[100, 50, 100]}
        inclination={0.49}
        azimuth={0.25}
        turbidity={6}
        rayleigh={0.5}
      />

      {/* Moving clouds */}
      <Cloud position={[-20, 22, -40]} speed={0.15} />
      <Cloud position={[15,  25, -50]} speed={0.10} />
      <Cloud position={[-5,  20, -35]} speed={0.20} />
      <Cloud position={[30,  24, -45]} speed={0.08} />

      {/* City skyline silhouette */}
      {buildings.map(([x, h, z, w], i) => (
        <mesh key={i} position={[x, (h as number) / 2 - 8, z as number]}>
          <boxGeometry args={[w as number, h as number, 1.5]} />
          <meshStandardMaterial color={["#7A8FA6", "#8C9DAB", "#6B7E8F"][i % 3]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

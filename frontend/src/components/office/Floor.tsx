import { useRef } from "react";
import * as THREE from "three";

export function OfficeFloor() {
  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Grid lines */}
      <gridHelper
        args={[100, 50, "#2d2d5e", "#1e1e3f"]}
        position={[0, 0, 0]}
      />

      {/* Corridor paths */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 40]} />
        <meshStandardMaterial color="#16213e" roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 6]} />
        <meshStandardMaterial color="#16213e" roughness={0.6} />
      </mesh>
    </group>
  );
}

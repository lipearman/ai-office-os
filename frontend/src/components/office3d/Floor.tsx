"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { woodTexture, stoneTexture, brickTexture } from "./textures";

export function RooftopFloor() {
  const woodTex   = useMemo(() => woodTexture(), []);
  const stoneTex  = useMemo(() => stoneTexture(), []);
  const brickTex  = useMemo(() => brickTexture(), []);

  // Set texture repeat
  woodTex.repeat.set(4, 4);
  stoneTex.repeat.set(3, 3);
  brickTex.repeat.set(6, 8);

  return (
    <group>
      {/* === Building base / walls === */}
      {/* Front wall */}
      <mesh position={[0, -0.75, 7]} receiveShadow castShadow>
        <boxGeometry args={[22, 1.5, 0.6]} />
        <meshStandardMaterial map={brickTex} roughness={0.9} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-11, -0.75, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.6, 1.5, 14]} />
        <meshStandardMaterial map={brickTex} roughness={0.9} />
      </mesh>
      {/* Right wall */}
      <mesh position={[11, -0.75, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.6, 1.5, 14]} />
        <meshStandardMaterial map={brickTex} roughness={0.9} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, -0.75, -7]} receiveShadow castShadow>
        <boxGeometry args={[22, 1.5, 0.6]} />
        <meshStandardMaterial map={brickTex} roughness={0.9} />
      </mesh>

      {/* === Rooftop ledge (top of walls) === */}
      {[
        [0, 0, 6.8, 22.4, 0.3, 0.8],
        [0, 0, -6.8, 22.4, 0.3, 0.8],
        [-10.8, 0, 0, 0.8, 0.3, 14],
        [10.8, 0, 0, 0.8, 0.3, 14],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} receiveShadow castShadow>
          <boxGeometry args={[w as number, h as number, d as number]} />
          <meshStandardMaterial color="#9CA3AF" roughness={0.8} />
        </mesh>
      ))}

      {/* === Work zone floor (left — wood) === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.5, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 13]} />
        <meshStandardMaterial map={woodTex} roughness={0.7} metalness={0} />
      </mesh>

      {/* === Lounge zone floor (right — stone tiles) === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[7, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 13]} />
        <meshStandardMaterial map={stoneTex} roughness={0.6} metalness={0} />
      </mesh>

      {/* Zone divider — subtle step */}
      <mesh position={[0.5, 0.03, 0]}>
        <boxGeometry args={[0.15, 0.06, 12]} />
        <meshStandardMaterial color="#7a6a50" roughness={0.9} />
      </mesh>

      {/* Corner AC unit */}
      <mesh position={[-8.5, 1.2, -5.5]} castShadow>
        <boxGeometry args={[2.5, 2, 2.5]} />
        <meshStandardMaterial color="#B0B8C0" roughness={0.6} />
      </mesh>
      <mesh position={[-8.5, 1.2, -5.5]}>
        <boxGeometry args={[2.6, 2.1, 2.6]} />
        <meshStandardMaterial color="#9CA3AF" wireframe />
      </mesh>

      {/* Rooftop door */}
      <mesh position={[-8.5, 1.5, -4]} castShadow>
        <boxGeometry args={[1.5, 3, 0.15]} />
        <meshStandardMaterial color="#5C4033" roughness={0.8} />
      </mesh>
      <mesh position={[-8.5, 3.2, -4]}>
        <boxGeometry args={[2.5, 0.5, 0.3]} />
        <meshStandardMaterial color="#4B3728" roughness={0.9} />
      </mesh>

      {/* Ladder beside door */}
      <mesh position={[-9.5, 1.5, -4.5]}>
        <boxGeometry args={[0.1, 3, 0.1]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-9.2, 1.5, -4.5]}>
        <boxGeometry args={[0.1, 3, 0.1]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      {[-0.5, 0, 0.5, 1, 1.5].map((y, i) => (
        <mesh key={i} position={[-9.35, y, -4.5]}>
          <boxGeometry args={[0.4, 0.08, 0.08]} />
          <meshStandardMaterial color="#666" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* String light poles */}
      {[[-9, 5, -5.5], [9, 5, -5.5]].map(([x, y, z], i) => (
        <group key={i}>
          <mesh position={[x, y / 2, z]}>
            <cylinderGeometry args={[0.06, 0.06, y, 8]} />
            <meshStandardMaterial color="#2D2D2D" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* String lights */}
      <StringLights />
    </group>
  );
}

function StringLights() {
  const bulbs = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const sag = Math.sin(t * Math.PI) * 0.6;
      pts.push([-9 + t * 18, 4.8 - sag, -5.4]);
    }
    return pts;
  }, []);

  return (
    <group>
      {/* Wire */}
      {bulbs.slice(0, -1).map(([x, y, z], i) => {
        const [nx, ny, nz] = bulbs[i + 1];
        const mx = (x + nx) / 2; const my = (y + ny) / 2; const mz = (z + nz) / 2;
        const len = Math.sqrt((nx-x)**2 + (ny-y)**2 + (nz-z)**2);
        return (
          <mesh key={i} position={[mx, my, mz]}>
            <cylinderGeometry args={[0.015, 0.015, len, 4]} />
            <meshStandardMaterial color="#1A1A1A" />
          </mesh>
        );
      })}

      {/* Bulbs */}
      {bulbs.filter((_, i) => i % 2 === 0).map(([x, y, z], i) => (
        <group key={i} position={[x, y - 0.15, z]}>
          <mesh>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial
              color="#FFF8E7" emissive="#FFF0A0" emissiveIntensity={1.5}
              transparent opacity={0.9}
            />
          </mesh>
          <pointLight color="#FFF8E7" intensity={0.3} distance={3} />
        </group>
      ))}
    </group>
  );
}

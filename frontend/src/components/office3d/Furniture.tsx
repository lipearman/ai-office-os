"use client";

import { useMemo } from "react";
import { Text, Html } from "@react-three/drei";
import * as THREE from "three";
import { woodTexture } from "./textures";

// Reusable wood material
function WoodMesh({ args, position, rotation, color = "#8B6914" }: any) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
    </mesh>
  );
}

export function Desk({ position, hasLaptop = true, hasMonitor = false }: {
  position: [number, number, number]; hasLaptop?: boolean; hasMonitor?: boolean;
}) {
  return (
    <group position={position}>
      {/* Tabletop */}
      <WoodMesh args={[1.6, 0.08, 0.9]} position={[0, 0.52, 0]} color="#9E7A1E" />
      {/* Legs */}
      {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z], i) => (
        <WoodMesh key={i} args={[0.08, 1.0, 0.08]} position={[x * 0.95, 0, z * 0.85]} color="#7A5C0E" />
      ))}
      {/* Drawer */}
      <WoodMesh args={[1.4, 0.25, 0.08]} position={[0, 0.25, 0.42]} color="#8B6914" />
      <mesh position={[0, 0.25, 0.48]}>
        <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
        <meshStandardMaterial color="#C0A060" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Mug */}
      <group position={[0.5, 0.6, 0.2]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.06, 0.12, 12]} />
          <meshStandardMaterial color="#E8E8E8" roughness={0.5} />
        </mesh>
        <mesh position={[0.1, 0.02, 0]}>
          <torusGeometry args={[0.06, 0.015, 8, 12, Math.PI]} />
          <meshStandardMaterial color="#E8E8E8" roughness={0.5} />
        </mesh>
        {/* Coffee */}
        <mesh position={[0, 0.055, 0]}>
          <cylinderGeometry args={[0.062, 0.062, 0.01, 12]} />
          <meshStandardMaterial color="#3D1C02" roughness={0.3} />
        </mesh>
      </group>

      {/* Laptop */}
      {hasLaptop && (
        <group position={[-0.1, 0.56, 0.05]}>
          {/* Base */}
          <mesh>
            <boxGeometry args={[0.7, 0.03, 0.5]} />
            <meshStandardMaterial color="#C0C0C0" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Screen */}
          <mesh position={[0, 0.25, -0.22]} rotation={[Math.PI / 3.5, 0, 0]}>
            <boxGeometry args={[0.68, 0.45, 0.02]} />
            <meshStandardMaterial color="#C0C0C0" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Screen content */}
          <mesh position={[0, 0.25, -0.21]} rotation={[Math.PI / 3.5, 0, 0]}>
            <planeGeometry args={[0.6, 0.38]} />
            <meshStandardMaterial color="#1a2744" emissive="#1a2744" emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}

      {/* Monitor */}
      {hasMonitor && (
        <group position={[0, 0.56, -0.15]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[0.9, 0.55, 0.03]} />
            <meshStandardMaterial color="#2D2D2D" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.4, 0.01]}>
            <planeGeometry args={[0.84, 0.5]} />
            <meshStandardMaterial color="#0d1b35" emissive="#0d1b35" emissiveIntensity={0.5} />
          </mesh>
          {/* Stand */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.08, 0.25, 0.08]} />
            <meshStandardMaterial color="#2D2D2D" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.3, 0.04, 0.2]} />
            <meshStandardMaterial color="#2D2D2D" roughness={0.4} />
          </mesh>
          {/* Keyboard */}
          <mesh position={[0, 0.57, 0.3]}>
            <boxGeometry args={[0.7, 0.02, 0.22]} />
            <meshStandardMaterial color="#CCCCCC" roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function Chair({ position, color = "#D97706" }: {
  position: [number, number, number]; color?: string;
}) {
  return (
    <group position={position}>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.6, 0.1, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.8, -0.25]} castShadow>
        <boxGeometry args={[0.6, 0.7, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Legs */}
      {[[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.45, 8]} />
          <meshStandardMaterial color="#7A5C0E" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export function Couch({ position, length = 2, color = "#9D174D" }: {
  position: [number, number, number]; length?: number; color?: string;
}) {
  const dark = new THREE.Color(color).multiplyScalar(0.7).getStyle();
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[length, 0.4, 0.75]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      {/* Cushions */}
      {Array.from({ length: Math.round(length) }).map((_, i) => {
        const cx = -length / 2 + 0.5 + i * 1;
        return (
          <mesh key={i} position={[cx, 0.53, 0]} castShadow>
            <boxGeometry args={[0.85, 0.18, 0.65]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        );
      })}
      {/* Backrest */}
      <mesh position={[0, 0.72, -0.32]} castShadow>
        <boxGeometry args={[length, 0.52, 0.18]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      {/* Armrests */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (length / 2 + 0.08), 0.62, 0]} castShadow>
          <boxGeometry args={[0.16, 0.6, 0.75]} />
          <meshStandardMaterial color={dark} roughness={0.8} />
        </mesh>
      ))}
      {/* Pillows on corners */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (length / 2 - 0.2), 0.68, 0.1]} rotation={[0, 0, side * 0.15]}>
          <boxGeometry args={[0.3, 0.32, 0.12]} />
          <meshStandardMaterial color={i === 0 ? "#F59E0B" : "#3B82F6"} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export function Armchair({ position, color = "#065F46" }: {
  position: [number, number, number]; color?: string;
}) {
  const dark = new THREE.Color(color).multiplyScalar(0.7).getStyle();
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.8, 0.4, 0.75]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.54, 0]} castShadow>
        <boxGeometry args={[0.75, 0.15, 0.68]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.78, -0.3]} castShadow>
        <boxGeometry args={[0.8, 0.55, 0.14]} />
        <meshStandardMaterial color={dark} roughness={0.8} />
      </mesh>
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * 0.42, 0.68, 0]} castShadow>
          <boxGeometry args={[0.14, 0.55, 0.75]} />
          <meshStandardMaterial color={dark} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <WoodMesh args={[0.9, 0.06, 0.6]} position={[0, 0.35, 0]} color="#B07820" />
      {[[-0.38, -0.25], [0.38, -0.25], [-0.38, 0.25], [0.38, 0.25]].map(([x, z], i) => (
        <WoodMesh key={i} args={[0.05, 0.68, 0.05]} position={[x, 0, z]} color="#8B6914" />
      ))}
      {/* Items on table */}
      <mesh position={[0.2, 0.4, 0.1]}>
        <cylinderGeometry args={[0.06, 0.05, 0.1, 10]} />
        <meshStandardMaterial color="#E8E8E8" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Plant({ position, size = 1.0 }: {
  position: [number, number, number]; size?: number;
}) {
  return (
    <group position={position} scale={[size, size, size]}>
      {/* Pot */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.35, 10]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 10]} />
        <meshStandardMaterial color="#3D2B1F" roughness={1} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.4, 8]} />
        <meshStandardMaterial color="#2D5A1B" roughness={0.8} />
      </mesh>
      {/* Leaves */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const alt = i % 2 === 0 ? 0.1 : 0;
        return (
          <mesh
            key={i}
            position={[Math.sin(rad) * 0.3, 0.7 + alt, Math.cos(rad) * 0.3]}
            rotation={[0.4, rad, 0.2]}
          >
            <boxGeometry args={[0.35, 0.03, 0.2]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#22C55E" : "#16A34A"}
              roughness={0.6} side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function PlantBox({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Box */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[2.5, 0.35, 0.5]} />
        <meshStandardMaterial color="#6B4423" roughness={0.9} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[2.4, 0.04, 0.4]} />
        <meshStandardMaterial color="#3D2B1F" roughness={1} />
      </mesh>
      {/* Plants */}
      {[-0.8, 0, 0.8].map((x, i) => (
        <group key={i} position={[x, 0.45, 0]}>
          {[0, 1, 2, 3].map(j => {
            const angle = (j / 4) * Math.PI * 2;
            return (
              <mesh key={j} position={[Math.sin(angle) * 0.15, 0.25 + j * 0.1, Math.cos(angle) * 0.1]}
                rotation={[0.5, angle, 0]}>
                <boxGeometry args={[0.25, 0.03, 0.12]} />
                <meshStandardMaterial color={["#22C55E","#16A34A","#4ADE80"][j % 3]} side={THREE.DoubleSide} roughness={0.6} />
              </mesh>
            );
          })}
          {/* Flowers */}
          {i % 2 === 0 && (
            <mesh position={[0, 0.6, 0]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshStandardMaterial color={["#A855F7","#EC4899","#F59E0B"][i]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export function VendingMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.8, 2.0, 0.6]} />
        <meshStandardMaterial color="#2D3748" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.3, 0.31]}>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial color="#1a3a5c" emissive="#1a4a6c" emissiveIntensity={0.6} />
      </mesh>
      {/* Colorful items visible */}
      {[
        [-0.15, 0.9, "#EF4444"], [0.05, 0.9, "#3B82F6"], [0.2, 0.9, "#10B981"],
        [-0.15, 0.7, "#F59E0B"], [0.05, 0.7, "#8B5CF6"],
      ].map(([x, y, c], i) => (
        <mesh key={i} position={[x as number, y as number, 0.305]}>
          <boxGeometry args={[0.12, 0.14, 0.01]} />
          <meshStandardMaterial color={c as string} />
        </mesh>
      ))}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.82, 0.1, 0.62]} />
        <meshStandardMaterial color="#1A202C" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function WaterCooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 1.1, 12]} />
        <meshStandardMaterial color="#E5E7EB" roughness={0.4} />
      </mesh>
      {/* Water bottle */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.6, 12]} />
        <meshStandardMaterial color="#BFDBFE" transparent opacity={0.8} roughness={0.1} />
      </mesh>
      {/* Spigots */}
      {[[-0.06, 0], [0.06, 0]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, 0.2]} castShadow>
          <boxGeometry args={[0.04, 0.1, 0.08]} />
          <meshStandardMaterial color={i === 0 ? "#EF4444" : "#3B82F6"} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function Bookshelf({ position }: { position: [number, number, number] }) {
  const bookColors = ["#EF4444","#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#6366F1","#14B8A6"];
  return (
    <group position={position}>
      {/* Frame */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[1.4, 1.8, 0.35]} />
        <meshStandardMaterial color="#5C3D11" roughness={0.8} />
      </mesh>
      {/* Shelves + books */}
      {[0.3, 0.85, 1.4].map((y, si) => (
        <group key={si}>
          <mesh position={[0, y, 0.01]}>
            <boxGeometry args={[1.32, 0.06, 0.3]} />
            <meshStandardMaterial color="#7A5C0E" roughness={0.7} />
          </mesh>
          {Array.from({ length: 8 }).map((_, bi) => (
            <mesh key={bi} position={[-0.55 + bi * 0.16, y + 0.22, 0.02]}>
              <boxGeometry args={[0.12, 0.3, 0.22]} />
              <meshStandardMaterial color={bookColors[(si * 8 + bi) % bookColors.length]} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Umbrella({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#9CA3AF" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, 2.6, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[1.8, 0.6, 12, 1, true]} />
        <meshStandardMaterial color="#D2B48C" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {/* Canopy ribs */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[0, 2.4, 0]} rotation={[0, angle, 0.5]}>
            <cylinderGeometry args={[0.015, 0.015, 1.8, 4]} />
            <meshStandardMaterial color="#A67C52" roughness={0.6} />
          </mesh>
        );
      })}
      {/* Pole base */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.3, 0.35, 0.1, 12]} />
        <meshStandardMaterial color="#7A7A7A" roughness={0.8} />
      </mesh>
    </group>
  );
}

export function SignBoard({ position, text1, text2, text3 }: {
  position: [number, number, number]; text1?: string; text2?: string; text3?: string;
}) {
  return (
    <group position={position}>
      {/* Board */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.05]} />
        <meshStandardMaterial color="#2D1B0E" roughness={0.9} />
      </mesh>
      {/* Legs */}
      {[-0.22, 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.1, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
          <meshStandardMaterial color="#1A0F08" roughness={0.9} />
        </mesh>
      ))}
      {/* Text */}
      <Html position={[0, 0.6, 0.06]} center transform distanceFactor={3}>
        <div className="text-center pointer-events-none" style={{ width: 70 }}>
          {[text1, text2, text3].filter(Boolean).map((t, i) => (
            <div key={i} style={{ fontSize: 9, color: "#E8D5B0", fontFamily: "Georgia, serif", lineHeight: 1.4 }}>{t}</div>
          ))}
        </div>
      </Html>
    </group>
  );
}

export function StorageBox({ position, stack = 1 }: {
  position: [number, number, number]; stack?: number;
}) {
  return (
    <group position={position}>
      {Array.from({ length: stack }).map((_, i) => (
        <group key={i} position={[i % 2 === 1 ? 0.3 : 0, i * 0.38, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.36, 0.45]} />
            <meshStandardMaterial color="#D2A679" roughness={0.8} />
          </mesh>
          {/* Arrow */}
          <Html position={[0, 0.1, 0.23]} center transform distanceFactor={2.5}>
            <div style={{ fontSize: 16 }}>📦</div>
          </Html>
        </group>
      ))}
    </group>
  );
}


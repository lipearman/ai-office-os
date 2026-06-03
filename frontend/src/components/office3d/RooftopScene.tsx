"use client";

import { Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { AgentData } from "@/store/office";
import { Sky } from "./Sky";
import { RooftopFloor } from "./Floor";
import {
  Desk, Chair, Couch, Armchair, CoffeeTable,
  Plant, PlantBox, VendingMachine, WaterCooler,
  Bookshelf, Umbrella, SignBoard, StorageBox,
} from "./Furniture";
import { AgentCharacter } from "./AgentCharacter";

// Agent starting positions (rooftop layout)
const AGENT_POSITIONS: Record<string, [number, number, number]> = {
  reception: [2,  0, 0],
  ceo:       [-4, 0, -3],
  pm:        [-2, 0, -3],
  ba:        [-3, 0, 1],
  dev:       [-1, 0, 2],
  dba:       [1,  0, -2],
  qa:        [3,  0, 1],
  rag:       [5,  0, -2],
};

interface Props {
  agents: AgentData[];
  onAgentClick: (agent: AgentData) => void;
  selectedAgentId: string | null;
}

export function RooftopScene({ agents, onAgentClick, selectedAgentId }: Props) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ background: "#87CEEB" }}
    >
      {/* Isometric-style orthographic camera */}
      <OrthographicCamera
        makeDefault
        zoom={55}
        position={[14, 14, 14]}
        near={0.1}
        far={500}
      />

      <OrbitControls
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        minZoom={30}
        maxZoom={120}
        maxPolarAngle={Math.PI / 2.5}
        minPolarAngle={Math.PI / 6}
        enableDamping
        dampingFactor={0.06}
        target={[0, 0, 0]}
      />

      {/* Lighting — bright sunny like the reference */}
      <ambientLight intensity={0.8} color="#E8F4FF" />
      <directionalLight
        position={[20, 30, 10]}
        intensity={2.0}
        color="#FFF8E7"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} color="#C8E0FF" />

      <Suspense fallback={null}>
        {/* Sky + background */}
        <Sky />

        {/* Rooftop structure + floors */}
        <RooftopFloor />

        {/* ===== WORK ZONE (left side, wood floor) ===== */}
        {/* Desks with monitors */}
        <Desk position={[-5.5, 0, -1.5]} hasMonitor hasLaptop={false} />
        <Chair position={[-5.5, 0, -0.5]} color="#D97706" />
        <Desk position={[-2.5, 0, -1.5]} hasMonitor hasLaptop={false} />
        <Chair position={[-2.5, 0, -0.5]} color="#B45309" />

        {/* Desks with laptops */}
        <Desk position={[-5.5, 0, 1.5]} hasLaptop />
        <Chair position={[-5.5, 0, 2.5]} color="#D97706" />
        <Desk position={[-2.5, 0, 1.5]} hasLaptop />
        <Chair position={[-2.5, 0, 2.5]} color="#B45309" />

        {/* Plants work zone */}
        <Plant position={[-9.5, 0, 3]} size={1.2} />
        <Plant position={[-9.5, 0, -3]} size={0.9} />
        <Plant position={[0.2, 0, -3.5]} size={0.8} />

        {/* Storage boxes */}
        <StorageBox position={[-9, 0, -4]} stack={2} />
        <StorageBox position={[-8.4, 0, -4]} stack={1} />

        {/* Chalkboard sign */}
        <SignBoard position={[-8.5, 0, 0.5]} text1="Work" text2="Create" text3="Relax ♡" />

        {/* Plant box along back wall */}
        <PlantBox position={[-4.5, 0, -5.5]} />
        <PlantBox position={[1.5, 0, -5.5]} />

        {/* ===== LOUNGE ZONE (right side, stone floor) ===== */}
        {/* Couch + chairs arrangement */}
        <Couch position={[5, 0, -1]} length={2.5} color="#9D174D" />
        <Couch position={[8.5, 0, 1.5]} length={2.5} color="#1E40AF" />
        <Armchair position={[3.5, 0, 1]} color="#065F46" />
        <CoffeeTable position={[5.5, 0, 1]} />

        {/* Umbrella */}
        <Umbrella position={[8, 0, -2.5]} />

        {/* Vending + water cooler */}
        <VendingMachine position={[2.5, 0, -5]} />
        <WaterCooler position={[3.5, 0, -5]} />

        {/* Bookshelf */}
        <Bookshelf position={[9.5, 0, -4]} />

        {/* Lounge plants */}
        <Plant position={[5, 0, -4.5]} size={1.3} />
        <Plant position={[9.5, 0, 4.5]} size={1.0} />

        {/* Good vibes sign */}
        <SignBoard position={[9, 0, 3]} text1="Good" text2="Vibes" text3="Only 🙂" />

        {/* ===== AGENTS ===== */}
        {agents.map((agent) => {
          const pos = AGENT_POSITIONS[agent.agent_type] ?? [0, 0, 0];
          return (
            <AgentCharacter
              key={agent.id}
              agent={agent}
              position={pos}
              isSelected={selectedAgentId === agent.id}
              onClick={() => onAgentClick(agent)}
            />
          );
        })}
      </Suspense>
    </Canvas>
  );
}

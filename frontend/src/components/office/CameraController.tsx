"use client";

import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useOfficeStore } from "@/store/office";

export function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const cameraTarget = useOfficeStore((s) => s.cameraTarget);
  const targetVec = useRef(new THREE.Vector3(...cameraTarget));

  // Isometric starting position
  useEffect(() => {
    camera.position.set(40, 40, 40);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Smooth pan to selected room
  useEffect(() => {
    targetVec.current.set(...cameraTarget);
  }, [cameraTarget]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const t = controlsRef.current.target as THREE.Vector3;
    t.lerp(targetVec.current, delta * 3);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={15}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2.2}
      minPolarAngle={Math.PI / 6}
      makeDefault
    />
  );
}

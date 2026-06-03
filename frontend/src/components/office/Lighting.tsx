export function OfficeLighting() {
  return (
    <>
      <ambientLight intensity={0.6} color="#e0e7ff" />
      <directionalLight
        position={[30, 50, 30]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <directionalLight position={[-20, 30, -20]} intensity={0.3} color="#818cf8" />
      <pointLight position={[0, 20, 0]} intensity={0.5} color="#c7d2fe" distance={60} />
    </>
  );
}

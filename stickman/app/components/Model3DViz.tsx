"use client";

import { memo, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import * as THREE from "three";

interface Model3DVizProps {
  imuRef: React.RefObject<{
    ax: number; ay: number; az: number;
    gx: number; gy: number; gz: number;
    p: number; r: number; t: number;
  }>;
}

// Smoothed quaternion representing device orientation
function DeviceModel({ imuRef }: Model3DVizProps) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());

  useFrame(() => {
    if (!groupRef.current || !imuRef.current) return;

    const { ax, ay, az } = imuRef.current;

    // Compute pitch and roll from accelerometer
    const pitch = Math.atan2(ax, Math.sqrt(ay * ay + az * az));
    const roll = Math.atan2(ay, Math.sqrt(ax * ax + az * az));

    // Build target quaternion from euler angles
    // Device orientation: pitch around X, roll around Z
    const targetEuler = new THREE.Euler(roll, 0, -pitch, "XYZ");
    const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

    // Smooth interpolation
    smoothQuat.current.slerp(targetQuat, 0.15);
    groupRef.current.quaternion.copy(smoothQuat.current);
  });

  return (
    <group ref={groupRef}>
      {/* Simple stylized device representation */}
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[1, 2.4, 0.35]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0.15, 0.18]}>
        <boxGeometry args={[0.7, 1.5, 0.01]} />
        <meshStandardMaterial color="#2a4066" emissive="#1a3050" emissiveIntensity={0.5} metalness={0.1} roughness={0.2} />
      </mesh>
      {/* Button A (front) */}
      <mesh position={[0, -0.9, 0.19]}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
        <meshStandardMaterial color="#333355" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* USB port (bottom) */}
      <mesh position={[0, -1.22, 0]}>
        <boxGeometry args={[0.3, 0.08, 0.15]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* LED indicator */}
      <mesh position={[0.25, 0.95, 0.19]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={2} />
      </mesh>
      {/* Orientation indicator line (points "up" from screen) */}
      <mesh position={[0, 0, 0.25]}>
        <coneGeometry args={[0.08, 0.3, 8]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Scene({ imuRef }: Model3DVizProps) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
      <pointLight position={[-3, 4, -3]} intensity={0.3} color="#6688ff" />

      <DeviceModel imuRef={imuRef} />

      <Grid
        position={[0, -2.5, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a1a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2a2a5a"
        fadeDistance={15}
        infiniteGrid
      />

      <Environment preset="night" />
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={10}
        autoRotate={false}
      />
    </>
  );
}

export const Model3DViz = memo(function Model3DViz({ imuRef }: Model3DVizProps) {
  return (
    <div className="absolute inset-0 w-full h-full" style={{ background: "#050510" }}>
      <Canvas
        camera={{ position: [3, 2, 4], fov: 45 }}
        shadows
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <Scene imuRef={imuRef} />
        </Suspense>
      </Canvas>
    </div>
  );
});

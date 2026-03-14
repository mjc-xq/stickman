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

// Maps device accelerometer gravity vector to 3D model orientation.
//
// Device axes (M5StickC Plus 2, portrait, USB at bottom):
//   +X = right edge, +Y = down (USB), +Z = out of screen
//
// Calibration: device flat on back, screen up → gravity = (0, 0, -1) in device coords
//   (gravity pulls through the back, so az ≈ -1g)
//
// Three.js: +X = right, +Y = up, +Z = toward camera
// We map: device X → Three.js X, device Y → Three.js -Z, device Z → Three.js Y
//
// The model is built with its "screen" facing +Z and long axis along +Y.
// At rest (device flat, screen up), model should lie flat with screen facing +Y.

const REST_UP = new THREE.Vector3(0, 1, 0); // model's "up" = screen normal

function DeviceModel({ imuRef }: Model3DVizProps) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());

  useFrame(() => {
    if (!groupRef.current || !imuRef.current) return;

    const { ax, ay, az, gz } = imuRef.current;

    // Gravity vector in device coords (normalized)
    const gLen = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    const gnx = ax / gLen;
    const gny = ay / gLen;
    const gnz = az / gLen;

    // Screen normal = opposite of gravity (screen faces away from pull)
    // Map device coords to Three.js: devX→X, devY→-Z, devZ→Y
    const screenDir = new THREE.Vector3(-gnx, -gnz, gny);
    screenDir.normalize();

    // Build quaternion: rotate REST_UP to match screenDir
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(REST_UP, screenDir);

    // Add yaw rotation from gyroscope Z (device Z → Three.js Y axis)
    // Integrate gyro for smooth yaw tracking
    const dt = 1 / 60; // approximate frame time
    const yawDelta = -gz * dt * (Math.PI / 180); // degrees to radians
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      screenDir, yawDelta
    );

    targetQuat.premultiply(yawQuat);

    // Smooth interpolation
    smoothQuat.current.slerp(targetQuat, 0.12);
    groupRef.current.quaternion.copy(smoothQuat.current);
  });

  return (
    <group ref={groupRef}>
      {/* Device model oriented so screen normal = +Y (up at rest)
          Long axis (USB to top) = Z, width = X, thickness = Y */}
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[1, 0.35, 2.4]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Screen face (on +Y side) */}
      <mesh position={[0, 0.18, -0.15]}>
        <boxGeometry args={[0.7, 0.01, 1.5]} />
        <meshStandardMaterial color="#2a4066" emissive="#1a3050" emissiveIntensity={0.5} metalness={0.1} roughness={0.2} />
      </mesh>
      {/* Button A (on screen side) */}
      <mesh position={[0, 0.19, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
        <meshStandardMaterial color="#333355" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* USB port (at +Z end = "bottom" when held) */}
      <mesh position={[0, 0, 1.22]}>
        <boxGeometry args={[0.3, 0.15, 0.08]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* LED indicator */}
      <mesh position={[0.25, 0.19, -0.95]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={2} />
      </mesh>
      {/* Orientation arrow (points away from screen = +Y) */}
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0]}>
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

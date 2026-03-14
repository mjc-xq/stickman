"use client";

import { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid, Center } from "@react-three/drei";
import * as THREE from "three";
import { useOrientation, useSmoothedIMU } from "@/app/hooks/stickman";

// Device axes (M5StickC Plus 2, portrait, USB at bottom):
//   +X = right edge, +Y = down (USB), +Z = out of screen
//
// Calibration: device flat on back, screen up -> gravity ~ (0, 0, -1)
// Three.js: +X = right, +Y = up, +Z = toward camera
// Map: devX->X, devY->-Z, devZ->Y

// Pre-allocated math objects (avoid GC in animation loop)
const REST_UP = new THREE.Vector3(0, 1, 0);
const FLIP_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const _screenDir = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();

function PigModel() {
  const orientation = useOrientation();
  const smoothedIMU = useSmoothedIMU();
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());
  const yawAngle = useRef(0);
  const { scene } = useGLTF("/3d/animal-pig.glb");
  const clonedScene = useRef<THREE.Group | null>(null);

  // Clone scene once and tint it pink
  if (!clonedScene.current) {
    clonedScene.current = scene.clone() as THREE.Group;
    clonedScene.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.set("#f5a0b8");
        mesh.material = mat;
      }
    });
  }

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const o = orientation.current;
    const imu = smoothedIMU.current;

    // Screen normal = opposite of gravity, mapped to Three.js coords
    _screenDir.set(-o.gravityX, -o.gravityZ, o.gravityY).normalize();

    // Skip if no reliable gravity signal (freefall or sensor noise)
    if (_screenDir.length() < 0.5) return;

    // Handle anti-parallel singularity (device screen facing straight down)
    const dot = _screenDir.dot(REST_UP);
    if (dot < -0.999) {
      _targetQuat.copy(FLIP_QUAT);
    } else {
      _targetQuat.setFromUnitVectors(REST_UP, _screenDir);
    }

    // Accumulate yaw from gyro Z (drift is expected without magnetometer)
    const yawDelta = -imu.gz * delta * (Math.PI / 180);
    yawAngle.current += yawDelta;
    _yawQuat.setFromAxisAngle(REST_UP, yawAngle.current);
    _targetQuat.multiply(_yawQuat); // post-multiply = local-frame yaw

    // Frame-rate independent slerp smoothing
    const alpha = 1 - Math.pow(0.88, delta * 60);
    smoothQuat.current.slerp(_targetQuat, alpha);
    groupRef.current.quaternion.copy(smoothQuat.current);
  });

  return (
    <group ref={groupRef}>
      <Center>
        <primitive object={clonedScene.current} scale={1.5} />
      </Center>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <pointLight position={[-3, 4, -3]} intensity={0.4} color="#6688ff" />
      <pointLight position={[3, -2, 5]} intensity={0.2} color="#ff8866" />

      <PigModel />

      <Grid
        position={[0, -2, 0]}
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
        minDistance={2}
        maxDistance={12}
      />
    </>
  );
}

export function Model3DViz() {
  return (
    <div className="absolute inset-0 w-full h-full" style={{ background: "#050510" }}>
      <Canvas
        camera={{ position: [3, 2, 4], fov: 45 }}
        shadows
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload("/3d/animal-pig.glb");

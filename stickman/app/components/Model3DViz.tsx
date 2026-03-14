"use client";

import { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid, Center } from "@react-three/drei";
import * as THREE from "three";
import { useOrientation, useSmoothedIMU } from "@/app/hooks/stickman";

// Device axes (M5StickC Plus 2, portrait, USB at bottom):
//   +X = right edge    (flat on back: ax ≈ 0)
//   +Y = toward USB    (flat on back: ay ≈ 0)
//   +Z = out of screen (flat on back: az ≈ +1g)
//
// Three.js axes: +X = right, +Y = up, +Z = toward camera
//
// Axis mapping (device accel → Three.js "up" direction):
//   Device +X → Three.js +X  (right stays right)
//   Device +Z → Three.js +Y  (screen normal → up)
//   Device +Y → Three.js -Z  (USB direction → away from camera)
//
// Verified with live calibration readings:
//   Flat on back (az=+1): → Three.js (0,1,0) = up    → pig upright ✓
//   Standing USB down (ay=+1): → Three.js (0,0,-1)    → pig tilts back ✓
//   Landscape port right (ax=+1): → Three.js (1,0,0)  → pig tilts right ✓

const DEG_TO_RAD = Math.PI / 180;
const REST_UP = new THREE.Vector3(0, 1, 0);
const FLIP_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const _upDir = new THREE.Vector3();
const _tiltQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();

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

    // Map device accelerometer (gravity estimate) to Three.js "up" direction
    // Device: +X=right, +Y=USB(down), +Z=screen(out)
    // Three.js: devX→X, devZ→Y, devY→-Z
    _upDir.set(o.gravityX, o.gravityZ, -o.gravityY).normalize();

    // Skip if no reliable gravity signal (freefall or sensor noise)
    if (_upDir.lengthSq() < 0.25) return;

    // Step 1: Tilt quaternion — rotate REST_UP to match the device's "up"
    const dot = _upDir.dot(REST_UP);
    if (dot < -0.999) {
      // Anti-parallel singularity (device screen facing straight down)
      _tiltQuat.copy(FLIP_QUAT);
    } else {
      _tiltQuat.setFromUnitVectors(REST_UP, _upDir);
    }

    // Step 2: Yaw from gyro Z — rotate around the screen normal direction
    // gyro Z measures twist around the device's Z axis (screen normal)
    // In Three.js space, the screen normal is wherever _upDir points
    yawAngle.current += -imu.gz * delta * DEG_TO_RAD;
    _yawQuat.setFromAxisAngle(_upDir, yawAngle.current);

    // Combine: first tilt to match gravity, then yaw around screen normal
    _targetQuat.multiplyQuaternions(_yawQuat, _tiltQuat);

    // Frame-rate independent slerp (responsive but smooth)
    const alpha = 1 - Math.pow(0.85, delta * 60);
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

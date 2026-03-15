"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Stars, Center } from "@react-three/drei";
import * as THREE from "three";
import { useOrientation, useSmoothedIMU, useToss } from "@/app/hooks/stickman";

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
//   Device +Y → Three.js +Z  (USB direction → toward camera)

const DEG_TO_RAD = Math.PI / 180;
const REST_UP = new THREE.Vector3(0, 1, 0);
const FLIP_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const _upDir = new THREE.Vector3();
const _tiltQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();

// Toss animation constants
const TOSS_RISE_SPEED = 8;
const TOSS_MAX_HEIGHT = 6;
const TOSS_GRAVITY = 12;
const TOSS_SPIN_SPEED = 4;

function PigModel() {
  const orientation = useOrientation();
  const smoothedIMU = useSmoothedIMU();
  const toss = useToss();
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());
  const yawAngle = useRef(0);
  const { scene } = useGLTF("/3d/animal-pig.glb");

  // Toss animation state
  const tossY = useRef(0);
  const tossVelY = useRef(0);
  const tossSpinAngle = useRef(0);
  const isTossing = useRef(false);

  // Clone scene once and tint it pink
  const clonedScene = useMemo(() => {
    const clone = scene.clone() as THREE.Group;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.set("#f5a0b8");
        mesh.material = mat;
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    return () => {
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).dispose();
        }
      });
    };
  }, [clonedScene]);

  // Watch toss state via ref to trigger animation
  useEffect(() => {
    const checkToss = () => {
      const t = toss.ref.current;
      if (t && t.phase === "airborne" && !isTossing.current) {
        isTossing.current = true;
        const launchForce = Math.min((t.launchG ?? 2) / 3, 1);
        tossVelY.current = TOSS_RISE_SPEED * (0.5 + launchForce * 0.5);
        tossSpinAngle.current = 0;
      }
    };
    const interval = setInterval(checkToss, 50);
    return () => clearInterval(interval);
  }, [toss.ref]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const o = orientation.current;
    const imu = smoothedIMU.current;

    // --- Toss fly animation ---
    if (isTossing.current) {
      tossVelY.current -= TOSS_GRAVITY * delta;
      tossY.current += tossVelY.current * delta;
      tossSpinAngle.current += TOSS_SPIN_SPEED * delta;

      // Clamp height
      if (tossY.current > TOSS_MAX_HEIGHT) {
        tossY.current = TOSS_MAX_HEIGHT;
        tossVelY.current = 0;
      }

      // Landed
      if (tossY.current <= 0 && tossVelY.current < 0) {
        tossY.current = 0;
        tossVelY.current = 0;
        tossSpinAngle.current = 0;
        isTossing.current = false;
      }

      groupRef.current.position.y = tossY.current;

      // Add a fun tumble spin during toss
      const tumble = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0.3).normalize(),
        tossSpinAngle.current * Math.PI * 2,
      );
      smoothQuat.current.copy(tumble);
      groupRef.current.quaternion.copy(smoothQuat.current);
      return;
    }

    // Ease position back to 0 after toss
    if (Math.abs(groupRef.current.position.y) > 0.01) {
      groupRef.current.position.y *= 0.9;
    } else {
      groupRef.current.position.y = 0;
    }

    // --- Normal orientation tracking ---
    _upDir.set(o.gravityX, o.gravityZ, o.gravityY);

    const lenSq = _upDir.lengthSq();
    if (lenSq < 0.25) return;
    _upDir.multiplyScalar(1 / Math.sqrt(lenSq));

    const dot = _upDir.dot(REST_UP);
    if (dot < -0.999) {
      _tiltQuat.copy(FLIP_QUAT);
    } else {
      _tiltQuat.setFromUnitVectors(REST_UP, _upDir);
    }

    const GYRO_DEADZONE = 1.0;
    const gz = Math.abs(imu.gz) > GYRO_DEADZONE ? imu.gz : 0;
    yawAngle.current += gz * delta * DEG_TO_RAD;
    yawAngle.current = ((yawAngle.current % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    _yawQuat.setFromAxisAngle(_upDir, yawAngle.current);

    _targetQuat.multiplyQuaternions(_yawQuat, _tiltQuat);

    const SMOOTH_SPEED = 10;
    const alpha = 1 - Math.exp(-SMOOTH_SPEED * delta);
    smoothQuat.current.slerp(_targetQuat, alpha);
    groupRef.current.quaternion.copy(smoothQuat.current);
  });

  return (
    <group ref={groupRef}>
      <Center>
        <primitive object={clonedScene} scale={1.0} />
      </Center>
    </group>
  );
}

// Pre-generate particle data at module scope (avoids React purity lint)
const PARTICLE_COUNT = 80;
const PARTICLE_DATA = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  // Seeded-ish deterministic values using index
  const a = (i * 2654435761) >>> 0;
  const r = (n: number) => ((a * (n + 1) * 16807 + 1) % 2147483647) / 2147483647;
  return {
    x: (r(0) - 0.5) * 20,
    y: (r(1) - 0.5) * 12,
    z: (r(2) - 0.5) * 20,
    speed: 0.1 + r(3) * 0.3,
    offset: r(4) * Math.PI * 2,
    scale: 0.02 + r(5) * 0.04,
  };
});

function FloatingParticles() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = PARTICLE_DATA[i];
      dummy.position.set(
        p.x + Math.sin(t * p.speed + p.offset) * 0.5,
        p.y + Math.cos(t * p.speed * 0.7 + p.offset) * 0.3,
        p.z + Math.sin(t * p.speed * 0.5 + p.offset * 2) * 0.5,
      );
      dummy.scale.setScalar(p.scale * (0.8 + Math.sin(t * 2 + p.offset) * 0.2));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#8888ff" transparent opacity={0.4} />
    </instancedMesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} castShadow />
      <pointLight position={[-4, 5, -3]} intensity={0.6} color="#6644cc" />
      <pointLight position={[4, -1, 5]} intensity={0.3} color="#ff6688" />
      <pointLight position={[0, 3, 0]} intensity={0.2} color="#44aaff" />

      <PigModel />
      <FloatingParticles />

      <Stars
        radius={50}
        depth={30}
        count={2000}
        factor={3}
        saturation={0.3}
        fade
        speed={0.5}
      />

      <fog attach="fog" args={["#080818", 8, 30]} />

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
    <div className="absolute inset-0 w-full h-full" style={{ background: "#080818" }}>
      <Canvas
        camera={{ position: [2.5, 1.5, 3.5], fov: 45 }}
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

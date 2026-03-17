"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Stars, Center } from "@react-three/drei";
import * as THREE from "three";
import { useOrientation, useToss } from "@/app/hooks/stickman";

// Device axes (M5StickC Plus 2, portrait, USB at bottom):
//   +X = LEFT edge     (tilt right → ax goes negative)
//   +Y = toward TOP    (away from USB; standing upright → ay ≈ +1)
//   +Z = out of screen (flat on back, screen up → az ≈ +1)
//
// Three.js axes: +X = right, +Y = up, +Z = toward camera
//
// Axis mapping (device accel → Three.js "up" direction):
//   Device -X → Three.js +X  (device left = Three.js right, so negate)
//   Device +Z → Three.js +Y  (screen normal → up)
//   Device +Y → Three.js +Z  (device top → toward camera)

const _targetQuat = new THREE.Quaternion();

// Toss animation — maps real device height to 3D scene units
const HEIGHT_SCALE = 8; // meters to scene units
const MAX_TOSS_Y = 4; // max scene units — keeps pig on screen
const MIN_TOSS_SCALE = 0.4; // smallest scale at apex (perspective shrink)
const TUMBLE_SPEED = 5; // rotations/sec during airborne
const _tumbleAxis = new THREE.Vector3(1, 0.2, 0.3).normalize();
const _tumbleQuat = new THREE.Quaternion();
const _landingQuat = new THREE.Quaternion(); // identity = upright

function PigModel() {
  const orientation = useOrientation();
  const toss = useToss();
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());
  const { scene } = useGLTF("/3d/animal-pig.glb");

  // Toss animation state — driven by real device events
  const tossPhase = useRef<"idle" | "rising" | "falling" | "landing">("idle");
  const tossY = useRef(0);
  const tossStartTime = useRef(0);
  const tossApexHeight = useRef(3); // scene units, updated on landed
  const tossRiseTime = useRef(0.3); // seconds to apex, updated on landed
  const tossFallTime = useRef(0.3); // seconds from apex to ground
  const tossSpinAngle = useRef(0);
  const lastTossPhase = useRef<string>("idle");

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

  // Watch toss state transitions via ref
  useEffect(() => {
    const checkToss = () => {
      const t = toss.ref.current;
      if (!t) return;

      // Detect phase transitions
      if (t.phase !== lastTossPhase.current) {
        lastTossPhase.current = t.phase;

        if (t.phase === "airborne") {
          // Device just launched — start rising
          tossPhase.current = "rising";
          tossStartTime.current = performance.now() / 1000;
          tossSpinAngle.current = 0;
          tossY.current = 0;
          // Estimate rise speed from launch G (higher throw = more height)
          const launchForce = Math.min((t.launchG ?? 2) / 4, 1);
          tossApexHeight.current = Math.min((1 + launchForce * 5) * HEIGHT_SCALE * 0.15, MAX_TOSS_Y);
          tossRiseTime.current = 0.25 + launchForce * 0.3;
        }

        if (t.phase === "landed" && tossPhase.current === "rising") {
          // Device caught — we now know real height and duration
          const realHeight = (t.heightM ?? 0.3) * HEIGHT_SCALE * 0.5;
          tossApexHeight.current = Math.min(Math.max(realHeight, 1), MAX_TOSS_Y);
          // Total freefall: half up, half down
          const totalMs = t.freefallMs ?? 500;
          tossRiseTime.current = (totalMs / 2) / 1000;
          tossFallTime.current = (totalMs / 2) / 1000;
          // Transition to falling
          tossPhase.current = "falling";
          tossStartTime.current = performance.now() / 1000;
          tossY.current = tossApexHeight.current;
        }
      }
    };
    const interval = setInterval(checkToss, 30);
    return () => clearInterval(interval);
  }, [toss.ref]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const o = orientation.current;

    // --- Toss animation driven by real device events ---
    const phase = tossPhase.current;
    if (phase === "rising" || phase === "falling" || phase === "landing") {
      const now = performance.now() / 1000;
      const elapsed = now - tossStartTime.current;

      if (phase === "rising") {
        // Ease up toward estimated apex using smooth curve
        const t = Math.min(elapsed / tossRiseTime.current, 1);
        const eased = 1 - (1 - t) * (1 - t); // ease-out quad
        tossY.current = eased * tossApexHeight.current;

        // Tumble spin while rising
        tossSpinAngle.current += TUMBLE_SPEED * delta;
        _tumbleQuat.setFromAxisAngle(_tumbleAxis, tossSpinAngle.current * Math.PI * 2);
        groupRef.current.quaternion.copy(_tumbleQuat);

        // If we've been rising longer than estimated without a landed event,
        // keep hovering at apex (device still in the air)
        if (t >= 1) {
          tossY.current = tossApexHeight.current;
        }
      } else if (phase === "falling") {
        // Descend from apex to ground
        const t = Math.min(elapsed / tossFallTime.current, 1);
        const eased = t * t; // ease-in quad — accelerating down
        tossY.current = tossApexHeight.current * (1 - eased);

        // Gradually orient feet-down (slerp from tumble toward upright)
        _tumbleQuat.setFromAxisAngle(_tumbleAxis, tossSpinAngle.current * Math.PI * 2);
        _landingQuat.identity(); // upright
        _tumbleQuat.slerp(_landingQuat, t * t); // accelerate toward upright
        groupRef.current.quaternion.copy(_tumbleQuat);

        if (t >= 1) {
          // Touchdown — brief landing phase
          tossPhase.current = "landing";
          tossStartTime.current = now;
          tossY.current = 0;
        }
      } else if (phase === "landing") {
        // Quick settle — ease back to normal orientation
        const t = Math.min(elapsed / 0.3, 1);
        tossY.current = 0;
        // Slerp from current to device orientation
        const settleAlpha = 1 - Math.exp(-15 * delta);
        smoothQuat.current.slerp(_targetQuat, settleAlpha);
        groupRef.current.quaternion.copy(smoothQuat.current);
        if (t >= 1) {
          tossPhase.current = "idle";
        }
      }

      groupRef.current.position.y = tossY.current;

      // Perspective shrink — pig gets smaller as it rises (looks like it's flying away)
      const heightFrac = tossApexHeight.current > 0 ? tossY.current / tossApexHeight.current : 0;
      const perspScale = 1 - heightFrac * (1 - MIN_TOSS_SCALE);
      groupRef.current.scale.setScalar(perspScale);

      if (phase !== "landing") return;
    }

    // Ease position and scale back to normal after toss
    if (groupRef.current.position.y > 0.01) {
      groupRef.current.position.y *= 1 - Math.min(5 * delta, 0.95);
    } else {
      groupRef.current.position.y = 0;
    }
    const s = groupRef.current.scale.x;
    if (s < 0.99) {
      groupRef.current.scale.setScalar(s + (1 - s) * Math.min(8 * delta, 0.95));
    } else {
      groupRef.current.scale.setScalar(1);
    }

    // --- Orientation from pre-computed quaternion (no gimbal lock) ---
    _targetQuat.set(o.qx, o.qy, o.qz, o.qw);

    // Ensure shortest-path slerp: negate target if dot < 0
    if (smoothQuat.current.dot(_targetQuat) < 0) {
      _targetQuat.set(-o.qx, -o.qy, -o.qz, -o.qw);
    }

    const alpha = 1 - Math.exp(-12 * delta);
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

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  useOrientation,
  useStickmanStatus,
} from "@/app/hooks/stickman";
import { SPHSimulation } from "./sph-simulation";
import type { GlassConfig } from "./sph-simulation";

// ── Constants ──────────────────────────────────────────────────────────────────
const GLASS_HEIGHT = 2.6;
const GLASS_RADIUS_TOP = 0.72;
const GLASS_RADIUS_BOTTOM = 0.5;
const WALL_THICKNESS = 0.06;
const INNER_RADIUS_TOP = GLASS_RADIUS_TOP - WALL_THICKNESS * 1.9;
const INNER_RADIUS_BOTTOM = GLASS_RADIUS_BOTTOM - WALL_THICKNESS * 1.9;
const GLASS_CENTER_Y = 1.55;
const PARTICLE_COUNT = 500;
const PARTICLE_SPHERE_RADIUS = 0.13; // larger than spacing for deep overlap

const GLASS_CONFIG: GlassConfig = {
  radiusTop: INNER_RADIUS_TOP,
  radiusBottom: INNER_RADIUS_BOTTOM,
  height: GLASS_HEIGHT,
  wallMargin: 0.02,
};

// ── Utilities ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function dampValue(cur: number, tgt: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-lambda * dt));
}

interface TiltRef {
  pitch: number;
  roll: number;
}

// ── Tilt from orientation hook ──────────────────────────────────────────────
function useTiltFromOrientation() {
  const orientation = useOrientation();
  const { receiving } = useStickmanStatus();
  const tiltRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });
  const mouseRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseRef.current = {
        pitch: clamp(y * 0.95, -1.15, 1.15),
        roll: clamp(x * 1.05, -1.15, 1.15),
      };
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    let id: number;
    const update = () => {
      if (receiving) {
        const o = orientation.current;
        tiltRef.current = {
          pitch: clamp(o.gravityY * 1.2, -1.15, 1.15),
          roll: clamp(o.gravityX * 1.2, -1.15, 1.15),
        };
      } else {
        tiltRef.current = mouseRef.current;
      }
      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [orientation, receiving]);

  return tiltRef;
}

// ── Glass Shell ─────────────────────────────────────────────────────────────────
function GlassShell() {
  const geo = useMemo(
    () =>
      new THREE.CylinderGeometry(
        GLASS_RADIUS_TOP,
        GLASS_RADIUS_BOTTOM,
        GLASS_HEIGHT,
        64,
        1,
        true,
      ),
    [],
  );
  return (
    <mesh geometry={geo} renderOrder={1}>
      <meshStandardMaterial
        color="#f8fbff"
        transparent
        opacity={0.15}
        roughness={0.02}
        metalness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function GlassBase() {
  return (
    <mesh position={[0, -GLASS_HEIGHT / 2 + 0.04, 0]} renderOrder={1}>
      <cylinderGeometry
        args={[GLASS_RADIUS_BOTTOM - 0.03, GLASS_RADIUS_BOTTOM - 0.07, 0.07, 48]}
      />
      <meshStandardMaterial
        color="#f8fbff"
        transparent
        opacity={0.18}
        roughness={0.03}
        metalness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function GlassRim() {
  return (
    <mesh
      position={[0, GLASS_HEIGHT / 2, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      renderOrder={1}
    >
      <torusGeometry args={[GLASS_RADIUS_TOP - 0.005, 0.018, 12, 64]} />
      <meshStandardMaterial
        color="#eef4ff"
        transparent
        opacity={0.12}
        roughness={0.04}
        metalness={0.1}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Ground ──────────────────────────────────────────────────────────────────────
function Ground() {
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1c2430" roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[4.75, 64]} />
        <meshStandardMaterial color="#202b37" roughness={1} />
      </mesh>
    </>
  );
}

// ── Contained Particles (InstancedMesh inside glass group) ─────────────────────
function ContainedParticles({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !simRef.current) return;
    const positions = simRef.current.getContainedPositions();
    const count = simRef.current.getContainedCount();
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    for (let i = count; i < PARTICLE_COUNT; i++) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[PARTICLE_SPHERE_RADIUS, 8, 6]} />
      <meshBasicMaterial
        color="#3090d0"
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ── Escaped Particles (InstancedMesh at scene root, world coords) ──────────────
function EscapedParticles({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || !simRef.current) return;
    const escaped = simRef.current.getEscapedParticles();
    for (let i = 0; i < escaped.length && i < PARTICLE_COUNT; i++) {
      const p = escaped[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(0.8);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    for (let i = escaped.length; i < PARTICLE_COUNT; i++) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[PARTICLE_SPHERE_RADIUS, 8, 6]} />
      <meshBasicMaterial
        color="#3090d0"
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ── Puddle (grows as water escapes) ────────────────────────────────────────────
function Puddle({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const puddleSize = useRef(0);

  useFrame((_, dt) => {
    if (!meshRef.current || !simRef.current) return;
    const escaped = simRef.current.getEscapedParticles();
    // Count particles on the ground (y near 0)
    let groundCount = 0;
    let cx = 0, cz = 0;
    for (const p of escaped) {
      if (p.y < 0.15) {
        groundCount++;
        cx += p.x;
        cz += p.z;
      }
    }
    if (groundCount > 0) {
      cx /= groundCount;
      cz /= groundCount;
      const targetSize = Math.min(Math.sqrt(groundCount) * 0.15, 2.5);
      puddleSize.current += (targetSize - puddleSize.current) * Math.min(3 * dt, 0.95);
      meshRef.current.position.set(cx, 0.004, cz);
      meshRef.current.scale.set(puddleSize.current, 1, puddleSize.current);
      meshRef.current.visible = true;
    } else if (puddleSize.current > 0.01) {
      // Slowly shrink puddle when no ground particles
      puddleSize.current *= 1 - Math.min(0.5 * dt, 0.95);
      meshRef.current.scale.set(puddleSize.current, 1, puddleSize.current);
      if (puddleSize.current < 0.01) meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} visible={false}>
      <circleGeometry args={[1, 48]} />
      <meshStandardMaterial color="#1a6a9a" transparent opacity={0.4} roughness={0.05} metalness={0.4} />
    </mesh>
  );
}

// ── Glass Assembly ──────────────────────────────────────────────────────────────
function GlassAssembly({ resetToken }: { resetToken: number }) {
  const tiltRef = useTiltFromOrientation();
  const groupRef = useRef<THREE.Group>(null);
  const smoothTiltRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });

  // Lazy init simulation using the allowed null-check pattern
  const simRef = useRef<SPHSimulation | null>(null);
  if (simRef.current == null) {
    simRef.current = new SPHSimulation(PARTICLE_COUNT, GLASS_CONFIG);
  }

  // Reset when token changes
  const prevResetToken = useRef(resetToken);
  useEffect(() => {
    if (resetToken !== prevResetToken.current) {
      prevResetToken.current = resetToken;
      simRef.current?.reset();
    }
  }, [resetToken]);

  useFrame((_, dt) => {
    if (!groupRef.current || !simRef.current) return;
    const sim = simRef.current;

    // Smooth tilt
    const t = tiltRef.current;
    smoothTiltRef.current = {
      pitch: dampValue(smoothTiltRef.current.pitch, t.pitch, 7, dt),
      roll: dampValue(smoothTiltRef.current.roll, -t.roll, 7, dt),
    };
    groupRef.current.rotation.x = smoothTiltRef.current.pitch;
    groupRef.current.rotation.z = smoothTiltRef.current.roll;

    // Compute local gravity: apply inverse of the glass group quaternion to world down
    const localGrav = new THREE.Vector3(0, -1, 0).applyQuaternion(
      groupRef.current.quaternion.clone().invert(),
    );

    sim.setGravityDir(localGrav.x, localGrav.y, localGrav.z);

    // Update glass world matrix for escape transformation
    groupRef.current.updateWorldMatrix(true, false);
    sim.setGlassWorldMatrix(groupRef.current.matrixWorld.elements);

    // Step the simulation
    sim.update();
  });

  return (
    <>
      <group ref={groupRef} position={[0, GLASS_CENTER_Y, 0]}>
        <GlassShell />
        <GlassBase />
        <GlassRim />
        <ContainedParticles simRef={simRef} />
      </group>
      <EscapedParticles simRef={simRef} />
      <Puddle simRef={simRef} />
    </>
  );
}

// ── Scene Content ───────────────────────────────────────────────────────────────
export function WaterSceneContent({ resetToken }: { resetToken: number }) {
  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 8, 22]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight
        position={[-5, 7, 5]}
        angle={0.35}
        penumbra={0.7}
        intensity={40}
        color="#7dd3fc"
      />
      <Ground />
      <GlassAssembly resetToken={resetToken} />
      <Environment preset="city" />
      <OrbitControls
        enablePan={false}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={4}
        maxDistance={10}
      />
    </>
  );
}

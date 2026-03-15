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

// ── Glass Components ─────────────────────────────────────────────────────────
function GlassShell() {
  const geo = useMemo(
    () => new THREE.CylinderGeometry(GLASS_RADIUS_TOP, GLASS_RADIUS_BOTTOM, GLASS_HEIGHT, 64, 1, true),
    [],
  );
  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshStandardMaterial
        color="#f8fbff" transparent opacity={0.12} roughness={0.02}
        metalness={0.1} side={THREE.DoubleSide} depthWrite={false}
      />
    </mesh>
  );
}

function GlassBase() {
  return (
    <mesh position={[0, -GLASS_HEIGHT / 2 + 0.04, 0]} renderOrder={2}>
      <cylinderGeometry args={[GLASS_RADIUS_BOTTOM - 0.03, GLASS_RADIUS_BOTTOM - 0.07, 0.07, 48]} />
      <meshStandardMaterial
        color="#f8fbff" transparent opacity={0.15} roughness={0.03}
        metalness={0.1} side={THREE.DoubleSide} depthWrite={false}
      />
    </mesh>
  );
}

function GlassRim() {
  return (
    <mesh position={[0, GLASS_HEIGHT / 2, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
      <torusGeometry args={[GLASS_RADIUS_TOP - 0.005, 0.018, 12, 64]} />
      <meshStandardMaterial color="#eef4ff" transparent opacity={0.1} roughness={0.04} depthWrite={false} />
    </mesh>
  );
}

// ── Ground ──────────────────────────────────────────────────────────────────
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

// ── Water Particles (two-layer InstancedMesh) ───────────────────────────────
// Layer 1: Core spheres — slightly opaque, medium size, gives the body
// Layer 2: Halo spheres — large, very transparent, softens edges into a blob
function WaterParticles({
  simRef,
  glassGroupRef,
  isEscaped,
}: {
  simRef: React.RefObject<SPHSimulation | null>;
  glassGroupRef: React.RefObject<THREE.Group | null>;
  isEscaped: boolean;
}) {
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!coreRef.current || !haloRef.current || !simRef.current) return;

    let positions: Float32Array | null = null;
    let count = 0;

    if (isEscaped) {
      const escaped = simRef.current.getEscapedParticles();
      count = Math.min(escaped.length, PARTICLE_COUNT);
      for (let i = 0; i < count; i++) {
        const p = escaped[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        coreRef.current.setMatrixAt(i, dummy.matrix);
        // Halo slightly larger
        dummy.scale.setScalar(2.2);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
    } else {
      positions = simRef.current.getContainedPositions();
      count = simRef.current.getContainedCount();

      // Transform contained particles from glass-local to world space
      const glassGroup = glassGroupRef.current;
      const mat = glassGroup ? glassGroup.matrixWorld : new THREE.Matrix4();
      const v = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        v.applyMatrix4(mat);
        dummy.position.copy(v);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        coreRef.current.setMatrixAt(i, dummy.matrix);
        dummy.scale.setScalar(2.2);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
    }

    // Hide remaining
    for (let i = count; i < PARTICLE_COUNT; i++) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      coreRef.current.setMatrixAt(i, dummy.matrix);
      haloRef.current.setMatrixAt(i, dummy.matrix);
    }
    coreRef.current.instanceMatrix.needsUpdate = true;
    haloRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Core layer: gives body and opacity where particles cluster */}
      <instancedMesh ref={coreRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false} renderOrder={0}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshBasicMaterial color="#2888c8" transparent opacity={0.35} depthWrite={false} />
      </instancedMesh>
      {/* Halo layer: softens edges, makes particles blur together */}
      <instancedMesh ref={haloRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[0.08, 6, 4]} />
        <meshBasicMaterial color="#3498d8" transparent opacity={0.08} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

// ── Puddle ──────────────────────────────────────────────────────────────────
function Puddle({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const puddleSize = useRef(0);

  useFrame((_, dt) => {
    if (!meshRef.current || !simRef.current) return;
    const escaped = simRef.current.getEscapedParticles();
    let groundCount = 0;
    let cx = 0, cz = 0;
    for (const p of escaped) {
      if (p.y < 0.15) { groundCount++; cx += p.x; cz += p.z; }
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

// ── Glass Assembly ──────────────────────────────────────────────────────────
function GlassAssembly({ resetToken }: { resetToken: number }) {
  const tiltRef = useTiltFromOrientation();
  const groupRef = useRef<THREE.Group>(null);
  const smoothTiltRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });

  const simRef = useRef<SPHSimulation | null>(null);
  if (simRef.current == null) {
    simRef.current = new SPHSimulation(PARTICLE_COUNT, GLASS_CONFIG);
  }

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

    const t = tiltRef.current;
    smoothTiltRef.current = {
      pitch: dampValue(smoothTiltRef.current.pitch, t.pitch, 7, dt),
      roll: dampValue(smoothTiltRef.current.roll, -t.roll, 7, dt),
    };
    groupRef.current.rotation.x = smoothTiltRef.current.pitch;
    groupRef.current.rotation.z = smoothTiltRef.current.roll;

    const localGrav = new THREE.Vector3(0, -1, 0).applyQuaternion(
      groupRef.current.quaternion.clone().invert(),
    );

    sim.setGravityDir(localGrav.x, localGrav.y, localGrav.z);
    groupRef.current.updateWorldMatrix(true, false);
    sim.setGlassWorldMatrix(groupRef.current.matrixWorld.elements);
    sim.update();
  });

  return (
    <>
      <group ref={groupRef} position={[0, GLASS_CENTER_Y, 0]}>
        <GlassShell />
        <GlassBase />
        <GlassRim />
      </group>
      {/* Water particles rendered in world space (both layers) */}
      <WaterParticles simRef={simRef} glassGroupRef={groupRef} isEscaped={false} />
      <WaterParticles simRef={simRef} glassGroupRef={groupRef} isEscaped={true} />
      <Puddle simRef={simRef} />
    </>
  );
}

// ── Scene Content ───────────────────────────────────────────────────────────
export function WaterSceneContent({ resetToken }: { resetToken: number }) {
  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 8, 22]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 3]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <spotLight position={[-5, 7, 5]} angle={0.35} penumbra={0.7} intensity={40} color="#7dd3fc" />
      <Ground />
      <GlassAssembly resetToken={resetToken} />
      <Environment preset="city" />
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.48} minDistance={4} maxDistance={10} />
    </>
  );
}

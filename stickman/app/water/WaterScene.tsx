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
const PARTICLE_SPRITE_SIZE = 0.55;

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

// ── Soft sprite texture for fluid rendering ──────────────────────────────────
// Pre-built at module scope (no Math.random, no render-time side effects)
let _fluidSprite: THREE.Texture | null = null;
function getFluidSprite(): THREE.Texture {
  if (_fluidSprite) return _fluidSprite;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(120, 200, 255, 1.0)");
  gradient.addColorStop(0.25, "rgba(90, 180, 255, 0.8)");
  gradient.addColorStop(0.5, "rgba(60, 160, 255, 0.4)");
  gradient.addColorStop(0.75, "rgba(40, 140, 255, 0.1)");
  gradient.addColorStop(1, "rgba(30, 120, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  _fluidSprite = tex;
  return tex;
}

// ── Contained Particles (Points inside glass group) ────────────────────────────
function ContainedParticles({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const posBuffer = useRef(new Float32Array(PARTICLE_COUNT * 3));

  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.setAttribute("position", new THREE.BufferAttribute(posBuffer.current, 3));
  }, []);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: PARTICLE_SPRITE_SIZE,
      map: getFluidSprite(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      color: new THREE.Color("#4ab8f8"),
    });
  }, []);

  useFrame(() => {
    if (!pointsRef.current || !simRef.current || !geoRef.current) return;
    const simPositions = simRef.current.getContainedPositions();
    const count = simRef.current.getContainedCount();
    const buf = posBuffer.current;

    // Copy contained particle positions
    for (let i = 0; i < count * 3; i++) {
      buf[i] = simPositions[i];
    }
    // Move remaining off-screen
    for (let i = count * 3; i < PARTICLE_COUNT * 3; i += 3) {
      buf[i] = 0;
      buf[i + 1] = -100;
      buf[i + 2] = 0;
    }

    const attr = geoRef.current.attributes.position as THREE.BufferAttribute;
    if (attr) attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false} renderOrder={-1}>
      <bufferGeometry ref={geoRef} />
      <primitive object={material} attach="material" />
    </points>
  );
}

// ── Escaped Particles (Points at scene root, world coords) ─────────────────────
function EscapedParticles({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const posBuffer = useRef(new Float32Array(PARTICLE_COUNT * 3));

  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.setAttribute("position", new THREE.BufferAttribute(posBuffer.current, 3));
  }, []);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: PARTICLE_SPRITE_SIZE * 0.8,
      map: getFluidSprite(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      color: new THREE.Color("#4ab8f8"),
    });
  }, []);

  useFrame(() => {
    if (!pointsRef.current || !simRef.current || !geoRef.current) return;
    const escaped = simRef.current.getEscapedParticles();
    const buf = posBuffer.current;

    for (let i = 0; i < escaped.length && i < PARTICLE_COUNT; i++) {
      const p = escaped[i];
      buf[i * 3] = p.x;
      buf[i * 3 + 1] = p.y;
      buf[i * 3 + 2] = p.z;
    }
    for (let i = escaped.length; i < PARTICLE_COUNT; i++) {
      buf[i * 3] = 0;
      buf[i * 3 + 1] = -100;
      buf[i * 3 + 2] = 0;
    }

    const attr = geoRef.current.attributes.position as THREE.BufferAttribute;
    if (attr) attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry ref={geoRef} />
      <primitive object={material} attach="material" />
    </points>
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

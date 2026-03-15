"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { StickmanProvider, useOrientation, useStickmanStatus } from "@/app/hooks/stickman";

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY = 9.8;
const MAX_DROPLETS = 900;
const GLASS_HEIGHT = 2.6;
const GLASS_RADIUS_TOP = 0.72;
const GLASS_RADIUS_BOTTOM = 0.5;
const WALL_THICKNESS = 0.06;
const DEFAULT_FILL = 0.72;
const POUR_START = 0.5;
const POUR_FULL = 1.1;
const MAX_EMIT_PER_SECOND = 180;

// ── Shared tilt ref type ───────────────────────────────────────────────────────
interface TiltRef {
  pitch: number;
  roll: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── Tilt from orientation hook ─────────────────────────────────────────────────
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

// ── Glass components ───────────────────────────────────────────────────────────
function GlassShell() {
  const geometry = useMemo(() => {
    return new THREE.CylinderGeometry(GLASS_RADIUS_TOP, GLASS_RADIUS_BOTTOM, GLASS_HEIGHT, 64, 1, true);
  }, []);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#f8fbff"
        transparent
        opacity={0.24}
        transmission={1}
        roughness={0.03}
        thickness={0.2}
        ior={1.45}
        envMapIntensity={1.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function GlassBase() {
  return (
    <mesh position={[0, -GLASS_HEIGHT / 2 + 0.045, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[GLASS_RADIUS_BOTTOM - 0.03, GLASS_RADIUS_BOTTOM - 0.08, 0.08, 48]} />
      <meshPhysicalMaterial
        color="#f8fbff"
        transparent
        opacity={0.3}
        transmission={1}
        roughness={0.04}
        thickness={0.18}
      />
    </mesh>
  );
}

// WaterInside reads tilt from a shared ref in useFrame (no props for pitch/roll)
function WaterInside({ fillRatio, tiltRef }: { fillRatio: number; tiltRef: React.RefObject<TiltRef> }) {
  const waterRef = useRef<THREE.Mesh>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const wobbleRef = useRef(0);

  const waterGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(
      GLASS_RADIUS_TOP - WALL_THICKNESS * 1.9,
      GLASS_RADIUS_BOTTOM - WALL_THICKNESS * 1.9,
      GLASS_HEIGHT, 48, 20, false,
    );
  }, []);

  useFrame((_, dt) => {
    const { pitch, roll } = tiltRef.current;
    wobbleRef.current += dt * 3.3;
    const levelHeight = -GLASS_HEIGHT / 2 + fillRatio * GLASS_HEIGHT;
    const ripple = Math.sin(wobbleRef.current * 1.6) * 0.018 + Math.cos(wobbleRef.current * 1.1) * 0.01;

    if (waterRef.current) {
      waterRef.current.position.y = levelHeight * 0.5 - GLASS_HEIGHT * 0.25;
      waterRef.current.scale.y = Math.max(0.001, fillRatio);
      waterRef.current.rotation.x = pitch * 0.18;
      waterRef.current.rotation.z = -roll * 0.18;
    }
    if (surfaceRef.current) {
      surfaceRef.current.position.y = levelHeight - 0.01 + ripple;
      surfaceRef.current.rotation.x = pitch * 0.45;
      surfaceRef.current.rotation.z = -roll * 0.45;
    }
  });

  const topRadius = THREE.MathUtils.lerp(GLASS_RADIUS_BOTTOM, GLASS_RADIUS_TOP, fillRatio) - WALL_THICKNESS * 1.4;

  return (
    <group>
      <mesh ref={waterRef} geometry={waterGeometry} castShadow>
        <meshPhysicalMaterial color="#5fc3ff" transparent opacity={0.62} roughness={0.08} transmission={0.25} thickness={0.18} />
      </mesh>
      <mesh ref={surfaceRef} position={[0, 0, 0]} rotation={[-0.02, 0, 0]}>
        <circleGeometry args={[Math.max(0.001, topRadius), 48]} />
        <meshStandardMaterial color="#8bdcff" transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

// ── Droplets — reads tilt from ref, mutates positions via ref ──────────────────
interface DropletsProps {
  sourceRef: React.RefObject<THREE.Group | null>;
  tiltRef: React.RefObject<TiltRef>;
  fillRatio: number;
  setFillRatio: React.Dispatch<React.SetStateAction<number>>;
  resetToken: number;
}

interface Particle {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
}

function Droplets({ sourceRef, tiltRef, fillRatio, setFillRatio, resetToken }: DropletsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  // Keep positions in a ref so mutations don't trigger lint warnings about useMemo immutability
  const posRef = useRef(new Float32Array(MAX_DROPLETS * 3));
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: MAX_DROPLETS }, () => ({
      active: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1,
    })),
  );
  const spawnCarry = useRef(0);
  const geoRef = useRef<THREE.BufferGeometry>(null);

  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 28);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.085, map: sprite, transparent: true, depthWrite: false,
      color: new THREE.Color("#90ddff"), opacity: 0.95, sizeAttenuation: true, blending: THREE.NormalBlending,
    });
  }, [sprite]);

  // Set up buffer geometry imperatively via ref
  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.setAttribute("position", new THREE.BufferAttribute(posRef.current, 3));
  }, []);

  useEffect(() => {
    const positions = posRef.current;
    const particles = particlesRef.current;
    for (let i = 0; i < particles.length; i++) {
      particles[i].active = false;
      particles[i].y = -100;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
    }
    if (geoRef.current?.attributes.position) {
      (geoRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    spawnCarry.current = 0;
  }, [resetToken]);

  useFrame((_, dt) => {
    if (!pointsRef.current || !sourceRef.current || !geoRef.current) return;

    const positions = posRef.current;
    const { pitch, roll } = tiltRef.current;
    const tiltMagnitude = Math.sqrt(pitch * pitch + roll * roll);
    const pourStrength = smoothstep(POUR_START, POUR_FULL, tiltMagnitude);

    if (pourStrength > 0.001 && fillRatio > 0.02) {
      const emitRate = MAX_EMIT_PER_SECOND * pourStrength * clamp(fillRatio * 1.2, 0.1, 1);
      spawnCarry.current += emitRate * dt;
      const spawnCount = Math.floor(spawnCarry.current);
      spawnCarry.current -= spawnCount;

      const drain = pourStrength * 0.16 * dt;
      setFillRatio((prev) => Math.max(0, prev - drain));

      const origin = new THREE.Vector3(GLASS_RADIUS_TOP - 0.05, GLASS_HEIGHT / 2 - 0.05, 0);
      sourceRef.current.updateWorldMatrix(true, false);
      origin.applyMatrix4(sourceRef.current.matrixWorld);

      const dir = new THREE.Vector3(1, 0.12, 0);
      dir.applyEuler(new THREE.Euler(pitch, 0, -roll, "XYZ")).normalize();

      const particles = particlesRef.current;
      for (let s = 0; s < spawnCount; s++) {
        const p = particles.find((item) => !item.active);
        if (!p) break;
        p.active = true;
        p.x = origin.x + (Math.random() - 0.5) * 0.05;
        p.y = origin.y + (Math.random() - 0.5) * 0.05;
        p.z = origin.z + (Math.random() - 0.5) * 0.1;
        p.vx = dir.x * (2 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.18;
        p.vy = dir.y * (2 + Math.random() * 1.2) + 0.1;
        p.vz = dir.z * (2 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.45;
        p.age = 0;
        p.life = 1.1 + Math.random() * 1.1;
      }
    }

    const particles = particlesRef.current;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const i3 = i * 3;

      if (!p.active) {
        positions[i3] = 0; positions[i3 + 1] = -100; positions[i3 + 2] = 0;
        continue;
      }

      p.age += dt;
      p.vy -= GRAVITY * dt;
      p.vx *= 1 - dt * 0.08;
      p.vz *= 1 - dt * 0.08;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy *= -0.18;
        p.vx *= 0.9;
        p.vz *= 0.9;
        if (Math.abs(p.vy) < 0.15) p.vy = 0;
      }

      if (p.age >= p.life || Math.abs(p.x) > 20 || Math.abs(p.z) > 20) {
        p.active = false;
        positions[i3] = 0; positions[i3 + 1] = -100; positions[i3 + 2] = 0;
        continue;
      }

      positions[i3] = p.x;
      positions[i3 + 1] = p.y;
      positions[i3 + 2] = p.z;
    }

    if (geoRef.current.attributes.position) {
      (geoRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry ref={geoRef} />
      <primitive object={material} attach="material" />
    </points>
  );
}

// ── Ground ─────────────────────────────────────────────────────────────────────
function Ground() {
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
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

// ── Glass assembly ─────────────────────────────────────────────────────────────
function GlassOfWater() {
  const tiltRef = useTiltFromOrientation();
  const groupRef = useRef<THREE.Group>(null);
  const [fillRatio, setFillRatio] = useState(DEFAULT_FILL);
  const [resetToken, setResetToken] = useState(0);
  // Smoothed tilt for glass rotation + child reads
  const smoothTiltRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const tilt = tiltRef.current;
    smoothTiltRef.current = {
      pitch: damp(smoothTiltRef.current.pitch, tilt.pitch, 7, dt),
      roll: damp(smoothTiltRef.current.roll, -tilt.roll, 7, dt),
    };
    groupRef.current.rotation.x = smoothTiltRef.current.pitch;
    groupRef.current.rotation.z = smoothTiltRef.current.roll;
  });

  return (
    <group>
      <group ref={groupRef} position={[0, 1.55, 0]}>
        <GlassShell />
        <GlassBase />
        <WaterInside fillRatio={fillRatio} tiltRef={smoothTiltRef} />
      </group>

      <Droplets
        sourceRef={groupRef}
        tiltRef={smoothTiltRef}
        fillRatio={fillRatio}
        setFillRatio={setFillRatio}
        resetToken={resetToken}
      />

      <Html position={[0, 3.8, 0]} center>
        <div className="rounded-2xl border border-white/20 bg-black/45 px-4 py-3 text-center text-white shadow-2xl backdrop-blur-md">
          <div className="text-sm font-semibold tracking-wide">Tilt to pour</div>
          <div className="mt-1 text-xs text-white/75">Move mouse or tilt the device</div>
          <div className="mt-2 text-xs text-cyan-200">Water left: {Math.round(fillRatio * 100)}%</div>
          <button
            className="mt-3 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/25"
            onClick={() => {
              setFillRatio(DEFAULT_FILL);
              setResetToken((v) => v + 1);
            }}
          >
            Reset glass
          </button>
        </div>
      </Html>
    </group>
  );
}

// ── Scene ──────────────────────────────────────────────────────────────────────
function WaterScene() {
  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 8, 20]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 3]} intensity={1.9} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <spotLight position={[-5, 7, 5]} angle={0.35} penumbra={0.7} intensity={45} color="#7dd3fc" />
      <Ground />
      <GlassOfWater />
      <Environment preset="city" />
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.48} minDistance={5} maxDistance={9} />
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────
function WaterContent() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b1118] text-white">
      <Canvas shadows camera={{ position: [0, 2.4, 6.6], fov: 42 }} gl={{ antialias: true }}>
        <WaterScene />
      </Canvas>
    </div>
  );
}

export default function WaterPage() {
  return (
    <StickmanProvider>
      <WaterContent />
    </StickmanProvider>
  );
}

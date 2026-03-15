"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  StickmanProvider,
  useOrientation,
  useStickmanStatus,
} from "@/app/hooks/stickman";

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY = 9.8;
const MAX_DROPLETS = 900;
const GLASS_HEIGHT = 2.6;
const GLASS_RADIUS_TOP = 0.72;
const GLASS_RADIUS_BOTTOM = 0.5;
const WALL_THICKNESS = 0.06;
const DEFAULT_FILL = 0.72;
const MAX_EMIT_PER_SECOND = 180;
const INNER_RADIUS_TOP = GLASS_RADIUS_TOP - WALL_THICKNESS * 1.9;
const INNER_RADIUS_BOTTOM = GLASS_RADIUS_BOTTOM - WALL_THICKNESS * 1.9;

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

/**
 * Compute water surface geometry for a tilted cylindrical glass.
 *
 * The glass is a truncated cone (frustum) with its local Y axis along the
 * cylinder. When the glass tilts by angle `tiltAngle` (radians) relative to
 * world-up, the water surface remains level relative to gravity.
 *
 * In the glass's local frame the water surface is a plane whose normal is
 * the world-up vector transformed into local space. For a tilt about an
 * arbitrary axis, the surface normal in local space is simply (sin(tilt) along
 * the tilt direction, cos(tilt) along Y). The plane intersects the cylinder
 * and we need to know the min / max Y of the water on opposite sides of the
 * rim to decide whether water spills.
 *
 * Returns: { waterCenterY, surfaceTiltAngle, tiltAxisAngle, pourFraction,
 *            pourPointLocal, overflowDir }
 */
function computeWaterState(
  pitch: number,
  roll: number,
  fillRatio: number,
) {
  // Total tilt of the glass away from vertical
  const tiltMag = Math.sqrt(pitch * pitch + roll * roll);
  // Angle of tilt axis in the XZ plane of the glass
  const tiltAxisAngle = Math.atan2(-roll, pitch);

  // The volume of water stays constant. In an upright glass at fillRatio f,
  // the water height is f * GLASS_HEIGHT measured from the bottom.
  // When tilted, the water surface plane tilts in the glass's local frame.
  // The center of the water surface (at the cylinder axis) stays at the same
  // height as if upright (conservation of volume for small tilts in a cylinder
  // — exact for a true cylinder, good approximation for a near-cylinder).
  const waterCenterY = -GLASS_HEIGHT / 2 + fillRatio * GLASS_HEIGHT;

  // The water surface tilts by -tiltMag relative to the glass's local Y axis.
  // (It stays level in world space, so in local space it tilts opposite.)
  const surfaceTiltAngle = tiltMag;

  // Half-width of the glass at the water center height
  const t = clamp((waterCenterY + GLASS_HEIGHT / 2) / GLASS_HEIGHT, 0, 1);
  const radiusAtCenter = THREE.MathUtils.lerp(
    INNER_RADIUS_BOTTOM,
    INNER_RADIUS_TOP,
    t,
  );

  // The water rises on the "low" side and drops on the "high" side.
  // At the rim (radius R from center), the offset is R * tan(tiltAngle).
  const surfaceOffset = radiusAtCenter * Math.tan(surfaceTiltAngle);

  // Water level at the highest point (low side of glass when tilted)
  const waterHighY = waterCenterY + surfaceOffset;
  // Water level at the lowest point (high side)
  const waterLowY = waterCenterY - surfaceOffset;

  // The glass rim is at Y = GLASS_HEIGHT / 2
  const rimY = GLASS_HEIGHT / 2;

  // Pour fraction: how much the water overflows the rim
  const overflowAmount = waterHighY - rimY;
  const pourFraction = clamp(overflowAmount / 0.3, 0, 1);

  // Direction from glass center to the lowest rim point (where water pours)
  // In the glass local frame, tilt about X means the glass tips forward,
  // so the lowest rim point is in the direction of the tilt.
  const pourDirX = tiltMag > 0.001 ? pitch / tiltMag : 0;
  const pourDirZ = tiltMag > 0.001 ? -roll / tiltMag : 0;

  // Pour point in local glass space — at the rim, on the low side
  const pourPointLocal = new THREE.Vector3(
    pourDirX * GLASS_RADIUS_TOP,
    rimY,
    pourDirZ * GLASS_RADIUS_TOP,
  );

  return {
    waterCenterY,
    surfaceTiltAngle,
    tiltAxisAngle,
    pourFraction,
    pourPointLocal,
    pourDirX,
    pourDirZ,
    waterHighY,
    waterLowY,
    radiusAtCenter,
  };
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
    return new THREE.CylinderGeometry(
      GLASS_RADIUS_TOP,
      GLASS_RADIUS_BOTTOM,
      GLASS_HEIGHT,
      64,
      1,
      true,
    );
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
    <mesh
      position={[0, -GLASS_HEIGHT / 2 + 0.045, 0]}
      receiveShadow
      castShadow
    >
      <cylinderGeometry
        args={[
          GLASS_RADIUS_BOTTOM - 0.03,
          GLASS_RADIUS_BOTTOM - 0.08,
          0.08,
          48,
        ]}
      />
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

function GlassRimRing() {
  return (
    <mesh position={[0, GLASS_HEIGHT / 2 - 0.01, 0]}>
      <torusGeometry args={[GLASS_RADIUS_TOP - 0.01, 0.02, 12, 64]} />
      <meshPhysicalMaterial
        color="#f8fbff"
        transparent
        opacity={0.15}
        transmission={1}
        roughness={0.05}
        thickness={0.1}
      />
    </mesh>
  );
}

// ── Water body — uses clipping plane to create level surface ───────────────────
function WaterInside({
  fillRef,
  tiltRef,
}: {
  fillRef: React.RefObject<number>;
  tiltRef: React.RefObject<TiltRef>;
}) {
  const waterBodyRef = useRef<THREE.Mesh>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const surfaceGroupRef = useRef<THREE.Group>(null);
  const wobbleRef = useRef(0);

  // Create water body geometry — a cylinder for the full glass interior
  const waterGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(
      INNER_RADIUS_TOP,
      INNER_RADIUS_BOTTOM,
      GLASS_HEIGHT,
      48,
      1,
      false,
    );
  }, []);

  // Clipping plane + material stored in refs, initialized in effect
  const clipPlaneRef = useRef<THREE.Plane | null>(null);

  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    clipPlaneRef.current = plane;
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#5fc3ff",
      transparent: true,
      opacity: 0.62,
      roughness: 0.08,
      transmission: 0.25,
      thickness: 0.18,
      clippingPlanes: [plane],
      clipShadows: true,
      side: THREE.DoubleSide,
    });
    if (waterBodyRef.current) {
      waterBodyRef.current.material = mat;
    }
    return () => {
      mat.dispose();
    };
  }, []);

  useFrame((_state, dt) => {
    const { pitch, roll } = tiltRef.current;
    const fill = fillRef.current;
    wobbleRef.current += dt * 3.3;

    const ws = computeWaterState(pitch, roll, fill);
    const ripple =
      Math.sin(wobbleRef.current * 1.6) * 0.012 +
      Math.cos(wobbleRef.current * 1.1) * 0.008;

    const tiltMag = Math.sqrt(pitch * pitch + roll * roll);
    // Normal pointing "down" in world space, transformed to local space
    const nx = -Math.sin(pitch);
    const ny = -Math.cos(tiltMag);
    const nz = Math.sin(roll);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    const cp = clipPlaneRef.current;
    if (cp) {
      cp.normal.set(nx / len, ny / len, nz / len);
      cp.constant =
        ((ws.waterCenterY + ripple) * Math.cos(tiltMag)) / len;
    }

    if (waterBodyRef.current) {
      waterBodyRef.current.visible = fill > 0.005;
    }

    if (surfaceGroupRef.current && surfaceRef.current) {
      surfaceGroupRef.current.position.y = ws.waterCenterY + ripple;
      surfaceGroupRef.current.rotation.x = -pitch;
      surfaceGroupRef.current.rotation.z = roll;
      surfaceRef.current.visible = fill > 0.005;

      const surfaceRadius = ws.radiusAtCenter;
      surfaceRef.current.scale.set(
        surfaceRadius / INNER_RADIUS_TOP,
        surfaceRadius / INNER_RADIUS_TOP,
        1,
      );
    }
  });

  return (
    <group>
      <mesh ref={waterBodyRef} geometry={waterGeometry} />
      <group ref={surfaceGroupRef} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={surfaceRef} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[INNER_RADIUS_TOP, 48]} />
          <meshStandardMaterial
            color="#8bdcff"
            transparent
            opacity={0.82}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

// ── Droplets ────────────────────────────────────────────────────────────────────
interface DropletsProps {
  sourceRef: React.RefObject<THREE.Group | null>;
  tiltRef: React.RefObject<TiltRef>;
  fillRef: React.RefObject<number>;
  onDrain: (amount: number) => void;
  resetToken: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

function Droplets({
  sourceRef,
  tiltRef,
  fillRef,
  onDrain,
  resetToken,
}: DropletsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const posRef = useRef(new Float32Array(MAX_DROPLETS * 3));
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: MAX_DROPLETS }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      life: 1,
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
      size: 0.085,
      map: sprite,
      transparent: true,
      depthWrite: false,
      color: new THREE.Color("#90ddff"),
      opacity: 0.95,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
  }, [sprite]);

  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.setAttribute(
      "position",
      new THREE.BufferAttribute(posRef.current, 3),
    );
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
      (
        geoRef.current.attributes.position as THREE.BufferAttribute
      ).needsUpdate = true;
    }
    spawnCarry.current = 0;
  }, [resetToken]);

  // Reusable vectors to avoid GC pressure
  const _origin = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!pointsRef.current || !sourceRef.current || !geoRef.current) return;

    const positions = posRef.current;
    const { pitch, roll } = tiltRef.current;
    const fillRatio = fillRef.current;

    // Compute physics-based pour state
    const ws = computeWaterState(pitch, roll, fillRatio);

    if (ws.pourFraction > 0.001 && fillRatio > 0.02) {
      const emitRate =
        MAX_EMIT_PER_SECOND *
        ws.pourFraction *
        clamp(fillRatio * 1.2, 0.1, 1);
      spawnCarry.current += emitRate * dt;
      const spawnCount = Math.floor(spawnCarry.current);
      spawnCarry.current -= spawnCount;

      // Drain water
      const drain = ws.pourFraction * 0.16 * dt;
      onDrain(drain);

      // Pour origin: the lowest point of the rim in world space
      _origin.copy(ws.pourPointLocal);
      sourceRef.current.updateWorldMatrix(true, false);
      _origin.applyMatrix4(sourceRef.current.matrixWorld);

      // Pour direction: outward from the pour point + slight downward
      _dir.set(ws.pourDirX, -0.15, ws.pourDirZ).normalize();
      // Rotate direction by glass tilt to get world-space direction
      const euler = new THREE.Euler(pitch, 0, -roll, "XYZ");
      _dir.applyEuler(euler);

      const particles = particlesRef.current;
      for (let s = 0; s < spawnCount; s++) {
        const p = particles.find((item) => !item.active);
        if (!p) break;
        p.active = true;
        p.x = _origin.x + (Math.random() - 0.5) * 0.06;
        p.y = _origin.y + (Math.random() - 0.5) * 0.04;
        p.z = _origin.z + (Math.random() - 0.5) * 0.06;
        const speed = 1.5 + Math.random() * 1.2;
        p.vx = _dir.x * speed + (Math.random() - 0.5) * 0.15;
        p.vy = _dir.y * speed + Math.random() * 0.3;
        p.vz = _dir.z * speed + (Math.random() - 0.5) * 0.15;
        p.age = 0;
        p.life = 1.1 + Math.random() * 1.1;
      }
    }

    const particles = particlesRef.current;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const i3 = i * 3;

      if (!p.active) {
        positions[i3] = 0;
        positions[i3 + 1] = -100;
        positions[i3 + 2] = 0;
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
        positions[i3] = 0;
        positions[i3 + 1] = -100;
        positions[i3 + 2] = 0;
        continue;
      }

      positions[i3] = p.x;
      positions[i3 + 1] = p.y;
      positions[i3 + 2] = p.z;
    }

    if (geoRef.current.attributes.position) {
      (
        geoRef.current.attributes.position as THREE.BufferAttribute
      ).needsUpdate = true;
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
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color="#1c2430"
          roughness={0.98}
          metalness={0.02}
        />
      </mesh>
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
      >
        <circleGeometry args={[4.75, 64]} />
        <meshStandardMaterial color="#202b37" roughness={1} />
      </mesh>
    </>
  );
}

// ── Glass assembly (receives state from parent outside Canvas) ────────────────
interface GlassOfWaterProps {
  fillRef: React.RefObject<number>;
  onDrain: (amount: number) => void;
  resetToken: number;
}

function GlassOfWater({ fillRef, onDrain, resetToken }: GlassOfWaterProps) {
  const tiltRef = useTiltFromOrientation();
  const groupRef = useRef<THREE.Group>(null);
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
        <GlassRimRing />
        <WaterInside fillRef={fillRef} tiltRef={smoothTiltRef} />
      </group>

      <Droplets
        sourceRef={groupRef}
        tiltRef={smoothTiltRef}
        fillRef={fillRef}
        onDrain={onDrain}
        resetToken={resetToken}
      />
    </group>
  );
}


// ── HUD (HTML overlay, minimal, bottom-right) ──────────────────────────────────
function HUD({
  fillRatio,
  onReset,
}: {
  fillRatio: number;
  onReset: () => void;
}) {
  const pct = Math.round(fillRatio * 100);
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-auto absolute bottom-6 right-6 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white backdrop-blur-md">
        <span className="text-xs font-medium text-cyan-200">{pct}%</span>
        <button
          className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium transition hover:bg-white/20"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Scene ──────────────────────────────────────────────────────────────────────
function WaterScene({ fillRef, onDrain, resetToken }: GlassOfWaterProps) {
  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 8, 20]} />
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight
        position={[-5, 7, 5]}
        angle={0.35}
        penumbra={0.7}
        intensity={45}
        color="#7dd3fc"
      />
      <Ground />
      <GlassOfWater fillRef={fillRef} onDrain={onDrain} resetToken={resetToken} />
      <Environment preset="city" />
      <OrbitControls
        enablePan={false}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={5}
        maxDistance={9}
      />
    </>
  );
}

// ── Page — state lives here so HUD is outside Canvas ─────────────────────────
function WaterContent() {
  const [fillRatio, setFillRatio] = useState(DEFAULT_FILL);
  const [resetToken, setResetToken] = useState(0);
  const fillRef = useRef(DEFAULT_FILL);

  useEffect(() => {
    fillRef.current = fillRatio;
  }, [fillRatio]);

  const handleDrain = useCallback((amount: number) => {
    setFillRatio((prev) => Math.max(0, prev - amount));
  }, []);

  const handleReset = useCallback(() => {
    setFillRatio(DEFAULT_FILL);
    setResetToken((v) => v + 1);
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b1118] text-white">
      <Canvas
        shadows
        camera={{ position: [0, 2.4, 6.6], fov: 42 }}
        gl={{ antialias: true, localClippingEnabled: true }}
      >
        <WaterScene fillRef={fillRef} onDrain={handleDrain} resetToken={resetToken} />
      </Canvas>
      <HUD fillRatio={fillRatio} onReset={handleReset} />
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

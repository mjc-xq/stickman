"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  StickmanProvider,
  useOrientation,
  useStickmanStatus,
} from "@/app/hooks/stickman";

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY_ACCEL = 9.8;
const GLASS_HEIGHT = 2.6;
const GLASS_RADIUS_TOP = 0.72;
const GLASS_RADIUS_BOTTOM = 0.5;
const WALL_THICKNESS = 0.06;
const DEFAULT_FILL = 0.72;
const INNER_RADIUS_TOP = GLASS_RADIUS_TOP - WALL_THICKNESS * 1.9;
const INNER_RADIUS_BOTTOM = GLASS_RADIUS_BOTTOM - WALL_THICKNESS * 1.9;
const GROUND_Y = 0;
const GLASS_CENTER_Y = 1.55;
const STREAM_SEGMENTS = 20;
const STREAM_BASE_RADIUS = 0.03;
const MAX_SPLASH = 100;
const PUDDLE_MAX = 1.5;

// ── Types ──────────────────────────────────────────────────────────────────────
interface TiltRef {
  pitch: number;
  roll: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function damp(cur: number, tgt: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-lambda * dt));
}

// ── Liquid Shader Material ─────────────────────────────────────────────────────
// The core technique: vertices are converted to world space in the vertex shader.
// The fragment shader discards fragments above (worldPos.y > fillLevel + wobble).
// Since world Y is always gravity-aligned, the liquid surface stays level
// regardless of how the container rotates. Front faces = body, back faces = top.

class LiquidMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        fillY: { value: 0 },
        wobbleX: { value: 0 },
        wobbleZ: { value: 0 },
        bodyColor: { value: new THREE.Color("#3aaef5") },
        topColor: { value: new THREE.Color("#7dd8ff") },
        foamColor: { value: new THREE.Color("#b8eaff") },
        foamWidth: { value: 0.06 },
        rimPower: { value: 2.0 },
        rimColor: { value: new THREE.Color("#a0dfff") },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vObjNormal;
        varying vec3 vViewDir;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vObjNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float fillY;
        uniform float wobbleX;
        uniform float wobbleZ;
        uniform vec3 bodyColor;
        uniform vec3 topColor;
        uniform vec3 foamColor;
        uniform float foamWidth;
        uniform float rimPower;
        uniform vec3 rimColor;

        varying vec3 vWorldPos;
        varying vec3 vObjNormal;
        varying vec3 vViewDir;

        void main() {
          // Fill edge: world Y threshold with wobble offset
          float edge = fillY + wobbleX * vWorldPos.x + wobbleZ * vWorldPos.z;

          // Discard above liquid surface
          if (vWorldPos.y > edge) discard;

          // Foam band near the surface
          float foam = smoothstep(edge - foamWidth, edge, vWorldPos.y);

          // Rim light (fresnel)
          float rim = pow(1.0 - max(dot(vObjNormal, vViewDir), 0.0), rimPower);

          // Front face = liquid body, back face = liquid surface top
          vec3 col;
          if (gl_FrontFacing) {
            col = mix(bodyColor, foamColor, foam * 0.6);
            col += rimColor * rim * 0.3;
          } else {
            col = mix(topColor, foamColor, foam * 0.4);
            // Subtle radial gradient on top surface
            col += rimColor * rim * 0.15;
          }

          gl_FragColor = vec4(col, gl_FrontFacing ? 0.7 : 0.85);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }
}

extend({ LiquidMaterial });

// Augment JSX for the custom material
declare module "@react-three/fiber" {
  interface ThreeElements {
    liquidMaterial: React.DetailedHTMLProps<React.HTMLAttributes<LiquidMaterial>, LiquidMaterial> & {
      ref?: React.Ref<LiquidMaterial>;
    };
  }
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

// ── Glass Shell ────────────────────────────────────────────────────────────────
function GlassShell() {
  const geo = useMemo(
    () => new THREE.CylinderGeometry(GLASS_RADIUS_TOP, GLASS_RADIUS_BOTTOM, GLASS_HEIGHT, 64, 1, true),
    [],
  );
  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial
        color="#f8fbff" transparent opacity={0.18} transmission={1}
        roughness={0.02} thickness={0.2} ior={1.45} side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function GlassBase() {
  return (
    <mesh position={[0, -GLASS_HEIGHT / 2 + 0.04, 0]}>
      <cylinderGeometry args={[GLASS_RADIUS_BOTTOM - 0.03, GLASS_RADIUS_BOTTOM - 0.07, 0.07, 48]} />
      <meshPhysicalMaterial
        color="#f8fbff" transparent opacity={0.22} transmission={1} roughness={0.03} thickness={0.15}
      />
    </mesh>
  );
}

function GlassRim() {
  return (
    <mesh position={[0, GLASS_HEIGHT / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[GLASS_RADIUS_TOP - 0.005, 0.018, 12, 64]} />
      <meshPhysicalMaterial color="#eef4ff" transparent opacity={0.12} transmission={1} roughness={0.04} />
    </mesh>
  );
}

// ── Liquid Body (custom shader) ────────────────────────────────────────────────
function LiquidBody({
  fillRef,
  tiltRef,
}: {
  fillRef: React.RefObject<number>;
  tiltRef: React.RefObject<TiltRef>;
}) {
  const matRef = useRef<LiquidMaterial>(null);
  const wobble = useRef({ x: 0, z: 0, vx: 0, vz: 0 });
  const prevTilt = useRef({ pitch: 0, roll: 0 });

  const geo = useMemo(
    () => new THREE.CylinderGeometry(INNER_RADIUS_TOP, INNER_RADIUS_BOTTOM, GLASS_HEIGHT, 48, 1, false),
    [],
  );

  useFrame((_, dt) => {
    if (!matRef.current) return;
    const tilt = tiltRef.current;
    const fill = fillRef.current;

    // Spring-damper wobble from tilt velocity
    const dpitch = tilt.pitch - prevTilt.current.pitch;
    const droll = tilt.roll - prevTilt.current.roll;
    prevTilt.current = { pitch: tilt.pitch, roll: tilt.roll };

    const stiffness = 8;
    const damping = 3;
    wobble.current.vx += dpitch * 40 * dt;
    wobble.current.vz += droll * 40 * dt;
    wobble.current.vx += -wobble.current.x * stiffness * dt;
    wobble.current.vz += -wobble.current.z * stiffness * dt;
    wobble.current.vx *= Math.exp(-damping * dt);
    wobble.current.vz *= Math.exp(-damping * dt);
    wobble.current.x += wobble.current.vx * dt;
    wobble.current.z += wobble.current.vz * dt;

    // Fill Y in world space: glass center Y + fill offset from bottom
    const fillWorldY = GLASS_CENTER_Y - GLASS_HEIGHT / 2 + fill * GLASS_HEIGHT;

    matRef.current.uniforms.fillY.value = fillWorldY;
    matRef.current.uniforms.wobbleX.value = wobble.current.x;
    matRef.current.uniforms.wobbleZ.value = wobble.current.z;
  });

  return (
    <mesh geometry={geo} visible={true}>
      <liquidMaterial ref={matRef} />
    </mesh>
  );
}

// ── Compute pour state ─────────────────────────────────────────────────────────
function computePourState(
  groupRef: React.RefObject<THREE.Group | null>,
  fillRatio: number,
  tilt: TiltRef,
) {
  if (!groupRef.current) return null;

  const tiltMag = Math.sqrt(tilt.pitch * tilt.pitch + tilt.roll * tilt.roll);
  if (tiltMag < 0.01) return null;

  // Fill level in world Y
  const fillWorldY = GLASS_CENTER_Y - GLASS_HEIGHT / 2 + fillRatio * GLASS_HEIGHT;

  // Rim in world space — the lowest point of the rim when tilted
  // Direction of tilt (where the glass tips toward)
  const tdx = tilt.pitch / tiltMag;
  const tdz = -tilt.roll / tiltMag;

  // The lowest rim point in local space
  const localRimPoint = new THREE.Vector3(
    tdx * GLASS_RADIUS_TOP,
    GLASS_HEIGHT / 2,
    tdz * GLASS_RADIUS_TOP,
  );

  // Transform to world
  groupRef.current.updateWorldMatrix(true, false);
  const worldRimPoint = localRimPoint.applyMatrix4(groupRef.current.matrixWorld);

  // Water level at the rim position (accounting for the flat world-space surface)
  // The water surface in world space is at fillWorldY
  // But it needs to account for the radius offset (water rises on the tilt side)
  const rimSideOffset = GLASS_RADIUS_TOP * Math.sin(tiltMag);
  const waterAtRim = fillWorldY + rimSideOffset;

  const overflow = waterAtRim - worldRimPoint.y;
  if (overflow <= 0) return null;

  const pourFraction = clamp(overflow / 0.4, 0, 1);

  return {
    pourFraction,
    worldRimPoint,
    pourDirX: tdx,
    pourDirZ: tdz,
    pitch: tilt.pitch,
    roll: tilt.roll,
  };
}

// ── Water Stream (tube geometry) ───────────────────────────────────────────────
interface StreamProps {
  sourceRef: React.RefObject<THREE.Group | null>;
  tiltRef: React.RefObject<TiltRef>;
  fillRef: React.RefObject<number>;
  onDrain: (amount: number) => void;
  resetToken: number;
}

function WaterStream({ sourceRef, tiltRef, fillRef, onDrain, resetToken }: StreamProps) {
  const streamRef = useRef<THREE.Mesh>(null);
  const splashRef = useRef<THREE.Points>(null);
  const splashGeoRef = useRef<THREE.BufferGeometry>(null);
  const puddleRef = useRef<THREE.Mesh>(null);
  const totalDrained = useRef(0);
  const phaseRef = useRef(0);
  const splashPosRef = useRef(new Float32Array(MAX_SPLASH * 3));

  interface SplashP { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; }
  const splashData = useRef<SplashP[]>([]);
  const splashCarry = useRef(0);

  useEffect(() => {
    const arr: SplashP[] = [];
    for (let i = 0; i < MAX_SPLASH; i++) {
      arr.push({ active: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.5 });
    }
    splashData.current = arr;
  }, []);

  useEffect(() => {
    if (!splashGeoRef.current) return;
    splashGeoRef.current.setAttribute("position", new THREE.BufferAttribute(splashPosRef.current, 3));
  }, []);

  useEffect(() => {
    totalDrained.current = 0;
    splashCarry.current = 0;
    splashData.current.forEach(p => { p.active = false; });
    if (puddleRef.current) puddleRef.current.scale.set(0, 1, 0);
  }, [resetToken]);

  const streamMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#58c0f0", transparent: true, opacity: 0.75,
    roughness: 0.04, transmission: 0.35, thickness: 0.12, side: THREE.DoubleSide,
  }), []);

  const splashMat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 14);
    g.addColorStop(0, "rgba(180,230,255,1)");
    g.addColorStop(1, "rgba(100,200,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    return new THREE.PointsMaterial({
      size: 0.08, map: tex, transparent: true, depthWrite: false,
      color: "#90ddff", opacity: 0.8, sizeAttenuation: true,
    });
  }, []);

  const dummyGeo = useMemo(() => new THREE.BufferGeometry(), []);

  useFrame((_, dt) => {
    if (!streamRef.current) return;
    phaseRef.current += dt;

    const tilt = tiltRef.current;
    const fill = fillRef.current;
    const pour = computePourState(sourceRef, fill, tilt);

    if (pour && fill > 0.01) {
      streamRef.current.visible = true;

      // Build stream arc from rim to ground
      const ox = pour.worldRimPoint.x;
      const oy = pour.worldRimPoint.y;
      const oz = pour.worldRimPoint.z;

      const outSpeed = 0.6 + pour.pourFraction * 1.2;
      const vx = pour.pourDirX * outSpeed;
      const vz = pour.pourDirZ * outSpeed;

      const fallH = Math.max(oy - GROUND_Y, 0.1);
      const fallT = Math.sqrt(2 * fallH / GRAVITY_ACCEL);

      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= STREAM_SEGMENTS; i++) {
        const f = i / STREAM_SEGMENTS;
        const t = f * fallT;
        pts.push(new THREE.Vector3(
          ox + vx * t,
          Math.max(GROUND_Y + 0.01, oy - 0.5 * GRAVITY_ACCEL * t * t),
          oz + vz * t,
        ));
      }

      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2);

      // Build tube with tapering radius
      const tubeSeg = STREAM_SEGMENTS;
      const radSeg = 6;
      const frames = curve.computeFrenetFrames(tubeSeg, false);
      const verts: number[] = [];
      const norms: number[] = [];
      const idxs: number[] = [];

      for (let i = 0; i <= tubeSeg; i++) {
        const tf = i / tubeSeg;
        const pos = curve.getPointAt(tf);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        // Taper: thick at top, thin at bottom, with wobble
        const r = STREAM_BASE_RADIUS * pour.pourFraction * (1 - tf * 0.6) *
          (1 + 0.1 * Math.sin(phaseRef.current * 10 + tf * 15));

        for (let j = 0; j <= radSeg; j++) {
          const a = (j / radSeg) * Math.PI * 2;
          const s = Math.sin(a);
          const c = -Math.cos(a);
          const nx = c * N.x + s * B.x;
          const ny = c * N.y + s * B.y;
          const nz = c * N.z + s * B.z;
          verts.push(pos.x + r * nx, pos.y + r * ny, pos.z + r * nz);
          norms.push(nx, ny, nz);
        }
      }

      for (let i = 0; i < tubeSeg; i++) {
        for (let j = 0; j < radSeg; j++) {
          const a = i * (radSeg + 1) + j;
          const b = (i + 1) * (radSeg + 1) + j;
          const c2 = (i + 1) * (radSeg + 1) + (j + 1);
          const d = i * (radSeg + 1) + (j + 1);
          idxs.push(a, b, d, b, c2, d);
        }
      }

      const newGeo = new THREE.BufferGeometry();
      newGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      newGeo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
      newGeo.setIndex(idxs);

      const old = streamRef.current.geometry;
      streamRef.current.geometry = newGeo;
      if (old !== dummyGeo) old.dispose();

      // Drain
      const drain = pour.pourFraction * 0.14 * dt;
      onDrain(drain);
      totalDrained.current += drain;

      // Splash at impact
      const impactX = ox + vx * fallT;
      const impactZ = oz + vz * fallT;
      splashCarry.current += pour.pourFraction * 60 * dt;
      const sc = Math.floor(splashCarry.current);
      splashCarry.current -= sc;
      const sp = splashData.current;
      for (let s = 0; s < sc; s++) {
        const p = sp.find(q => !q.active);
        if (!p) break;
        p.active = true;
        p.x = impactX + (Math.random() - 0.5) * 0.12;
        p.y = GROUND_Y + 0.02;
        p.z = impactZ + (Math.random() - 0.5) * 0.12;
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.3 + Math.random() * 1.2;
        p.vx = Math.cos(ang) * spd;
        p.vy = 0.8 + Math.random() * 2;
        p.vz = Math.sin(ang) * spd;
        p.age = 0;
        p.life = 0.2 + Math.random() * 0.4;
      }
    } else {
      streamRef.current.visible = false;
    }

    // Update splash particles
    const positions = splashPosRef.current;
    for (let i = 0; i < splashData.current.length; i++) {
      const p = splashData.current[i];
      const i3 = i * 3;
      if (p.active) {
        p.age += dt;
        p.vy -= GRAVITY_ACCEL * 0.6 * dt;
        p.vx *= 1 - dt * 3;
        p.vz *= 1 - dt * 3;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < GROUND_Y + 0.01) { p.y = GROUND_Y + 0.01; p.vy *= -0.1; }
        if (p.age >= p.life) p.active = false;
      }
      if (p.active) {
        positions[i3] = p.x; positions[i3 + 1] = p.y; positions[i3 + 2] = p.z;
      } else {
        positions[i3] = 0; positions[i3 + 1] = -100; positions[i3 + 2] = 0;
      }
    }
    if (splashGeoRef.current?.attributes.position) {
      (splashGeoRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Puddle
    if (puddleRef.current) {
      const target = clamp(totalDrained.current * 2, 0, PUDDLE_MAX);
      const cur = puddleRef.current.scale.x;
      puddleRef.current.scale.set(damp(cur, target, 2, dt), 1, damp(cur, target, 2, dt));
      puddleRef.current.visible = totalDrained.current > 0.001;
    }
  });

  return (
    <group>
      <mesh ref={streamRef} geometry={dummyGeo} material={streamMat} visible={false} frustumCulled={false} />
      <points ref={splashRef} frustumCulled={false}>
        <bufferGeometry ref={splashGeoRef} />
        <primitive object={splashMat} attach="material" />
      </points>
      <mesh ref={puddleRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.003, 0]} visible={false}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#3a9fd8" transparent opacity={0.3} roughness={0.1} metalness={0.3} />
      </mesh>
    </group>
  );
}

// ── Ground ─────────────────────────────────────────────────────────────────────
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

// ── Glass Assembly ─────────────────────────────────────────────────────────────
interface GlassProps {
  fillRef: React.RefObject<number>;
  onDrain: (amount: number) => void;
  resetToken: number;
}

function GlassOfWater({ fillRef, onDrain, resetToken }: GlassProps) {
  const tiltRef = useTiltFromOrientation();
  const groupRef = useRef<THREE.Group>(null);
  const smoothTiltRef = useRef<TiltRef>({ pitch: 0.15, roll: 0 });

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const t = tiltRef.current;
    smoothTiltRef.current = {
      pitch: damp(smoothTiltRef.current.pitch, t.pitch, 7, dt),
      roll: damp(smoothTiltRef.current.roll, -t.roll, 7, dt),
    };
    groupRef.current.rotation.x = smoothTiltRef.current.pitch;
    groupRef.current.rotation.z = smoothTiltRef.current.roll;
  });

  return (
    <group>
      <group ref={groupRef} position={[0, GLASS_CENTER_Y, 0]}>
        <GlassShell />
        <GlassBase />
        <GlassRim />
        <LiquidBody fillRef={fillRef} tiltRef={smoothTiltRef} />
      </group>
      <WaterStream
        sourceRef={groupRef}
        tiltRef={smoothTiltRef}
        fillRef={fillRef}
        onDrain={onDrain}
        resetToken={resetToken}
      />
    </group>
  );
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function HUD({ fillRatio, onReset }: { fillRatio: number; onReset: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-auto absolute bottom-6 right-6 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white backdrop-blur-md">
        <span className="text-xs font-medium text-cyan-200">{Math.round(fillRatio * 100)}%</span>
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
function WaterScene({ fillRef, onDrain, resetToken }: GlassProps) {
  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 8, 22]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 3]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <spotLight position={[-5, 7, 5]} angle={0.35} penumbra={0.7} intensity={40} color="#7dd3fc" />
      <Ground />
      <GlassOfWater fillRef={fillRef} onDrain={onDrain} resetToken={resetToken} />
      <Environment preset="city" />
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.48} minDistance={4} maxDistance={10} />
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────
function WaterContent() {
  const [fillRatio, setFillRatio] = useState(DEFAULT_FILL);
  const [resetToken, setResetToken] = useState(0);
  const fillRef = useRef(DEFAULT_FILL);

  useEffect(() => { fillRef.current = fillRatio; }, [fillRatio]);

  const handleDrain = useCallback((amount: number) => {
    setFillRatio(prev => Math.max(0, prev - amount));
  }, []);

  const handleReset = useCallback(() => {
    setFillRatio(DEFAULT_FILL);
    setResetToken(v => v + 1);
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b1118] text-white">
      <Canvas
        shadows
        camera={{ position: [0, 2.4, 6.6], fov: 42 }}
        gl={{ antialias: true }}
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

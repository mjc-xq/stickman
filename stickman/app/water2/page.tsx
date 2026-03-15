"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, shaderMaterial } from "@react-three/drei";
import {
  StickmanProvider,
  useOrientation,
  useStickmanStatus,
} from "@/app/hooks/stickman";

// ── Liquid Shader Material ────────────────────────────────────────────────────
const LiquidMaterial = shaderMaterial(
  {
    uTime: 0,
    uFill: 0.58,
    uTilt: new THREE.Vector2(0, 0),
    uWobble: new THREE.Vector2(0, 0),
    uColorA: new THREE.Color("#8bd7ff"),
    uColorB: new THREE.Color("#1668ff"),
    uFoam: 0.03,
    uOpacity: 0.84,
  },
  /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vFillMask;
    uniform float uTime;
    uniform float uFill;
    uniform vec2 uTilt;
    uniform vec2 uWobble;

    void main() {
      vec3 p = position;
      float wobble =
        sin((p.x * 7.0) + uTime * 2.2 + uWobble.x * 2.0) * 0.015 +
        sin((p.z * 6.0) + uTime * 1.9 + uWobble.y * 2.5) * 0.012;
      p.y += wobble * smoothstep(-0.15, 0.45, p.y);

      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorldPos = world.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);

      float planeY = mix(-0.46, 0.52, uFill);
      float slosh = (p.x * -uTilt.x + p.z * -uTilt.y) * 0.85;
      vFillMask = planeY + slosh - p.y;

      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vFillMask;
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uFoam;
    uniform float uOpacity;

    void main() {
      if (vFillMask < 0.0) discard;

      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.5);
      float depthMix = clamp((vWorldPos.y + 0.45) * 0.9, 0.0, 1.0);
      vec3 color = mix(uColorB, uColorA, depthMix + fresnel * 0.35);

      float foamBand = smoothstep(0.0, uFoam, vFillMask);
      color = mix(vec3(1.0), color, foamBand);

      gl_FragColor = vec4(color, uOpacity + fresnel * 0.08);
    }
  `,
);
extend({ LiquidMaterial });

// Type augmentation for R3F JSX
declare module "@react-three/fiber" {
  interface ThreeElements {
    liquidMaterial: React.DetailedHTMLProps<
      React.HTMLAttributes<InstanceType<typeof LiquidMaterial>>,
      InstanceType<typeof LiquidMaterial>
    > & {
      ref?: React.Ref<InstanceType<typeof LiquidMaterial>>;
      transparent?: boolean;
      side?: THREE.Side;
    };
  }
}

// ── Orientation-driven tilt (same pattern as pig/water1) ──────────────────────
// Uses useOrientation() gravity vector from the stickman device hooks.
// gravityX = left/right tilt (roll), gravityY = forward/back tilt (pitch)
// Mouse fallback when no device connected.
function useTiltFromOrientation() {
  const orientation = useOrientation();
  const { receiving } = useStickmanStatus();
  const tiltRef = useRef({ pitch: 0, roll: 0 });
  const mouseRef = useRef({ pitch: 0, roll: 0 });

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseRef.current = {
        pitch: y * 1.2,
        roll: x * 1.2,
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
          pitch: o.gravityY * 1.2,
          roll: o.gravityX * 1.2,
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

// ── Glass ─────────────────────────────────────────────────────────────────────
function Glass({ rotationRef }: { rotationRef: React.RefObject<{ x: number; z: number }> }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    group.current.rotation.x = rotationRef.current.x;
    group.current.rotation.z = rotationRef.current.z;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow renderOrder={2}>
        <cylinderGeometry args={[0.58, 0.44, 1.4, 64, 1, true]} />
        <meshStandardMaterial
          color="#e8f4ff" transparent opacity={0.15} roughness={0.02}
          metalness={0.1} side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -0.67, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.05, 64]} />
        <meshPhysicalMaterial color="#dbeafe" transparent opacity={0.65} roughness={0.08} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <torusGeometry args={[0.51, 0.025, 16, 64]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.7} roughness={0.08} />
      </mesh>
    </group>
  );
}

// ── Liquid Body ───────────────────────────────────────────────────────────────
function Liquid({
  rotationRef,
}: {
  rotationRef: React.RefObject<{ x: number; z: number }>;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<InstanceType<typeof LiquidMaterial>>(null);
  const state = useRef({
    fill: 0.58,
    slosh: new THREE.Vector2(),
    wobble: new THREE.Vector2(),
    prev: new THREE.Vector2(),
  });

  useFrame((_, dt) => {
    if (!mesh.current || !mat.current) return;
    const rot = rotationRef.current;
    mesh.current.rotation.x = rot.x;
    mesh.current.rotation.z = rot.z;

    mat.current.uTime += dt;
    mat.current.uFill = state.current.fill;

    const cur = new THREE.Vector2(rot.z, rot.x);
    const delta = cur.clone().sub(state.current.prev);
    state.current.prev.copy(cur);

    const sloshTarget = cur.clone().multiplyScalar(0.85).add(delta.multiplyScalar(5));
    state.current.slosh.lerp(sloshTarget, 0.14);
    state.current.wobble.lerp(delta.clone().multiplyScalar(14), 0.16);

    mat.current.uTilt.lerp(state.current.slosh, 0.12);
    mat.current.uWobble.lerp(state.current.wobble, 0.1);
  });

  return (
    <mesh ref={mesh} position={[0, 0.02, 0]} renderOrder={-1}>
      <cylinderGeometry args={[0.435, 0.325, 1.22, 64, 16, false]} />
      <liquidMaterial ref={mat} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Droplet System ────────────────────────────────────────────────────────────
interface DropletData {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  scale: number;
}

// Pre-generate droplet data at module scope
const DROPLET_COUNT = 180;
const DROPLET_DATA: DropletData[] = Array.from({ length: DROPLET_COUNT }, () => ({
  pos: new THREE.Vector3(999, 999, 999),
  vel: new THREE.Vector3(),
  life: 0,
  scale: 0,
}));

function DropletsSystem({ rotationRef }: { rotationRef: React.RefObject<{ x: number; z: number }> }) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const temp = useMemo(() => new THREE.Object3D(), []);
  const seedRef = useRef(0);

  useFrame((_, dt) => {
    if (!inst.current) return;
    const rot = rotationRef.current;
    const tiltMag = Math.max(Math.abs(rot.x), Math.abs(rot.z));
    const shouldSpill = tiltMag > 0.35;

    if (shouldSpill) {
      const sideX = rot.z > 0 ? -1 : 1;
      const sideZ = rot.x > 0 ? -1 : 1;
      const spawnCount = 3 + Math.floor((tiltMag - 0.35) * 22);
      for (let n = 0; n < spawnCount; n++) {
        const d = DROPLET_DATA.find((x) => x.life <= 0);
        if (!d) break;
        // Use seedRef for deterministic-ish random in rAF (not render)
        seedRef.current++;
        const s = seedRef.current;
        const r1 = ((s * 16807 + 1) % 2147483647) / 2147483647;
        const r2 = ((s * 48271 + 1) % 2147483647) / 2147483647;
        const r3 = ((s * 69621 + 1) % 2147483647) / 2147483647;
        const r4 = ((s * 31337 + 1) % 2147483647) / 2147483647;
        d.life = 0.9 + r1 * 0.5;
        d.scale = 0.016 + r2 * 0.02;
        d.pos.set(
          sideX * (0.38 + r3 * 0.12),
          0.52 + r4 * 0.12,
          sideZ * (0.08 + r1 * 0.1),
        );
        d.vel.set(
          sideX * (0.6 + r2 * 0.6),
          0.25 + r3 * 0.3,
          sideZ * (0.15 + r4 * 0.2),
        );
      }
    }

    for (let i = 0; i < DROPLET_DATA.length; i++) {
      const d = DROPLET_DATA[i];
      if (d.life > 0) {
        d.life -= dt;
        d.vel.y -= 2.6 * dt;
        d.vel.multiplyScalar(0.996);
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y < -0.72) {
          d.pos.y = -0.72;
          d.vel.y *= -0.18;
          d.vel.x *= 0.82;
          d.vel.z *= 0.82;
        }
      } else {
        d.pos.set(999, 999, 999);
        d.scale = 0;
      }

      temp.position.copy(d.pos);
      temp.scale.setScalar(d.scale);
      temp.updateMatrix();
      inst.current.setMatrixAt(i, temp.matrix);
    }

    inst.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, DROPLET_COUNT]} castShadow>
      <sphereGeometry args={[1, 10, 10]} />
      <meshPhysicalMaterial color="#5db7ff" transparent opacity={0.92} roughness={0.08} transmission={0.2} />
    </instancedMesh>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
  const tiltRef = useTiltFromOrientation();
  const rotationRef = useRef({ x: 0, z: 0 });

  useFrame((_, dt) => {
    const t = tiltRef.current;
    // pitch → rotation.x, roll → rotation.z (same mapping as water1/pig)
    rotationRef.current.x = THREE.MathUtils.damp(rotationRef.current.x, t.pitch, 5.5, dt);
    rotationRef.current.z = THREE.MathUtils.damp(rotationRef.current.z, -t.roll, 5.5, dt);
  });

  return (
    <>
      <color attach="background" args={["#0b1118"]} />
      <fog attach="fog" args={["#0b1118", 7, 13]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 3]} intensity={2.2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <spotLight position={[-3, 5, 4]} intensity={1.4} angle={0.35} penumbra={0.8} />

      <group position={[0, 0.2, 0]}>
        <Glass rotationRef={rotationRef} />
        <Liquid rotationRef={rotationRef} />
        <DropletsSystem rotationRef={rotationRef} />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.74, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial transparent opacity={0.22} />
      </mesh>

      <ContactShadows position={[0, -0.739, 0]} opacity={0.35} scale={6} blur={2.5} far={2.4} />
      <Environment preset="studio" />
      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={7.5} minPolarAngle={0.8} maxPolarAngle={1.65} />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function Water2Content() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b1118] text-white">
      <Canvas shadows camera={{ position: [0, 2.0, 4.0], fov: 38 }} gl={{ antialias: true }}>
        <Scene />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl bg-black/40 px-3 py-2 text-xs text-white/60 backdrop-blur-md">
        Drag to tilt &middot; Game-style liquid shader
      </div>
    </div>
  );
}

export default function Water2Page() {
  return (
    <StickmanProvider>
      <Water2Content />
    </StickmanProvider>
  );
}

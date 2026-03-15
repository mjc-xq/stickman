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
const GLASS_HEIGHT = 2.6;
const GLASS_RADIUS_TOP = 0.72;
const GLASS_RADIUS_BOTTOM = 0.5;
const WALL_THICKNESS = 0.06;
const DEFAULT_FILL = 0.72;
const INNER_RADIUS_TOP = GLASS_RADIUS_TOP - WALL_THICKNESS * 1.9;
const INNER_RADIUS_BOTTOM = GLASS_RADIUS_BOTTOM - WALL_THICKNESS * 1.9;
const GROUND_Y = 0;
const GLASS_CENTER_Y = 1.55;
// Stream constants
const STREAM_SEGMENTS = 24;
const STREAM_RADIUS = 0.035;
const MAX_SPLASH_PARTICLES = 120;
const PUDDLE_MAX_RADIUS = 1.8;

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
 */
function computeWaterState(pitch: number, roll: number, fillRatio: number) {
  const tiltMag = Math.sqrt(pitch * pitch + roll * roll);

  const waterCenterY = -GLASS_HEIGHT / 2 + fillRatio * GLASS_HEIGHT;

  const surfaceTiltAngle = tiltMag;

  const t = clamp((waterCenterY + GLASS_HEIGHT / 2) / GLASS_HEIGHT, 0, 1);
  const radiusAtCenter = THREE.MathUtils.lerp(
    INNER_RADIUS_BOTTOM,
    INNER_RADIUS_TOP,
    t,
  );

  const surfaceOffset = radiusAtCenter * Math.tan(surfaceTiltAngle);
  const waterHighY = waterCenterY + surfaceOffset;

  const rimY = GLASS_HEIGHT / 2;
  const overflowAmount = waterHighY - rimY;
  const pourFraction = clamp(overflowAmount / 0.3, 0, 1);

  const pourDirX = tiltMag > 0.001 ? pitch / tiltMag : 0;
  const pourDirZ = tiltMag > 0.001 ? -roll / tiltMag : 0;

  const pourPointLocal = new THREE.Vector3(
    pourDirX * GLASS_RADIUS_TOP,
    rimY,
    pourDirZ * GLASS_RADIUS_TOP,
  );

  return {
    waterCenterY,
    surfaceTiltAngle,
    tiltAxisAngle: Math.atan2(-roll, pitch),
    pourFraction,
    pourPointLocal,
    pourDirX,
    pourDirZ,
    waterHighY,
    waterLowY: waterCenterY - surfaceOffset,
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

  const clipPlaneRef = useRef<THREE.Plane | null>(null);

  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    clipPlaneRef.current = plane;
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#4ab8f0",
      transparent: true,
      opacity: 0.65,
      roughness: 0.05,
      transmission: 0.3,
      thickness: 0.2,
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

// ── Water Stream — tube geometry from rim to ground ──────────────────────────
interface WaterStreamProps {
  sourceRef: React.RefObject<THREE.Group | null>;
  tiltRef: React.RefObject<TiltRef>;
  fillRef: React.RefObject<number>;
  onDrain: (amount: number) => void;
  resetToken: number;
}

function WaterStream({
  sourceRef,
  tiltRef,
  fillRef,
  onDrain,
  resetToken,
}: WaterStreamProps) {
  const streamMeshRef = useRef<THREE.Mesh>(null);
  const dripMeshRef = useRef<THREE.InstancedMesh>(null);
  const splashPointsRef = useRef<THREE.Points>(null);
  const splashGeoRef = useRef<THREE.BufferGeometry>(null);
  const puddleRef = useRef<THREE.Mesh>(null);
  const pourActiveRef = useRef(false);
  const totalDrainedRef = useRef(0);
  const streamPhaseRef = useRef(0);

  // Reusable vectors
  const _origin = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _tmpMat = useMemo(() => new THREE.Matrix4(), []);
  const _tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const _tmpScale = useMemo(() => new THREE.Vector3(), []);
  // Splash particle data
  interface SplashParticle {
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

  const splashParticlesRef = useRef<SplashParticle[]>([]);
  const splashPositionsRef = useRef<Float32Array | null>(null);
  const splashAlphasRef = useRef<Float32Array | null>(null);
  const spawnCarryRef = useRef(0);

  // Drip particles: small instanced spheres along the stream
  const NUM_DRIPS = 20;
  interface DripParticle {
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    age: number;
    life: number;
    size: number;
  }
  const dripParticlesRef = useRef<DripParticle[]>([]);
  const dripSpawnRef = useRef(0);

  // Initialize splash particles
  useEffect(() => {
    const particles: SplashParticle[] = [];
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
      });
    }
    splashParticlesRef.current = particles;
    splashPositionsRef.current = new Float32Array(MAX_SPLASH_PARTICLES * 3);
    splashAlphasRef.current = new Float32Array(MAX_SPLASH_PARTICLES);

    const drips: DripParticle[] = [];
    for (let i = 0; i < NUM_DRIPS; i++) {
      drips.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        size: 0.03,
      });
    }
    dripParticlesRef.current = drips;
  }, []);

  // Set up splash geometry attributes
  useEffect(() => {
    if (!splashGeoRef.current || !splashPositionsRef.current || !splashAlphasRef.current) return;
    splashGeoRef.current.setAttribute(
      "position",
      new THREE.BufferAttribute(splashPositionsRef.current, 3),
    );
    splashGeoRef.current.setAttribute(
      "alpha",
      new THREE.BufferAttribute(splashAlphasRef.current, 1),
    );
  }, []);

  // Reset
  useEffect(() => {
    totalDrainedRef.current = 0;
    pourActiveRef.current = false;
    spawnCarryRef.current = 0;
    dripSpawnRef.current = 0;
    const sp = splashParticlesRef.current;
    for (let i = 0; i < sp.length; i++) {
      sp[i].active = false;
    }
    const dp = dripParticlesRef.current;
    for (let i = 0; i < dp.length; i++) {
      dp[i].active = false;
    }
    if (puddleRef.current) {
      puddleRef.current.scale.set(0, 1, 0);
    }
  }, [resetToken]);

  // Sprite texture for splash
  const splashSprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
    gradient.addColorStop(0, "rgba(180,230,255,1)");
    gradient.addColorStop(0.5, "rgba(140,210,255,0.7)");
    gradient.addColorStop(1, "rgba(100,190,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // Stream material
  const streamMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: "#68c8f8",
      transparent: true,
      opacity: 0.7,
      roughness: 0.05,
      transmission: 0.4,
      thickness: 0.15,
      side: THREE.DoubleSide,
    });
  }, []);

  // Drip sphere geometry
  const dripGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const dripMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#78d0ff",
        transparent: true,
        opacity: 0.75,
        roughness: 0.05,
        transmission: 0.3,
        thickness: 0.1,
      }),
    [],
  );

  // Splash point material using custom shader for per-particle alpha
  const splashMaterial = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.12,
      map: splashSprite,
      transparent: true,
      depthWrite: false,
      color: new THREE.Color("#a0e0ff"),
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
  }, [splashSprite]);

  useFrame((_, dt) => {
    if (!sourceRef.current) return;

    const { pitch, roll } = tiltRef.current;
    const fillRatio = fillRef.current;

    const ws = computeWaterState(pitch, roll, fillRatio);
    const pouring = ws.pourFraction > 0.001 && fillRatio > 0.02;
    pourActiveRef.current = pouring;

    streamPhaseRef.current += dt;

    // Compute pour origin in world space
    _origin.copy(ws.pourPointLocal);
    sourceRef.current.updateWorldMatrix(true, false);
    _origin.applyMatrix4(sourceRef.current.matrixWorld);

    // Pour direction: outward + down
    const outSpeed = 0.8 + ws.pourFraction * 1.5;
    _dir.set(ws.pourDirX * outSpeed, -0.3, ws.pourDirZ * outSpeed);
    const euler = new THREE.Euler(pitch, 0, -roll, "XYZ");
    _dir.applyEuler(euler);

    // ── Update stream tube ──────────────────────────────────────────────
    if (streamMeshRef.current) {
      if (pouring) {
        // Build a catmull-rom curve from pour point to ground
        const points: THREE.Vector3[] = [];
        const ox = _origin.x;
        const oy = _origin.y;
        const oz = _origin.z;

        const fallHeight = oy - GROUND_Y;
        const fallTime = Math.sqrt((2 * fallHeight) / GRAVITY);

        const numPts = STREAM_SEGMENTS + 1;
        for (let i = 0; i < numPts; i++) {
          const frac = i / (numPts - 1);
          const t = frac * fallTime;
          const px = ox + _dir.x * t;
          const py = oy + _dir.y * t - 0.5 * GRAVITY * t * t;
          const pz = oz + _dir.z * t;

          // Clamp to ground
          const finalY = Math.max(GROUND_Y + 0.01, py);
          points.push(new THREE.Vector3(px, finalY, pz));
        }

        const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.3);

        // Vary radius along stream: thicker at top, thinner as it falls
        const radiusFunc = (tParam: number) => {
          const base = STREAM_RADIUS * ws.pourFraction;
          const taper = 1 - tParam * 0.5;
          const wobble =
            1 +
            0.08 *
              Math.sin(
                streamPhaseRef.current * 8 + tParam * 12,
              );
          return base * taper * wobble;
        };

        // Build tube geometry with varying radius
        const tubularSegments = STREAM_SEGMENTS;
        const radialSegments = 8;

        const frames = curve.computeFrenetFrames(tubularSegments, false);
        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        for (let i = 0; i <= tubularSegments; i++) {
          const tParam = i / tubularSegments;
          const pos = curve.getPointAt(tParam);
          const N = frames.normals[i];
          const B = frames.binormals[i];
          const r = radiusFunc(tParam);

          for (let j = 0; j <= radialSegments; j++) {
            const v = (j / radialSegments) * Math.PI * 2;
            const sin = Math.sin(v);
            const cos = -Math.cos(v);

            const nx = cos * N.x + sin * B.x;
            const ny = cos * N.y + sin * B.y;
            const nz = cos * N.z + sin * B.z;

            vertices.push(
              pos.x + r * nx,
              pos.y + r * ny,
              pos.z + r * nz,
            );
            normals.push(nx, ny, nz);
          }
        }

        for (let i = 0; i < tubularSegments; i++) {
          for (let j = 0; j < radialSegments; j++) {
            const a = i * (radialSegments + 1) + j;
            const b = (i + 1) * (radialSegments + 1) + j;
            const c = (i + 1) * (radialSegments + 1) + (j + 1);
            const d = i * (radialSegments + 1) + (j + 1);
            indices.push(a, b, d);
            indices.push(b, c, d);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        geo.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(normals, 3),
        );
        geo.setIndex(indices);

        const oldGeo = streamMeshRef.current.geometry;
        streamMeshRef.current.geometry = geo;
        oldGeo.dispose();

        streamMeshRef.current.visible = true;

        // Drain
        const drain = ws.pourFraction * 0.16 * dt;
        onDrain(drain);
        totalDrainedRef.current += drain;

        // ── Spawn drip particles near stream ────────────────────────
        dripSpawnRef.current += ws.pourFraction * 40 * dt;
        const dripSpawnCount = Math.floor(dripSpawnRef.current);
        dripSpawnRef.current -= dripSpawnCount;

        const drips = dripParticlesRef.current;
        for (let s = 0; s < dripSpawnCount; s++) {
          const p = drips.find((item) => !item.active);
          if (!p) break;
          p.active = true;
          const tParam = Math.random() * 0.8;
          const tFall = tParam * fallTime;
          p.x = ox + _dir.x * tFall + (Math.random() - 0.5) * 0.08;
          p.y =
            oy +
            _dir.y * tFall -
            0.5 * GRAVITY * tFall * tFall +
            (Math.random() - 0.5) * 0.05;
          p.z = oz + _dir.z * tFall + (Math.random() - 0.5) * 0.08;
          p.vx = _dir.x * 0.3 + (Math.random() - 0.5) * 0.4;
          p.vy = -Math.random() * 1.5;
          p.vz = _dir.z * 0.3 + (Math.random() - 0.5) * 0.4;
          p.age = 0;
          p.life = 0.5 + Math.random() * 0.7;
          p.size = 0.02 + Math.random() * 0.03;
        }

        // ── Splash at ground impact ──────────────────────────────────
        // Find where stream hits ground
        const impactT = fallTime;
        const impactX = ox + _dir.x * impactT;
        const impactZ = oz + _dir.z * impactT;

        spawnCarryRef.current += ws.pourFraction * 80 * dt;
        const splashSpawnCount = Math.floor(spawnCarryRef.current);
        spawnCarryRef.current -= splashSpawnCount;

        const splashParts = splashParticlesRef.current;
        for (let s = 0; s < splashSpawnCount; s++) {
          const p = splashParts.find((item) => !item.active);
          if (!p) break;
          p.active = true;
          p.x = impactX + (Math.random() - 0.5) * 0.15;
          p.y = GROUND_Y + 0.02;
          p.z = impactZ + (Math.random() - 0.5) * 0.15;
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 1.5;
          p.vx = Math.cos(angle) * speed;
          p.vy = 1.0 + Math.random() * 2.5;
          p.vz = Math.sin(angle) * speed;
          p.age = 0;
          p.life = 0.3 + Math.random() * 0.5;
        }
      } else {
        streamMeshRef.current.visible = false;
      }
    }

    // ── Update drip instances ──────────────────────────────────────────
    if (dripMeshRef.current) {
      const drips = dripParticlesRef.current;
      for (let i = 0; i < drips.length; i++) {
        const p = drips[i];
        if (p.active) {
          p.age += dt;
          p.vy -= GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;

          if (p.y < GROUND_Y + 0.01) {
            p.active = false;
          }
          if (p.age >= p.life) {
            p.active = false;
          }

          if (p.active) {
            _tmpScale.set(p.size, p.size * 1.5, p.size);
            _tmpMat.compose(
              new THREE.Vector3(p.x, p.y, p.z),
              _tmpQuat,
              _tmpScale,
            );
            dripMeshRef.current.setMatrixAt(i, _tmpMat);
          } else {
            _tmpMat.makeScale(0, 0, 0);
            _tmpMat.setPosition(0, -100, 0);
            dripMeshRef.current.setMatrixAt(i, _tmpMat);
          }
        } else {
          _tmpMat.makeScale(0, 0, 0);
          _tmpMat.setPosition(0, -100, 0);
          dripMeshRef.current.setMatrixAt(i, _tmpMat);
        }
      }
      dripMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Update splash particles ──────────────────────────────────────
    const positions = splashPositionsRef.current;
    const alphas = splashAlphasRef.current;
    if (positions && alphas && splashGeoRef.current) {
      const splashParts = splashParticlesRef.current;
      for (let i = 0; i < splashParts.length; i++) {
        const p = splashParts[i];
        const i3 = i * 3;
        if (p.active) {
          p.age += dt;
          p.vy -= GRAVITY * 0.8 * dt;
          p.vx *= 1 - dt * 2;
          p.vz *= 1 - dt * 2;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;

          if (p.y < GROUND_Y + 0.01) {
            p.y = GROUND_Y + 0.01;
            p.vy *= -0.15;
            if (Math.abs(p.vy) < 0.1) p.active = false;
          }

          if (p.age >= p.life) {
            p.active = false;
          }

          if (p.active) {
            positions[i3] = p.x;
            positions[i3 + 1] = p.y;
            positions[i3 + 2] = p.z;
            alphas[i] = 1 - p.age / p.life;
          } else {
            positions[i3] = 0;
            positions[i3 + 1] = -100;
            positions[i3 + 2] = 0;
            alphas[i] = 0;
          }
        } else {
          positions[i3] = 0;
          positions[i3 + 1] = -100;
          positions[i3 + 2] = 0;
          alphas[i] = 0;
        }
      }
      const posAttr = splashGeoRef.current.attributes
        .position as THREE.BufferAttribute;
      if (posAttr) posAttr.needsUpdate = true;
    }

    // ── Update puddle ──────────────────────────────────────────────────
    if (puddleRef.current) {
      const targetRadius = clamp(
        totalDrainedRef.current * 2.5,
        0,
        PUDDLE_MAX_RADIUS,
      );
      const current = puddleRef.current.scale.x;
      const newScale = damp(current, targetRadius, 2, dt);
      puddleRef.current.scale.set(newScale, 1, newScale);
      puddleRef.current.visible = totalDrainedRef.current > 0.001;
    }
  });

  // Dummy geometry for stream initially (will be replaced in useFrame)
  const dummyGeo = useMemo(() => {
    return new THREE.BufferGeometry();
  }, []);

  return (
    <group>
      {/* Main water stream tube */}
      <mesh
        ref={streamMeshRef}
        geometry={dummyGeo}
        material={streamMaterial}
        visible={false}
        frustumCulled={false}
      />

      {/* Drip droplets near stream */}
      <instancedMesh
        ref={dripMeshRef}
        args={[dripGeo, dripMat, NUM_DRIPS]}
        frustumCulled={false}
      />

      {/* Splash particles at ground */}
      <points ref={splashPointsRef} frustumCulled={false}>
        <bufferGeometry ref={splashGeoRef} />
        <primitive object={splashMaterial} attach="material" />
      </points>

      {/* Puddle on ground */}
      <mesh
        ref={puddleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GROUND_Y + 0.003, 0]}
        visible={false}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial
          color="#3a9fd8"
          transparent
          opacity={0.35}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>
    </group>
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

// ── Glass assembly ────────────────────────────────────────────────────────────
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
      <group ref={groupRef} position={[0, GLASS_CENTER_Y, 0]}>
        <GlassShell />
        <GlassBase />
        <GlassRimRing />
        <WaterInside fillRef={fillRef} tiltRef={smoothTiltRef} />
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

// ── HUD (HTML overlay, outside Canvas) ──────────────────────────────────────
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
      <GlassOfWater
        fillRef={fillRef}
        onDrain={onDrain}
        resetToken={resetToken}
      />
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
        <WaterScene
          fillRef={fillRef}
          onDrain={handleDrain}
          resetToken={resetToken}
        />
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

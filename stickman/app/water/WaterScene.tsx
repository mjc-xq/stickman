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

// ── GLSL Shaders ─────────────────────────────────────────────────────────────

const DEPTH_VERT = /* glsl */ `
uniform float uPointScale;
uniform float uParticleRadius;
varying float vViewZ;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewZ = -mvPos.z;
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = uParticleRadius * uPointScale / max(vViewZ, 0.01);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform float uParticleRadius;
uniform float uNear;
uniform float uFar;
varying float vViewZ;
void main() {
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(coord, coord);
  if (r2 > 1.0) discard;
  float sphereZ = vViewZ - sqrt(1.0 - r2) * uParticleRadius;
  float depth = (sphereZ - uNear) / (uFar - uNear);
  depth = clamp(depth, 0.0, 0.999);
  gl_FragColor = vec4(depth, depth, depth, 1.0);
}
`;

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D uDepthTex;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
uniform float uFilterRadius;
uniform float uBlurDepthFalloff;
varying vec2 vUv;
void main() {
  float centerDepth = texture2D(uDepthTex, vUv).r;
  if (centerDepth > 0.999) { gl_FragColor = vec4(1.0); return; }
  float sum = 0.0;
  float wsum = 0.0;
  for (float x = -20.0; x <= 20.0; x += 1.0) {
    if (abs(x) > uFilterRadius) continue;
    vec2 sampleUV = vUv + uDirection * uTexelSize * x;
    float sampleDepth = texture2D(uDepthTex, sampleUV).r;
    if (sampleDepth > 0.999) continue;
    float r = x / (uFilterRadius * 0.5);
    float w = exp(-0.5 * r * r);
    float dz = (sampleDepth - centerDepth) * uBlurDepthFalloff;
    float w2 = exp(-0.5 * dz * dz);
    sum += sampleDepth * w * w2;
    wsum += w * w2;
  }
  gl_FragColor = vec4(wsum > 0.0 ? sum / wsum : centerDepth, 0.0, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uDepthTex;
uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;
uniform vec3 uLightDir;
varying vec2 vUv;
void main() {
  float depth = texture2D(uDepthTex, vUv).r;
  vec4 sceneColor = texture2D(uSceneTex, vUv);
  if (depth > 0.999) { gl_FragColor = sceneColor; return; }
  float dxp = texture2D(uDepthTex, vUv + vec2(uTexelSize.x, 0.0)).r;
  float dxn = texture2D(uDepthTex, vUv - vec2(uTexelSize.x, 0.0)).r;
  float dyp = texture2D(uDepthTex, vUv + vec2(0.0, uTexelSize.y)).r;
  float dyn = texture2D(uDepthTex, vUv - vec2(0.0, uTexelSize.y)).r;
  if (dxp > 0.999) dxp = depth;
  if (dxn > 0.999) dxn = depth;
  if (dyp > 0.999) dyp = depth;
  if (dyn > 0.999) dyn = depth;
  float dx = dxp - dxn;
  float dy = dyp - dyn;
  vec3 normal = normalize(vec3(-dx * 400.0, -dy * 400.0, 1.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float NdotV = max(dot(normal, viewDir), 0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);
  vec3 lightDir = normalize(uLightDir);
  vec3 halfVec = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 128.0);
  float diffuse = max(dot(normal, lightDir), 0.0) * 0.6 + 0.4;
  vec3 waterColor = vec3(0.2, 0.55, 0.85) * diffuse;
  vec3 envColor = mix(vec3(0.05, 0.1, 0.2), vec3(0.3, 0.5, 0.8), normal.y * 0.5 + 0.5);
  vec2 refractUV = clamp(vUv + normal.xy * 0.02, 0.0, 1.0);
  vec3 refracted = texture2D(uSceneTex, refractUV).rgb;
  vec3 color = mix(waterColor, envColor, fresnel * 0.5);
  color += spec * vec3(1.0);
  color = mix(color, refracted * vec3(0.7, 0.85, 1.0), 0.25);
  float alpha = smoothstep(0.999, 0.98, depth);
  gl_FragColor = vec4(mix(sceneColor.rgb, color, alpha * 0.9), 1.0);
}
`;

// ── Screen-space Fluid Renderer ─────────────────────────────────────────────
function FluidRenderer({
  simRef,
  glassGroupRef,
}: {
  simRef: React.RefObject<SPHSimulation | null>;
  glassGroupRef: React.RefObject<THREE.Group | null>;
}) {
  const prevSize = useRef({ w: 0, h: 0 });
  const resourcesRef = useRef<{
    particleScene: THREE.Scene;
    points: THREE.Points;
    posAttr: THREE.BufferAttribute;
    depthMat: THREE.ShaderMaterial;
    blurMat: THREE.ShaderMaterial;
    compositeMat: THREE.ShaderMaterial;
    depthFbo: THREE.WebGLRenderTarget;
    blurFboA: THREE.WebGLRenderTarget;
    blurFboB: THREE.WebGLRenderTarget;
    sceneFbo: THREE.WebGLRenderTarget;
    fsScene: THREE.Scene;
    fsCamera: THREE.OrthographicCamera;
    fsQuad: THREE.Mesh;
  } | null>(null);

  // Initialize GPU resources once on mount
  useEffect(() => {
    const maxParticles = PARTICLE_COUNT * 2;
    const fboOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    };

    const depthFbo = new THREE.WebGLRenderTarget(1, 1, {
      ...fboOpts,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const blurFboA = new THREE.WebGLRenderTarget(1, 1, fboOpts);
    const blurFboB = new THREE.WebGLRenderTarget(1, 1, fboOpts);
    const sceneFbo = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    const depthMat = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      uniforms: {
        uPointScale: { value: 400 },
        uParticleRadius: { value: 0.2 },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
      },
      depthTest: true,
      depthWrite: true,
      transparent: false,
    });

    const blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        uDepthTex: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uFilterRadius: { value: 20.0 },
        uBlurDepthFalloff: { value: 4.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        uDepthTex: { value: null },
        uSceneTex: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      },
      depthTest: false,
      depthWrite: false,
    });

    const posArray = new Float32Array(maxParticles * 3);
    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", posAttr);
    geo.setDrawRange(0, 0);
    const points = new THREE.Points(geo, depthMat);
    points.frustumCulled = false;
    const particleScene = new THREE.Scene();
    particleScene.add(points);

    const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fsGeo = new THREE.PlaneGeometry(2, 2);
    const fsQuad = new THREE.Mesh(fsGeo, blurMat);
    const fsScene = new THREE.Scene();
    fsScene.add(fsQuad);

    resourcesRef.current = {
      particleScene, points, posAttr, depthMat, blurMat, compositeMat,
      depthFbo, blurFboA, blurFboB, sceneFbo,
      fsScene, fsCamera, fsQuad,
    };

    return () => {
      depthFbo.dispose();
      blurFboA.dispose();
      blurFboB.dispose();
      sceneFbo.dispose();
      depthMat.dispose();
      blurMat.dispose();
      compositeMat.dispose();
      geo.dispose();
      fsGeo.dispose();
      resourcesRef.current = null;
    };
  }, []);

  useFrame((state) => {
    const r = resourcesRef.current;
    if (!r || !simRef.current) return;

    const renderer = state.gl;
    const cam = state.camera;
    const mainScene = state.scene;
    const { width: w, height: h } = state.size;

    // Resize FBOs if needed
    const dpr = renderer.getPixelRatio();
    if (prevSize.current.w !== w || prevSize.current.h !== h) {
      const pw = Math.max(Math.floor(w * dpr), 1);
      const ph = Math.max(Math.floor(h * dpr), 1);
      r.depthFbo.setSize(pw, ph);
      r.blurFboA.setSize(pw, ph);
      r.blurFboB.setSize(pw, ph);
      r.sceneFbo.setSize(pw, ph);
      r.blurMat.uniforms.uTexelSize.value.set(1 / pw, 1 / ph);
      r.compositeMat.uniforms.uTexelSize.value.set(1 / pw, 1 / ph);
      prevSize.current = { w, h };
    }

    // Update depth shader camera uniforms
    const projCam = cam as THREE.PerspectiveCamera;
    r.depthMat.uniforms.uNear.value = projCam.near;
    r.depthMat.uniforms.uFar.value = projCam.far;
    r.depthMat.uniforms.uPointScale.value = h * dpr * 1.2;

    // Update particle positions from simulation
    const sim = simRef.current;
    const contained = sim.getContainedPositions();
    const containedCount = sim.getContainedCount();
    const escaped = sim.getEscapedParticles();
    const glassGroup = glassGroupRef.current;
    const glassMat = glassGroup ? glassGroup.matrixWorld : new THREE.Matrix4();
    const v = new THREE.Vector3();
    const arr = r.posAttr.array as Float32Array;

    let total = 0;
    // Contained particles: local -> world
    for (let i = 0; i < containedCount; i++) {
      v.set(contained[i * 3], contained[i * 3 + 1], contained[i * 3 + 2]);
      v.applyMatrix4(glassMat);
      arr[total * 3] = v.x;
      arr[total * 3 + 1] = v.y;
      arr[total * 3 + 2] = v.z;
      total++;
    }
    // Escaped particles: already world-space
    for (let i = 0; i < escaped.length; i++) {
      const p = escaped[i];
      arr[total * 3] = p.x;
      arr[total * 3 + 1] = p.y;
      arr[total * 3 + 2] = p.z;
      total++;
    }
    r.posAttr.needsUpdate = true;
    r.points.geometry.setDrawRange(0, total);

    // Save renderer state
    const savedAutoClear = renderer.autoClear;
    const savedClearColor = renderer.getClearColor(new THREE.Color());
    const savedClearAlpha = renderer.getClearAlpha();
    const savedRenderTarget = renderer.getRenderTarget();
    renderer.autoClear = false;

    // PASS 0: Render main scene (glass, ground, lights) to sceneFBO
    renderer.setRenderTarget(r.sceneFbo);
    renderer.setClearColor(0x0b1118, 1);
    renderer.clear();
    renderer.render(mainScene, cam);

    // PASS 1: Render particle depth to depthFBO
    renderer.setRenderTarget(r.depthFbo);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(r.particleScene, cam);

    // PASS 2: Bilateral blur (ping-pong between A and B, 3 iterations)
    // Each iteration: horizontal reads src -> writes A, vertical reads A -> writes B
    // Then B becomes the src for the next iteration
    let srcFbo = r.depthFbo;

    for (let iter = 0; iter < 4; iter++) {
      // Horizontal: src -> A
      r.blurMat.uniforms.uDepthTex.value = srcFbo.texture;
      r.blurMat.uniforms.uDirection.value.set(1, 0);
      r.fsQuad.material = r.blurMat;
      renderer.setRenderTarget(r.blurFboA);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(r.fsScene, r.fsCamera);

      // Vertical: A -> B
      r.blurMat.uniforms.uDepthTex.value = r.blurFboA.texture;
      r.blurMat.uniforms.uDirection.value.set(0, 1);
      renderer.setRenderTarget(r.blurFboB);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(r.fsScene, r.fsCamera);

      srcFbo = r.blurFboB;
    }
    // Final blurred result is in blurFboB

    // PASS 3: Composite to screen
    r.compositeMat.uniforms.uDepthTex.value = r.blurFboB.texture;
    r.compositeMat.uniforms.uSceneTex.value = r.sceneFbo.texture;
    r.fsQuad.material = r.compositeMat;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(r.fsScene, r.fsCamera);

    // Restore
    renderer.autoClear = savedAutoClear;
    renderer.setClearColor(savedClearColor, savedClearAlpha);
    renderer.setRenderTarget(savedRenderTarget);
  }, 1);

  return null;
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
      <FluidRenderer simRef={simRef} glassGroupRef={groupRef} />
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

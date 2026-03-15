"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
const PARTICLE_SPHERE_RADIUS = 0.13;

const GLASS_CONFIG: GlassConfig = {
  radiusTop: INNER_RADIUS_TOP,
  radiusBottom: INNER_RADIUS_BOTTOM,
  height: GLASS_HEIGHT,
  wallMargin: 0.02,
};

// Fluid rendering constants
const BLUR_ITERATIONS = 4;
const BLUR_KERNEL_SIZE = 20.0;
const BLUR_DEPTH_FALLOFF = 8.0;
const POINT_SCALE_FACTOR = 1.8;

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

// ── Puddle (grows as water escapes) ────────────────────────────────────────────
function Puddle({ simRef }: { simRef: React.RefObject<SPHSimulation | null> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const puddleSize = useRef(0);

  useFrame((_, dt) => {
    if (!meshRef.current || !simRef.current) return;
    const escaped = simRef.current.getEscapedParticles();
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

// ═══════════════════════════════════════════════════════════════════════════════
// ── GLSL Shaders ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Pass 1: Particle depth (sphere impostor point sprites) ──────────────────
const particleDepthVertex = /* glsl */ `
  uniform float uPointScale;
  uniform float uRadius;
  varying vec3 vViewPos;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
    // Perspective-correct point size
    gl_PointSize = uRadius * uPointScale / (-mvPos.z);
  }
`;

const particleDepthFragment = /* glsl */ `
  uniform float uRadius;
  uniform float uNear;
  uniform float uFar;
  varying vec3 vViewPos;

  void main() {
    // Point sprite UV: map gl_PointCoord to [-1, 1]
    vec2 coord = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(coord, coord);
    if (r2 > 1.0) discard;

    // Sphere impostor: compute depth offset
    float z_offset = sqrt(1.0 - r2) * uRadius;
    float viewZ = vViewPos.z + z_offset; // view space z (negative)

    // Linearize depth to [0, 1] in view space distance
    float linearDepth = (-vViewPos.z - z_offset - uNear) / (uFar - uNear);
    linearDepth = clamp(linearDepth, 0.0, 1.0);

    gl_FragColor = vec4(linearDepth, linearDepth, linearDepth, 1.0);
  }
`;

// ── Pass 2: Bilateral Gaussian blur ─────────────────────────────────────────
const bilateralBlurVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const bilateralBlurFragment = /* glsl */ `
  uniform sampler2D uDepthTex;
  uniform vec2 uTexelSize;
  uniform vec2 uDirection;
  uniform float uKernelSize;
  uniform float uDepthFalloff;

  varying vec2 vUv;

  void main() {
    float centerDepth = texture2D(uDepthTex, vUv).r;

    // If no particle here (depth ~0 or ~1), pass through
    if (centerDepth < 0.001 || centerDepth > 0.999) {
      gl_FragColor = vec4(centerDepth, 0.0, 0.0, 1.0);
      return;
    }

    float sigma = uKernelSize * 0.33;
    float sigmaDepth = 1.0 / uDepthFalloff;

    float totalWeight = 0.0;
    float totalDepth = 0.0;

    int halfSize = int(uKernelSize * 0.5);

    for (int i = -50; i <= 50; i++) {
      if (i < -halfSize || i > halfSize) continue;

      vec2 sampleUv = vUv + uDirection * uTexelSize * float(i);
      float sampleDepth = texture2D(uDepthTex, sampleUv).r;

      // Skip empty pixels
      if (sampleDepth < 0.001 || sampleDepth > 0.999) continue;

      float spatialW = exp(-float(i * i) / (2.0 * sigma * sigma));
      float depthDiff = centerDepth - sampleDepth;
      float depthW = exp(-depthDiff * depthDiff * sigmaDepth * sigmaDepth * 0.5);

      float w = spatialW * depthW;
      totalWeight += w;
      totalDepth += sampleDepth * w;
    }

    float result = totalWeight > 0.0 ? totalDepth / totalWeight : centerDepth;
    gl_FragColor = vec4(result, 0.0, 0.0, 1.0);
  }
`;

// ── Pass 3: Composite (normal reconstruction + water shading) ───────────────
const compositeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const compositeFragment = /* glsl */ `
  uniform sampler2D uSmoothedDepth;
  uniform sampler2D uSceneTex;
  uniform vec2 uTexelSize;
  uniform float uNear;
  uniform float uFar;
  uniform vec3 uLightDir;
  uniform vec3 uCameraPos;
  uniform mat4 uInvProjection;

  varying vec2 vUv;

  vec3 viewPosFromDepth(vec2 uv, float linearDepth) {
    float viewZ = -(uNear + linearDepth * (uFar - uNear));
    vec4 clipPos = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    vec4 viewPos = uInvProjection * clipPos;
    viewPos.xyz /= viewPos.w;
    // Scale to actual depth
    viewPos.xyz *= viewZ / viewPos.z;
    return viewPos.xyz;
  }

  void main() {
    float depth = texture2D(uSmoothedDepth, vUv).r;
    vec4 sceneColor = texture2D(uSceneTex, vUv);

    // No fluid here — show scene
    if (depth < 0.001 || depth > 0.999) {
      gl_FragColor = sceneColor;
      return;
    }

    // ── Reconstruct normals from smoothed depth ──
    float dL = texture2D(uSmoothedDepth, vUv - vec2(uTexelSize.x, 0.0)).r;
    float dR = texture2D(uSmoothedDepth, vUv + vec2(uTexelSize.x, 0.0)).r;
    float dB = texture2D(uSmoothedDepth, vUv - vec2(0.0, uTexelSize.y)).r;
    float dT = texture2D(uSmoothedDepth, vUv + vec2(0.0, uTexelSize.y)).r;

    // Handle edges (where neighbors are empty)
    float dzdx = 0.0;
    float dzdy = 0.0;

    if (dL > 0.001 && dL < 0.999 && dR > 0.001 && dR < 0.999) {
      dzdx = (dR - dL) * 0.5;
    } else if (dR > 0.001 && dR < 0.999) {
      dzdx = dR - depth;
    } else if (dL > 0.001 && dL < 0.999) {
      dzdx = depth - dL;
    }

    if (dB > 0.001 && dB < 0.999 && dT > 0.001 && dT < 0.999) {
      dzdy = (dT - dB) * 0.5;
    } else if (dT > 0.001 && dT < 0.999) {
      dzdy = dT - depth;
    } else if (dB > 0.001 && dB < 0.999) {
      dzdy = depth - dB;
    }

    // Scale derivatives to view space
    float depthRange = uFar - uNear;
    vec3 normal = normalize(vec3(
      -dzdx * depthRange / uTexelSize.x,
      -dzdy * depthRange / uTexelSize.y,
      1.0
    ));

    // Flip normal to face camera (view space: camera looks along -z)
    // Normal is in screen space, convert to a reasonable world-ish space
    // For shading, we treat the normal as roughly view-aligned

    // ── View direction ──
    vec3 viewPos = viewPosFromDepth(vUv, depth);
    vec3 viewDir = normalize(-viewPos);

    // ── Water shading ──

    // Base water color with depth-dependent absorption
    vec3 shallowColor = vec3(0.15, 0.55, 0.85);
    vec3 deepColor = vec3(0.03, 0.12, 0.3);
    float depthFactor = smoothstep(0.0, 0.5, depth);
    vec3 waterColor = mix(shallowColor, deepColor, depthFactor);

    // Fresnel effect (Schlick approximation)
    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);

    // Specular highlight (Blinn-Phong)
    vec3 lightDir = normalize(uLightDir);
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfVec), 0.0);
    float specular = pow(NdotH, 128.0) * 1.2;

    // Secondary specular from other light angle
    vec3 lightDir2 = normalize(vec3(-0.5, 0.8, 0.5));
    vec3 halfVec2 = normalize(lightDir2 + viewDir);
    float NdotH2 = max(dot(normal, halfVec2), 0.0);
    float specular2 = pow(NdotH2, 64.0) * 0.4;

    // Diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    float diffuse = NdotL * 0.6 + 0.4; // with ambient

    // Environment reflection (simple sky gradient)
    vec3 reflectDir = reflect(-viewDir, normal);
    float skyFactor = reflectDir.y * 0.5 + 0.5;
    vec3 envColor = mix(
      vec3(0.05, 0.1, 0.2),
      vec3(0.4, 0.6, 0.9),
      skyFactor
    );

    // Refraction: offset scene UV by surface normal for distortion
    vec2 refractionOffset = normal.xy * 0.03;
    vec4 refractedScene = texture2D(uSceneTex, vUv + refractionOffset);

    // Combine
    vec3 surfaceColor = waterColor * diffuse;
    surfaceColor += envColor * fresnel * 0.5;
    surfaceColor += vec3(1.0) * (specular + specular2);
    surfaceColor = mix(surfaceColor, refractedScene.rgb * vec3(0.7, 0.85, 1.0), 0.3 * (1.0 - fresnel));

    // Edge glow for fluid boundaries
    float edgeFactor = 1.0 - smoothstep(0.0, 0.02, min(
      min(abs(dL - depth), abs(dR - depth)),
      min(abs(dB - depth), abs(dT - depth))
    ));

    // Transparency at edges for smooth blending
    float alpha = smoothstep(0.001, 0.015, depth) * 0.92;
    alpha = mix(alpha, alpha * 0.7, edgeFactor * 0.3);

    // Final composite
    vec3 finalColor = mix(sceneColor.rgb, surfaceColor, alpha);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ── Fluid Renderer Component ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface FluidRendererProps {
  simRef: React.RefObject<SPHSimulation | null>;
  glassGroupRef: React.RefObject<THREE.Group | null>;
}

function FluidRenderer({ simRef, glassGroupRef }: FluidRendererProps) {
  const { gl, camera, scene, size } = useThree();

  // Refs for GPU resources
  const depthFboRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const blurFboARef = useRef<THREE.WebGLRenderTarget | null>(null);
  const blurFboBRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const sceneFboRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const particlePointsRef = useRef<THREE.Points | null>(null);
  const depthMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const blurMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const compositeMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  const particleSceneRef = useRef<THREE.Scene | null>(null);
  const fullscreenQuadRef = useRef<THREE.Mesh | null>(null);
  const positionsAttrRef = useRef<THREE.BufferAttribute | null>(null);

  // Create FBOs and GPU resources
  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * gl.getPixelRatio()));
    const h = Math.max(1, Math.floor(size.height * gl.getPixelRatio()));

    const fboOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    };

    depthFboRef.current = new THREE.WebGLRenderTarget(w, h, {
      ...fboOpts,
      depthBuffer: true,
    });
    blurFboARef.current = new THREE.WebGLRenderTarget(w, h, fboOpts);
    blurFboBRef.current = new THREE.WebGLRenderTarget(w, h, fboOpts);
    sceneFboRef.current = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });

    // ── Particle depth material ──
    depthMaterialRef.current = new THREE.ShaderMaterial({
      vertexShader: particleDepthVertex,
      fragmentShader: particleDepthFragment,
      uniforms: {
        uPointScale: { value: h * POINT_SCALE_FACTOR },
        uRadius: { value: PARTICLE_SPHERE_RADIUS },
        uNear: { value: (camera as THREE.PerspectiveCamera).near },
        uFar: { value: (camera as THREE.PerspectiveCamera).far },
      },
      depthTest: true,
      depthWrite: true,
      transparent: false,
    });

    // ── Particle Points geometry ──
    const posArray = new Float32Array(PARTICLE_COUNT * 2 * 3);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    positionsAttrRef.current = posAttr;

    const points = new THREE.Points(geo, depthMaterialRef.current);
    points.frustumCulled = false;
    particlePointsRef.current = points;

    // Separate scene for particles
    const pScene = new THREE.Scene();
    pScene.add(points);
    particleSceneRef.current = pScene;

    // ── Blur material ──
    blurMaterialRef.current = new THREE.ShaderMaterial({
      vertexShader: bilateralBlurVertex,
      fragmentShader: bilateralBlurFragment,
      uniforms: {
        uDepthTex: { value: null },
        uTexelSize: { value: new THREE.Vector2(1.0 / w, 1.0 / h) },
        uDirection: { value: new THREE.Vector2(1.0, 0.0) },
        uKernelSize: { value: BLUR_KERNEL_SIZE },
        uDepthFalloff: { value: BLUR_DEPTH_FALLOFF },
      },
      depthTest: false,
      depthWrite: false,
    });

    // ── Composite material ──
    compositeMaterialRef.current = new THREE.ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        uSmoothedDepth: { value: null },
        uSceneTex: { value: null },
        uTexelSize: { value: new THREE.Vector2(1.0 / w, 1.0 / h) },
        uNear: { value: (camera as THREE.PerspectiveCamera).near },
        uFar: { value: (camera as THREE.PerspectiveCamera).far },
        uLightDir: { value: new THREE.Vector3(4, 8, 3).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
        uInvProjection: { value: new THREE.Matrix4() },
      },
      depthTest: false,
      depthWrite: false,
    });

    // ── Fullscreen quad ──
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeo, blurMaterialRef.current);
    quad.frustumCulled = false;
    fullscreenQuadRef.current = quad;

    return () => {
      depthFboRef.current?.dispose();
      blurFboARef.current?.dispose();
      blurFboBRef.current?.dispose();
      sceneFboRef.current?.dispose();
      depthMaterialRef.current?.dispose();
      blurMaterialRef.current?.dispose();
      compositeMaterialRef.current?.dispose();
      geo.dispose();
      quadGeo.dispose();
      depthFboRef.current = null;
      blurFboARef.current = null;
      blurFboBRef.current = null;
      sceneFboRef.current = null;
    };
  }, [gl, camera, size]);

  // Resize FBOs when size changes
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const resizeFBOs = useCallback(() => {
    const w = Math.max(1, Math.floor(size.width * gl.getPixelRatio()));
    const h = Math.max(1, Math.floor(size.height * gl.getPixelRatio()));
    if (w === lastSizeRef.current.w && h === lastSizeRef.current.h) return;
    lastSizeRef.current = { w, h };

    depthFboRef.current?.setSize(w, h);
    blurFboARef.current?.setSize(w, h);
    blurFboBRef.current?.setSize(w, h);
    sceneFboRef.current?.setSize(w, h);

    if (blurMaterialRef.current) {
      blurMaterialRef.current.uniforms.uTexelSize.value.set(1.0 / w, 1.0 / h);
    }
    if (compositeMaterialRef.current) {
      compositeMaterialRef.current.uniforms.uTexelSize.value.set(1.0 / w, 1.0 / h);
    }
    if (depthMaterialRef.current) {
      depthMaterialRef.current.uniforms.uPointScale.value = h * POINT_SCALE_FACTOR;
    }
  }, [gl, size]);

  // Fullscreen render helper scene + camera
  const orthoSceneRef = useRef<THREE.Scene | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);

  useEffect(() => {
    orthoSceneRef.current = new THREE.Scene();
    orthoCameraRef.current = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }, []);

  useFrame((state) => {
    const sim = simRef.current;
    if (
      !sim ||
      !depthFboRef.current ||
      !blurFboARef.current ||
      !blurFboBRef.current ||
      !sceneFboRef.current ||
      !depthMaterialRef.current ||
      !blurMaterialRef.current ||
      !compositeMaterialRef.current ||
      !particlePointsRef.current ||
      !particleSceneRef.current ||
      !fullscreenQuadRef.current ||
      !positionsAttrRef.current ||
      !orthoSceneRef.current ||
      !orthoCameraRef.current
    ) return;

    const renderer = state.gl;

    resizeFBOs();

    // ── Update particle positions ──
    const posAttr = positionsAttrRef.current;
    const posArray = posAttr.array as Float32Array;

    // Contained particles: transform to world space using glass group matrix
    const containedPositions = sim.getContainedPositions();
    const containedCount = sim.getContainedCount();
    const glassGroup = glassGroupRef.current;
    const glassMatrix = glassGroup
      ? glassGroup.matrixWorld
      : new THREE.Matrix4();

    const tempVec = new THREE.Vector3();
    let totalCount = 0;

    for (let i = 0; i < containedCount; i++) {
      tempVec.set(
        containedPositions[i * 3],
        containedPositions[i * 3 + 1],
        containedPositions[i * 3 + 2],
      );
      tempVec.applyMatrix4(glassMatrix);
      posArray[totalCount * 3] = tempVec.x;
      posArray[totalCount * 3 + 1] = tempVec.y;
      posArray[totalCount * 3 + 2] = tempVec.z;
      totalCount++;
    }

    // Escaped particles (already in world space)
    const escaped = sim.getEscapedParticles();
    for (let i = 0; i < escaped.length; i++) {
      const p = escaped[i];
      posArray[totalCount * 3] = p.x;
      posArray[totalCount * 3 + 1] = p.y;
      posArray[totalCount * 3 + 2] = p.z;
      totalCount++;
    }

    // Hide remaining
    for (let i = totalCount; i < PARTICLE_COUNT * 2; i++) {
      posArray[i * 3] = 0;
      posArray[i * 3 + 1] = -100;
      posArray[i * 3 + 2] = 0;
    }

    posAttr.needsUpdate = true;
    particlePointsRef.current.geometry.setDrawRange(0, totalCount);

    // Update depth material uniforms
    const cam = camera as THREE.PerspectiveCamera;
    depthMaterialRef.current.uniforms.uNear.value = cam.near;
    depthMaterialRef.current.uniforms.uFar.value = cam.far;

    // Save renderer state
    const origAutoClear = renderer.autoClear;
    const origRenderTarget = renderer.getRenderTarget();
    const origClearColor = renderer.getClearColor(new THREE.Color());
    const origClearAlpha = renderer.getClearAlpha();

    // ════════════════════════════════════════════════════════════════════════
    // PASS 0: Render scene to FBO (for later compositing)
    // ════════════════════════════════════════════════════════════════════════
    renderer.setRenderTarget(sceneFboRef.current);
    renderer.setClearColor(0x0b1118, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    // ════════════════════════════════════════════════════════════════════════
    // PASS 1: Render particles to depth FBO
    // ════════════════════════════════════════════════════════════════════════
    renderer.setRenderTarget(depthFboRef.current);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(particleSceneRef.current, camera);

    // ════════════════════════════════════════════════════════════════════════
    // PASS 2: Bilateral blur (ping-pong)
    // ════════════════════════════════════════════════════════════════════════
    const blurMat = blurMaterialRef.current;
    fullscreenQuadRef.current.material = blurMat;

    // Add quad to ortho scene for fullscreen rendering
    orthoSceneRef.current.children.length = 0;
    orthoSceneRef.current.add(fullscreenQuadRef.current);

    let readFbo = depthFboRef.current;
    let writeFboA = blurFboARef.current;
    let writeFboB = blurFboBRef.current;

    for (let iter = 0; iter < BLUR_ITERATIONS; iter++) {
      // Horizontal pass
      blurMat.uniforms.uDepthTex.value = readFbo.texture;
      blurMat.uniforms.uDirection.value.set(1.0, 0.0);
      renderer.setRenderTarget(writeFboA);
      renderer.clear(true, false, false);
      renderer.render(orthoSceneRef.current, orthoCameraRef.current);

      // Vertical pass
      blurMat.uniforms.uDepthTex.value = writeFboA.texture;
      blurMat.uniforms.uDirection.value.set(0.0, 1.0);
      renderer.setRenderTarget(writeFboB);
      renderer.clear(true, false, false);
      renderer.render(orthoSceneRef.current, orthoCameraRef.current);

      // For next iteration, read from writeFboB
      readFbo = writeFboB;
      // Swap write targets
      const tmp = writeFboA;
      writeFboA = writeFboB;
      writeFboB = tmp;
    }

    // The final smoothed depth is in readFbo (writeFboB after last swap)
    const smoothedDepthFbo = readFbo;

    // ════════════════════════════════════════════════════════════════════════
    // PASS 3: Composite
    // ════════════════════════════════════════════════════════════════════════
    const compMat = compositeMaterialRef.current;
    compMat.uniforms.uSmoothedDepth.value = smoothedDepthFbo.texture;
    compMat.uniforms.uSceneTex.value = sceneFboRef.current.texture;
    compMat.uniforms.uNear.value = cam.near;
    compMat.uniforms.uFar.value = cam.far;
    compMat.uniforms.uCameraPos.value.copy(camera.position);
    compMat.uniforms.uInvProjection.value.copy(cam.projectionMatrixInverse);

    fullscreenQuadRef.current.material = compMat;

    // Render composite to screen
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    renderer.render(orthoSceneRef.current, orthoCameraRef.current);

    // Restore state
    renderer.autoClear = origAutoClear;
    renderer.setRenderTarget(origRenderTarget);
    renderer.setClearColor(origClearColor, origClearAlpha);
  }, 1); // renderPriority 1: run after default (0) so sim is updated

  return null;
}

// ── Glass Assembly ──────────────────────────────────────────────────────────────
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

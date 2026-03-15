import {
  poly6,
  spikyGrad,
  viscLaplacian,
  SMOOTHING_RADIUS,
  PARTICLE_MASS,
  REST_DENSITY,
  GAS_CONSTANT,
  VISCOSITY,
  GRAVITY_MAG,
  SUBSTEPS,
  BOUNDARY_DAMPING,
} from "./sph-kernels";
import type { Vec3 } from "./sph-kernels";

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  density: number;
  pressure: number;
  fx: number;
  fy: number;
  fz: number;
  escaped: boolean;
}

export interface GlassConfig {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  wallMargin: number;
}

function makeParticle(x: number, y: number, z: number): Particle {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    density: 0,
    pressure: 0,
    fx: 0,
    fy: 0,
    fz: 0,
    escaped: false,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SPHSimulation {
  particles: Particle[];
  spatialMap: Map<number, number[]> = new Map();
  glass: GlassConfig;
  gravityDir: Vec3 = { x: 0, y: -1, z: 0 };
  // Glass world matrix elements (column-major 4x4) for escape transformation
  glassMatrix: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  positionsBuffer: Float32Array;

  constructor(count: number, glass: GlassConfig) {
    this.glass = glass;
    this.particles = [];
    this.positionsBuffer = new Float32Array(count * 3);
    this.initParticles(count);
  }

  initParticles(count: number) {
    this.particles = [];
    const g = this.glass;
    const fillHeight = g.height * 0.65; // fill 65% of glass height
    const startY = -g.height / 2 + g.wallMargin;

    // Compute spacing from smoothing radius
    const spacing = SMOOTHING_RADIUS * 0.55;
    let placed = 0;

    for (let layer = 0; placed < count; layer++) {
      const y = startY + layer * spacing;
      if (y > startY + fillHeight) break;

      const t = (y + g.height / 2) / g.height;
      const innerR = lerp(g.radiusBottom, g.radiusTop, t) - g.wallMargin;
      if (innerR <= 0) continue;

      // Fill concentric rings at this height
      for (let ring = 0; ring * spacing < innerR && placed < count; ring++) {
        const r = ring * spacing;
        if (r === 0) {
          // Center particle
          this.particles.push(makeParticle(0, y, 0));
          placed++;
          continue;
        }
        const circumference = 2 * Math.PI * r;
        const numOnRing = Math.max(1, Math.floor(circumference / spacing));
        for (let k = 0; k < numOnRing && placed < count; k++) {
          const angle = (k / numOnRing) * Math.PI * 2 + layer * 0.3; // offset per layer
          const px = Math.cos(angle) * r;
          const pz = Math.sin(angle) * r;
          this.particles.push(makeParticle(px, y, pz));
          placed++;
        }
      }
    }

    // If we haven't placed enough, fill remaining at top of water
    while (this.particles.length < count) {
      const y = startY + fillHeight * 0.9;
      const t = (y + g.height / 2) / g.height;
      const innerR = lerp(g.radiusBottom, g.radiusTop, t) - g.wallMargin;
      const idx = this.particles.length;
      // Deterministic pseudo-random placement
      const a = ((idx * 2654435761) >>> 0) / 4294967296;
      const b = ((idx * 1013904223) >>> 0) / 4294967296;
      const r2 = Math.sqrt(a) * innerR * 0.9;
      const angle2 = b * Math.PI * 2;
      this.particles.push(
        makeParticle(Math.cos(angle2) * r2, y, Math.sin(angle2) * r2),
      );
    }

    if (this.positionsBuffer.length !== count * 3) {
      this.positionsBuffer = new Float32Array(count * 3);
    }
  }

  // Spatial hash
  private hashPos(x: number, y: number, z: number): number {
    const inv = 1 / SMOOTHING_RADIUS;
    const ix = Math.floor(x * inv);
    const iy = Math.floor(y * inv);
    const iz = Math.floor(z * inv);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & 0x7fffffff;
  }

  buildSpatialHash() {
    this.spatialMap.clear();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.escaped) continue;
      const key = this.hashPos(p.x, p.y, p.z);
      let bucket = this.spatialMap.get(key);
      if (!bucket) {
        bucket = [];
        this.spatialMap.set(key, bucket);
      }
      bucket.push(i);
    }
  }

  private forEachNeighbor(i: number, callback: (j: number) => void) {
    const p = this.particles[i];
    const inv = 1 / SMOOTHING_RADIUS;
    const cx = Math.floor(p.x * inv);
    const cy = Math.floor(p.y * inv);
    const cz = Math.floor(p.z * inv);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key =
            (((cx + dx) * 73856093) ^
              ((cy + dy) * 19349663) ^
              ((cz + dz) * 83492791)) &
            0x7fffffff;
          const bucket = this.spatialMap.get(key);
          if (bucket) {
            for (let k = 0; k < bucket.length; k++) {
              callback(bucket[k]);
            }
          }
        }
      }
    }
  }

  computeDensityPressure() {
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      if (pi.escaped) continue;

      let density = 0;
      this.forEachNeighbor(i, (j) => {
        const pj = this.particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dz = pi.z - pj.z;
        const rSq = dx * dx + dy * dy + dz * dz;
        density += PARTICLE_MASS * poly6(rSq);
      });

      pi.density = Math.max(density, REST_DENSITY * 0.01); // prevent zero
      pi.pressure = GAS_CONSTANT * (pi.density - REST_DENSITY);
    }
  }

  computeForces() {
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      if (pi.escaped) continue;

      let fpx = 0,
        fpy = 0,
        fpz = 0; // pressure force
      let fvx = 0,
        fvy = 0,
        fvz = 0; // viscosity force

      this.forEachNeighbor(i, (j) => {
        if (i === j) return;
        const pj = this.particles[j];
        if (pj.escaped) return;

        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dz = pi.z - pj.z;
        const rSq = dx * dx + dy * dy + dz * dz;
        const r = Math.sqrt(rSq);

        if (r < SMOOTHING_RADIUS && r > 1e-6) {
          const dirX = dx / r;
          const dirY = dy / r;
          const dirZ = dz / r;

          // Pressure force (symmetric)
          const pressureMag =
            ((-PARTICLE_MASS * (pi.pressure + pj.pressure)) /
              (2 * pj.density)) *
            spikyGrad(r);
          fpx += pressureMag * dirX;
          fpy += pressureMag * dirY;
          fpz += pressureMag * dirZ;

          // Viscosity force
          const viscMag =
            ((VISCOSITY * PARTICLE_MASS) / pj.density) * viscLaplacian(r);
          fvx += viscMag * (pj.vx - pi.vx);
          fvy += viscMag * (pj.vy - pi.vy);
          fvz += viscMag * (pj.vz - pi.vz);
        }
      });

      // Gravity in glass-local space
      const grav = this.gravityDir;
      pi.fx = fpx + fvx + pi.density * grav.x * GRAVITY_MAG;
      pi.fy = fpy + fvy + pi.density * grav.y * GRAVITY_MAG;
      pi.fz = fpz + fvz + pi.density * grav.z * GRAVITY_MAG;
    }
  }

  integrate(dt: number) {
    const g = this.glass;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.escaped) continue;

      // Acceleration = force / density
      const ax = p.fx / p.density;
      const ay = p.fy / p.density;
      const az = p.fz / p.density;

      p.vx += ax * dt;
      p.vy += ay * dt;
      p.vz += az * dt;

      // Velocity damping for stability
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      if (speed > 5) {
        const s = 5 / speed;
        p.vx *= s;
        p.vy *= s;
        p.vz *= s;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Boundary enforcement: truncated cone
      const halfH = g.height / 2;

      // Bottom
      const minY = -halfH + g.wallMargin;
      if (p.y < minY) {
        p.y = minY;
        p.vy *= -BOUNDARY_DAMPING;
      }

      // Radial wall (truncated cone)
      const t = Math.max(0, Math.min(1, (p.y + halfH) / g.height));
      const innerR = lerp(g.radiusBottom, g.radiusTop, t) - g.wallMargin;
      const distXZ = Math.sqrt(p.x * p.x + p.z * p.z);

      if (distXZ > innerR && distXZ > 0.001) {
        // Push inward
        const scale = (innerR * 0.99) / distXZ;
        p.x *= scale;
        p.z *= scale;
        // Reflect radial velocity
        const nx = p.x / distXZ;
        const nz = p.z / distXZ;
        const vn = p.vx * nx + p.vz * nz;
        if (vn > 0) {
          p.vx -= (1 + BOUNDARY_DAMPING) * vn * nx;
          p.vz -= (1 + BOUNDARY_DAMPING) * vn * nz;
        }
      }

      // Top / Escape detection
      if (p.y >= halfH - g.wallMargin) {
        // Check if near the rim edge (radial position > 70% of rim radius)
        const rimR = g.radiusTop - g.wallMargin;
        if (distXZ > rimR * 0.6) {
          // Escape! Transform position to world space
          p.escaped = true;
          const m = this.glassMatrix;
          const lx = p.x,
            ly = p.y,
            lz = p.z;
          p.x = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
          p.y = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
          p.z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
          // Transform velocity
          const lvx = p.vx,
            lvy = p.vy,
            lvz = p.vz;
          p.vx = m[0] * lvx + m[4] * lvy + m[8] * lvz;
          p.vy = m[1] * lvx + m[5] * lvy + m[9] * lvz;
          p.vz = m[2] * lvx + m[6] * lvy + m[10] * lvz;
        } else {
          // Cap at top (inside glass)
          p.y = halfH - g.wallMargin;
          p.vy *= -BOUNDARY_DAMPING;
        }
      }
    }
  }

  updateEscapedParticles(dt: number) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.escaped) continue;

      // World-space gravity
      p.vy -= GRAVITY_MAG * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Ground bounce
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.15;
        p.vx *= 0.85;
        p.vz *= 0.85;
      }

      // Remove if too far
      if (p.y < -5 || Math.abs(p.x) > 15 || Math.abs(p.z) > 15) {
        // Reset to inactive position
        p.x = 0;
        p.y = -100;
        p.z = 0;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
      }
    }
  }

  step() {
    const dt = 1 / 60 / SUBSTEPS;
    this.buildSpatialHash();
    this.computeDensityPressure();
    this.computeForces();
    this.integrate(dt);
    this.updateEscapedParticles(dt);
  }

  update() {
    for (let i = 0; i < SUBSTEPS; i++) {
      this.step();
    }
  }

  setGravityDir(x: number, y: number, z: number) {
    this.gravityDir = { x, y, z };
  }

  setGlassWorldMatrix(elements: ArrayLike<number>) {
    for (let i = 0; i < 16; i++) this.glassMatrix[i] = elements[i];
  }

  getContainedPositions(): Float32Array {
    // Returns positions of non-escaped particles in LOCAL (glass) space
    let idx = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.escaped) {
        this.positionsBuffer[idx++] = p.x;
        this.positionsBuffer[idx++] = p.y;
        this.positionsBuffer[idx++] = p.z;
      }
    }
    return this.positionsBuffer;
  }

  getEscapedParticles(): Particle[] {
    return this.particles.filter((p) => p.escaped && p.y > -50);
  }

  getContainedCount(): number {
    let count = 0;
    for (let i = 0; i < this.particles.length; i++) {
      if (!this.particles[i].escaped) count++;
    }
    return count;
  }

  reset() {
    this.initParticles(this.particles.length);
  }
}

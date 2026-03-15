// Vec3 operations
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function vec3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vec3LenSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}
export function vec3Len(a: Vec3): number {
  return Math.sqrt(vec3LenSq(a));
}

// SPH Constants
export const SMOOTHING_RADIUS = 0.12;
export const PARTICLE_MASS = 0.002;
export const REST_DENSITY = 1000;
export const GAS_CONSTANT = 200;
export const VISCOSITY = 0.8;
export const GRAVITY_MAG = 9.8;
export const SUBSTEPS = 2;
export const BOUNDARY_DAMPING = 0.3;

// Precomputed kernel coefficients
const H = SMOOTHING_RADIUS;
const H2 = H * H;
const H6 = H2 * H2 * H2;
const H9 = H6 * H2 * H;
const PI = Math.PI;

const POLY6_COEFF = 315 / (64 * PI * H9);
const SPIKY_GRAD_COEFF = -45 / (PI * H6);
const VISC_LAP_COEFF = 45 / (PI * H6);

// Poly6 kernel (for density) — takes SQUARED distance
export function poly6(rSq: number): number {
  if (rSq >= H2) return 0;
  const diff = H2 - rSq;
  return POLY6_COEFF * diff * diff * diff;
}

// Spiky gradient magnitude (for pressure) — takes distance
export function spikyGrad(r: number): number {
  if (r >= H || r < 1e-6) return 0;
  const diff = H - r;
  return SPIKY_GRAD_COEFF * diff * diff;
}

// Viscosity Laplacian (for viscosity) — takes distance
export function viscLaplacian(r: number): number {
  if (r >= H) return 0;
  return VISC_LAP_COEFF * (H - r);
}

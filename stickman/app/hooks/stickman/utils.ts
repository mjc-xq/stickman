import type { PointerState } from "./types";

export function dtSmooth(
  current: number,
  target: number,
  factor: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.pow(1 - factor, dt * 60));
}

export function pointerToScreen(
  pointer: PointerState,
  width: number,
  height: number,
  scale: number = 0.45,
): { x: number; y: number } {
  return {
    x: width / 2 + pointer.x * width * scale,
    y: height / 2 + pointer.y * height * scale,
  };
}

export const DEFAULTS = {
  smoothing: 0.18,
  gravityLp: 0.08,
  posTrack: 0.25,
  joltGain: 0.03,
  joltDead: 0.12,
  joltDecay: 0.85,
  clamp: 2,
  receivingTimeoutMs: 3000,
  gesturesClearMs: 2000,
  tossResetMs: 3000,
} as const;

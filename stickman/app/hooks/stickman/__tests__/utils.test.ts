import { describe, it, expect } from "vitest";
import { dtSmooth, pointerToScreen, DEFAULTS } from "../utils";

describe("dtSmooth", () => {
  it("returns target when factor is 1 and dt is 1/60", () => {
    expect(dtSmooth(0, 10, 1, 1 / 60)).toBeCloseTo(10, 1);
  });

  it("returns current when factor is 0", () => {
    expect(dtSmooth(5, 10, 0, 1 / 60)).toBeCloseTo(5, 5);
  });

  it("moves partway toward target at default smoothing", () => {
    const result = dtSmooth(0, 1, DEFAULTS.smoothing, 1 / 60);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(result).toBeCloseTo(0.18, 1);
  });

  it("produces same result at 60fps and 120fps over same real time", () => {
    const oneFrame60 = dtSmooth(0, 1, 0.18, 1 / 60);
    const frame1 = dtSmooth(0, 1, 0.18, 1 / 120);
    const frame2 = dtSmooth(frame1, 1, 0.18, 1 / 120);
    expect(frame2).toBeCloseTo(oneFrame60, 2);
  });
});

describe("pointerToScreen", () => {
  it("maps origin to center of screen", () => {
    const result = pointerToScreen({ x: 0, y: 0, vx: 0, vy: 0 }, 800, 600);
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });

  it("maps +1 to 45% right/below center", () => {
    const result = pointerToScreen({ x: 1, y: 1, vx: 0, vy: 0 }, 800, 600);
    expect(result.x).toBe(400 + 800 * 0.45);
    expect(result.y).toBe(300 + 600 * 0.45);
  });

  it("respects custom scale", () => {
    const result = pointerToScreen({ x: 1, y: 0, vx: 0, vy: 0 }, 100, 100, 0.5);
    expect(result.x).toBe(50 + 100 * 0.5);
  });
});

describe("DEFAULTS", () => {
  it("has all expected tuning constants", () => {
    expect(DEFAULTS.smoothing).toBe(0.18);
    expect(DEFAULTS.gravityLp).toBe(0.08);
    expect(DEFAULTS.posTrack).toBe(0.25);
    expect(DEFAULTS.joltGain).toBe(0.03);
    expect(DEFAULTS.joltDead).toBe(0.12);
    expect(DEFAULTS.joltDecay).toBe(0.85);
    expect(DEFAULTS.clamp).toBe(2);
  });
});

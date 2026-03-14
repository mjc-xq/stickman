# Event System & Pointer Abstraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract event processing and pointer detection from IMUVisualizer into a layered hook system with typed event bus, shared processing core, and per-concern hooks.

**Architecture:** Three-layer system: (1) Event bus provider subscribes to Ably, parses messages, dispatches via per-type Map. (2) Shared processing core runs a single rAF loop for smoothed IMU, gravity, and pointer — always warm. (3) Consumer hooks (usePointer, useOrientation, useButtons, useGestures, useToss, useDeviceMode, useRawIMU, useSmoothedIMU) provide clean APIs for visualizations. Two React contexts prevent re-render contamination.

**Tech Stack:** React 19, Next.js 16, TypeScript 5, Ably SDK, Vitest (new), @testing-library/react (new)

**Spec:** `docs/superpowers/specs/2026-03-14-event-system-design.md`

---

## Chunk 1: Foundation (Types + Utils + Test Setup)

### Task 1: Set up Vitest

**Files:**
- Create: `stickman/vitest.config.ts`
- Modify: `stickman/package.json`
- Modify: `stickman/tsconfig.json`

- [ ] **Step 1: Install vitest and testing deps**

```bash
cd stickman && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest config**

Create `stickman/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs (no tests yet)**

Run: `cd stickman && npm test`
Expected: vitest runs, finds no tests, exits cleanly.

- [ ] **Step 5: Commit**

```bash
git add stickman/vitest.config.ts stickman/package.json stickman/package-lock.json
git commit -m "build: add vitest test infrastructure"
```

---

### Task 2: Event Types

**Files:**
- Create: `stickman/app/hooks/stickman/types.ts`

- [ ] **Step 1: Create types file**

Create `stickman/app/hooks/stickman/types.ts` with the full discriminated union from the spec:

```typescript
// Device axes (M5StickC Plus 2, portrait, USB at bottom):
//   +X = right edge    (flat on back: ax ≈ 0)
//   +Y = toward USB    (flat on back: ay ≈ 0)
//   +Z = out of screen (flat on back: az ≈ +1g)
// Accelerometer reads reaction force — axis pointing up reads +1g at rest.

export interface IMURawEvent {
  type: "imu";
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  p: number; r: number;
  t: number;
}

export interface ButtonEvent {
  type: "btn";
  button: "A" | "B";
  state: "down" | "up";
}

export interface GestureEvent {
  type: "gesture";
  gesture: "Circle Left" | "Circle Right" | "Tap" | "Thrust";
}

export interface TossAirborneEvent {
  type: "toss";
  state: "airborne";
  launchG: number;
}

export interface TossLandedEvent {
  type: "toss";
  state: "landed";
  heightIn: number;
  heightM: number;
  freefallMs: number;
}

export interface TossLostEvent {
  type: "toss";
  state: "lost";
}

export type TossEvent = TossAirborneEvent | TossLandedEvent | TossLostEvent;

export interface ModeEvent {
  type: "mode";
  mode: "wand" | "toss" | "debug";
}

export type StickmanEvent =
  | IMURawEvent
  | ButtonEvent
  | GestureEvent
  | TossEvent
  | ModeEvent;

export interface PointerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GravityState {
  x: number;
  y: number;
  z: number;
  tiltMag: number;
  angle: number;
}

export interface SmoothedIMUState {
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  p: number; r: number;
}

export interface OrientationState {
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  tiltMag: number;
  angle: number;
  pitch: number;
  roll: number;
}

export type TossPhase = "idle" | "airborne" | "landed" | "lost";
```

- [ ] **Step 2: Verify types compile**

Run: `cd stickman && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add stickman/app/hooks/stickman/types.ts
git commit -m "feat(hooks): add stickman event type definitions"
```

---

### Task 3: Utility Functions

**Files:**
- Create: `stickman/app/hooks/stickman/utils.ts`
- Create: `stickman/app/hooks/stickman/__tests__/utils.test.ts`

- [ ] **Step 1: Write failing tests for utils**

Create `stickman/app/hooks/stickman/__tests__/utils.test.ts`:

```typescript
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
    // 1 frame at 60fps
    const oneFrame60 = dtSmooth(0, 1, 0.18, 1 / 60);
    // 2 frames at 120fps
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd stickman && npx vitest run app/hooks/stickman/__tests__/utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement utils**

Create `stickman/app/hooks/stickman/utils.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd stickman && npx vitest run app/hooks/stickman/__tests__/utils.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add stickman/app/hooks/stickman/utils.ts stickman/app/hooks/stickman/__tests__/utils.test.ts
git commit -m "feat(hooks): add dtSmooth, pointerToScreen utilities with tests"
```

---

## Chunk 2: Event Bus (StickmanProvider)

### Task 4: StickmanProvider — Event Bus + Shared Processing Core

This is the largest single task. It creates the provider with:
- Ably channel subscription for all event types
- Per-type dispatch Map
- Shared rAF loop (smoothed IMU + gravity + pointer)
- Two contexts (bus + status)
- Receiving timeout
- Background tab handling + visibility optimization

**Files:**
- Create: `stickman/app/hooks/stickman/StickmanProvider.tsx`
- Create: `stickman/app/hooks/stickman/useStickmanBus.ts`
- Create: `stickman/app/hooks/stickman/useStickmanStatus.ts`

- [ ] **Step 1: Create the bus context hook**

Create `stickman/app/hooks/stickman/useStickmanBus.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";
import type { StickmanEvent, PointerState, GravityState, SmoothedIMUState } from "./types";

export interface StickmanBus {
  subscribe: (handler: (event: StickmanEvent) => void) => () => void;
  subscribeType: <T extends StickmanEvent["type"]>(
    type: T,
    handler: (event: Extract<StickmanEvent, { type: T }>) => void,
  ) => () => void;
  sharedPointer: React.RefObject<PointerState>;
  sharedGravity: React.RefObject<GravityState>;
  sharedSmoothedIMU: React.RefObject<SmoothedIMUState>;
}

export const StickmanBusContext = createContext<StickmanBus | null>(null);

export function useStickmanBus(): StickmanBus {
  const ctx = useContext(StickmanBusContext);
  if (!ctx) throw new Error("useStickmanBus must be used within StickmanProvider");
  return ctx;
}
```

- [ ] **Step 2: Create the status context hook**

Create `stickman/app/hooks/stickman/useStickmanStatus.ts`:

```typescript
"use client";

import { createContext, useContext } from "react";

export interface StickmanStatus {
  connected: boolean;
  connectionState: string;
  receiving: boolean;
  presenceCount: number;
}

export const StickmanStatusContext = createContext<StickmanStatus>({
  connected: false,
  connectionState: "disconnected",
  receiving: false,
  presenceCount: 0,
});

export function useStickmanStatus(): StickmanStatus {
  return useContext(StickmanStatusContext);
}
```

- [ ] **Step 3: Create StickmanProvider**

Create `stickman/app/hooks/stickman/StickmanProvider.tsx`. This is the core component:

```typescript
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChannel, usePresenceListener, useConnectionStateListener } from "ably/react";
import { StickmanBusContext, type StickmanBus } from "./useStickmanBus";
import { StickmanStatusContext, type StickmanStatus } from "./useStickmanStatus";
import type { StickmanEvent, PointerState, GravityState, SmoothedIMUState, IMURawEvent } from "./types";
import { dtSmooth, DEFAULTS } from "./utils";

type Handler = (event: StickmanEvent) => void;
type TypedHandler = (event: never) => void;

const EVENT_NAMES = ["imu", "btn", "gesture", "toss", "mode"] as const;

function parseEvent(name: string, data: unknown): StickmanEvent | null {
  try {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    if (!parsed || typeof parsed !== "object") return null;
    if (!EVENT_NAMES.includes(name as (typeof EVENT_NAMES)[number])) return null;
    return { ...parsed, type: name } as StickmanEvent;
  } catch {
    return null;
  }
}

export function StickmanProvider({ children }: { children: ReactNode }) {
  // --- Subscriber registry (per-type Map + all-events Set) ---
  const allHandlers = useRef(new Set<Handler>());
  const typedHandlers = useRef(new Map<string, Set<TypedHandler>>());

  const subscribe = useCallback((handler: Handler) => {
    allHandlers.current.add(handler);
    return () => { allHandlers.current.delete(handler); };
  }, []);

  const subscribeType = useCallback(<T extends StickmanEvent["type"]>(
    type: T,
    handler: (event: Extract<StickmanEvent, { type: T }>) => void,
  ) => {
    if (!typedHandlers.current.has(type)) {
      typedHandlers.current.set(type, new Set());
    }
    const set = typedHandlers.current.get(type)!;
    set.add(handler as TypedHandler);
    return () => { set.delete(handler as TypedHandler); };
  }, []);

  const dispatch = useCallback((event: StickmanEvent) => {
    // Copy sets before iteration for unsubscription safety
    for (const h of [...allHandlers.current]) h(event);
    const typed = typedHandlers.current.get(event.type);
    if (typed) {
      for (const h of [...typed]) (h as (event: StickmanEvent) => void)(event);
    }
  }, []);

  // --- Shared processing refs ---
  const target = useRef<IMURawEvent>({
    type: "imu", ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0,
  });
  const smooth = useRef<SmoothedIMUState>({
    ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0,
  });
  const gravity = useRef<GravityState>({ x: 0, y: 0, z: 1, tiltMag: 0, angle: 0 });
  const pointer = useRef<PointerState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const dotPos = useRef({ x: 0, y: 0 });
  const dotVel = useRef({ x: 0, y: 0 });
  const lastFrameTime = useRef(0);

  // --- Status state ---
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [receiving, setReceiving] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const receivingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Ably subscriptions ---
  useConnectionStateListener((stateChange) => {
    setConnectionState(stateChange.current);
    setConnected(stateChange.current === "connected");
  });

  useChannel("stickman", (message) => {
    const event = parseEvent(message.name ?? "", message.data);
    if (!event) return;

    if (event.type === "imu") {
      target.current = event;
    }

    // Dispatch to subscribers
    dispatch(event);

    // Update receiving status with timeout
    if (event.type === "imu") {
      if (!receiving) setReceiving(true);
      if (receivingTimer.current) clearTimeout(receivingTimer.current);
      receivingTimer.current = setTimeout(() => setReceiving(false), DEFAULTS.receivingTimeoutMs);
    }
  });

  const { presenceData } = usePresenceListener("stickman");
  useEffect(() => {
    setPresenceCount(presenceData.length);
  }, [presenceData]);

  // --- Shared rAF processing loop ---
  useEffect(() => {
    let animId: number;
    lastFrameTime.current = performance.now() / 1000;

    const tick = () => {
      const now = performance.now() / 1000;
      let dt = now - lastFrameTime.current;
      lastFrameTime.current = now;

      const t = target.current;
      const s = smooth.current;
      const g = gravity.current;
      const pos = dotPos.current;
      const vel = dotVel.current;

      // Background tab snap
      if (dt > 0.2) {
        s.ax = t.ax; s.ay = t.ay; s.az = t.az;
        s.gx = t.gx; s.gy = t.gy; s.gz = t.gz;
        s.p = t.p; s.r = t.r;
        g.x = t.ax; g.y = t.ay; g.z = t.az;
        vel.x = 0; vel.y = 0;
        dt = 1 / 60; // Use nominal dt for remaining calcs
      }

      // 1. Smooth raw IMU
      s.ax = dtSmooth(s.ax, t.ax, DEFAULTS.smoothing, dt);
      s.ay = dtSmooth(s.ay, t.ay, DEFAULTS.smoothing, dt);
      s.az = dtSmooth(s.az, t.az, DEFAULTS.smoothing, dt);
      s.gx = dtSmooth(s.gx, t.gx, DEFAULTS.smoothing, dt);
      s.gy = dtSmooth(s.gy, t.gy, DEFAULTS.smoothing, dt);
      s.gz = dtSmooth(s.gz, t.gz, DEFAULTS.smoothing, dt);
      s.p = dtSmooth(s.p, t.p, DEFAULTS.smoothing, dt);
      s.r = dtSmooth(s.r, t.r, DEFAULTS.smoothing, dt);

      // 2. Gravity estimate (slower LP)
      g.x = dtSmooth(g.x, s.ax, DEFAULTS.gravityLp, dt);
      g.y = dtSmooth(g.y, s.ay, DEFAULTS.gravityLp, dt);
      g.z = dtSmooth(g.z, s.az, DEFAULTS.gravityLp, dt);

      // 3. Normalize gravity
      const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1;
      const gnx = g.x / gMag;
      const gny = g.y / gMag;

      // Derived orientation values
      g.tiltMag = Math.sqrt(gnx * gnx + gny * gny);
      g.angle = Math.atan2(-gnx, gny) * (180 / Math.PI);

      // 4. Linear acceleration perpendicular to gravity
      const accelDotG = s.ax * gnx + s.ay * gny + s.az * (g.z / gMag);
      let linX = s.ax - accelDotG * gnx;
      let linY = s.ay - accelDotG * gny;
      const linMag = Math.sqrt(linX * linX + linY * linY);
      if (linMag < DEFAULTS.joltDead) { linX = 0; linY = 0; }

      // 5. Position tracks tilt
      const restX = -gnx;
      const restY = -gny;
      pos.x = dtSmooth(pos.x, restX, DEFAULTS.posTrack, dt);
      pos.y = dtSmooth(pos.y, restY, DEFAULTS.posTrack, dt);

      // 6. Jolt velocity (dt-scaled decay)
      const decayFactor = Math.pow(DEFAULTS.joltDecay, dt * 60);
      vel.x = vel.x * decayFactor - linX * DEFAULTS.joltGain * dt * 60;
      vel.y = vel.y * decayFactor - linY * DEFAULTS.joltGain * dt * 60;

      // 7. Final clamped pointer
      pointer.current = {
        x: Math.max(-DEFAULTS.clamp, Math.min(DEFAULTS.clamp, pos.x + vel.x)),
        y: Math.max(-DEFAULTS.clamp, Math.min(DEFAULTS.clamp, pos.y + vel.y)),
        vx: vel.x,
        vy: vel.y,
      };

      animId = requestAnimationFrame(tick);
    };

    // Visibility optimization
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        lastFrameTime.current = performance.now() / 1000;
        animId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener("visibilitychange", onVisibility);
      if (receivingTimer.current) clearTimeout(receivingTimer.current);
    };
  }, []);

  // --- Context values ---
  const busValue = useMemo<StickmanBus>(() => ({
    subscribe,
    subscribeType,
    sharedPointer: pointer,
    sharedGravity: gravity,
    sharedSmoothedIMU: smooth,
  }), [subscribe, subscribeType]);

  const statusValue = useMemo<StickmanStatus>(() => ({
    connected,
    connectionState,
    receiving,
    presenceCount,
  }), [connected, connectionState, receiving, presenceCount]);

  return (
    <StickmanBusContext.Provider value={busValue}>
      <StickmanStatusContext.Provider value={statusValue}>
        {children}
      </StickmanStatusContext.Provider>
    </StickmanBusContext.Provider>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add stickman/app/hooks/stickman/StickmanProvider.tsx stickman/app/hooks/stickman/useStickmanBus.ts stickman/app/hooks/stickman/useStickmanStatus.ts
git commit -m "feat(hooks): add StickmanProvider with event bus and shared processing core"
```

---

## Chunk 3: Consumer Hooks

### Task 5: usePointer

**Files:**
- Create: `stickman/app/hooks/stickman/usePointer.ts`

- [ ] **Step 1: Implement usePointer**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { PointerState, PointerConfig, IMURawEvent } from "./types";
import { dtSmooth, DEFAULTS } from "./utils";

// Re-export config type from types (add to types.ts)
export type { PointerConfig } from "./types";

export function usePointer(config?: PointerConfig): React.RefObject<PointerState> {
  const bus = useStickmanBus();

  // No config = return shared pointer (zero overhead)
  if (!config) return bus.sharedPointer;

  return useCustomPointer(bus, config);
}

function useCustomPointer(
  bus: ReturnType<typeof useStickmanBus>,
  config: PointerConfig,
): React.RefObject<PointerState> {
  const pointer = useRef<PointerState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const target = useRef<IMURawEvent | null>(null);
  const smooth = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const lastTime = useRef(0);

  const smoothing = config.smoothing ?? DEFAULTS.smoothing;
  const posTrack = config.posTrack ?? DEFAULTS.posTrack;
  const joltGain = config.joltGain ?? DEFAULTS.joltGain;
  const joltDead = config.joltDead ?? DEFAULTS.joltDead;
  const joltDecay = config.joltDecay ?? DEFAULTS.joltDecay;
  const clamp = config.clamp ?? DEFAULTS.clamp;
  const enabled = config.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const unsub = bus.subscribeType("imu", (event) => {
      target.current = event;
    });

    let animId: number;
    lastTime.current = performance.now() / 1000;

    const tick = () => {
      const now = performance.now() / 1000;
      let dt = now - lastTime.current;
      lastTime.current = now;

      if (dt > 0.2) {
        if (target.current) {
          smooth.current.ax = target.current.ax;
          smooth.current.ay = target.current.ay;
          smooth.current.az = target.current.az;
        }
        vel.current.x = 0;
        vel.current.y = 0;
        dt = 1 / 60;
      }

      const t = target.current;
      if (!t) { animId = requestAnimationFrame(tick); return; }

      const s = smooth.current;
      s.ax = dtSmooth(s.ax, t.ax, smoothing, dt);
      s.ay = dtSmooth(s.ay, t.ay, smoothing, dt);
      s.az = dtSmooth(s.az, t.az, smoothing, dt);

      // Use shared gravity for consistency
      const g = bus.sharedGravity.current;
      const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1;
      const gnx = g.x / gMag;
      const gny = g.y / gMag;

      const accelDotG = s.ax * gnx + s.ay * gny + s.az * (g.z / gMag);
      let linX = s.ax - accelDotG * gnx;
      let linY = s.ay - accelDotG * gny;
      if (Math.sqrt(linX * linX + linY * linY) < joltDead) { linX = 0; linY = 0; }

      const p = pos.current;
      const v = vel.current;
      p.x = dtSmooth(p.x, -gnx, posTrack, dt);
      p.y = dtSmooth(p.y, -gny, posTrack, dt);

      const decay = Math.pow(joltDecay, dt * 60);
      v.x = v.x * decay - linX * joltGain * dt * 60;
      v.y = v.y * decay - linY * joltGain * dt * 60;

      pointer.current = {
        x: Math.max(-clamp, Math.min(clamp, p.x + v.x)),
        y: Math.max(-clamp, Math.min(clamp, p.y + v.y)),
        vx: v.x,
        vy: v.y,
      };

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      unsub();
    };
  }, [bus, enabled, smoothing, posTrack, joltGain, joltDead, joltDecay, clamp]);

  return pointer;
}
```

Note: also add `PointerConfig` to `types.ts`:

```typescript
export interface PointerConfig {
  smoothing?: number;
  gravityLp?: number;
  posTrack?: number;
  joltGain?: number;
  joltDead?: number;
  joltDecay?: number;
  clamp?: number;
  enabled?: boolean;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/hooks/stickman/usePointer.ts stickman/app/hooks/stickman/types.ts
git commit -m "feat(hooks): add usePointer hook with shared default and custom config"
```

---

### Task 6: useOrientation + useSmoothedIMU + useRawIMU

**Files:**
- Create: `stickman/app/hooks/stickman/useOrientation.ts`
- Create: `stickman/app/hooks/stickman/useSmoothedIMU.ts`
- Create: `stickman/app/hooks/stickman/useRawIMU.ts`

- [ ] **Step 1: Implement useOrientation**

```typescript
"use client";

import { useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { OrientationState } from "./types";

export function useOrientation(): React.RefObject<OrientationState> {
  const bus = useStickmanBus();
  const ref = useRef<OrientationState>({
    gravityX: 0, gravityY: 0, gravityZ: 1,
    tiltMag: 0, angle: 0, pitch: 0, roll: 0,
  });

  // Read from shared gravity + smoothed IMU on each access
  // The ref is live-updated by returning a proxy-like object
  // Actually: just return a ref that syncs in a rAF loop
  // But since gravity is already in a ref, we can derive from it

  // Simplest: return a ref that reads from shared state
  const gravRef = bus.sharedGravity;
  const imuRef = bus.sharedSmoothedIMU;

  // Update orientation ref from shared refs each frame
  // Use a lightweight approach: the ref's .current getter composes from shared refs
  // Actually, to keep it simple and consistent, we just point to the same data:
  Object.defineProperty(ref, "current", {
    get() {
      const g = gravRef.current;
      const s = imuRef.current;
      return {
        gravityX: g.x,
        gravityY: g.y,
        gravityZ: g.z,
        tiltMag: g.tiltMag,
        angle: g.angle,
        pitch: s.p,
        roll: s.r,
      };
    },
    configurable: true,
  });

  return ref;
}
```

- [ ] **Step 2: Implement useSmoothedIMU**

```typescript
"use client";

import type { SmoothedIMUState } from "./types";
import { useStickmanBus } from "./useStickmanBus";

export function useSmoothedIMU(): React.RefObject<SmoothedIMUState> {
  return useStickmanBus().sharedSmoothedIMU;
}
```

- [ ] **Step 3: Implement useRawIMU**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { IMURawEvent } from "./types";

export function useRawIMU(): React.RefObject<IMURawEvent | null> {
  const bus = useStickmanBus();
  const ref = useRef<IMURawEvent | null>(null);

  useEffect(() => {
    return bus.subscribeType("imu", (event) => {
      ref.current = event;
    });
  }, [bus]);

  return ref;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add stickman/app/hooks/stickman/useOrientation.ts stickman/app/hooks/stickman/useSmoothedIMU.ts stickman/app/hooks/stickman/useRawIMU.ts
git commit -m "feat(hooks): add useOrientation, useSmoothedIMU, useRawIMU hooks"
```

---

### Task 7: useButtons + useGestures + useToss + useDeviceMode

**Files:**
- Create: `stickman/app/hooks/stickman/useButtons.ts`
- Create: `stickman/app/hooks/stickman/useGestures.ts`
- Create: `stickman/app/hooks/stickman/useToss.ts`
- Create: `stickman/app/hooks/stickman/useDeviceMode.ts`

- [ ] **Step 1: Implement useButtons**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { ButtonEvent } from "./types";

export interface ButtonState {
  a: boolean;
  b: boolean;
  lastEvent: ButtonEvent | null;
}

export function useButtons(): ButtonState {
  const bus = useStickmanBus();
  const [state, setState] = useState<ButtonState>({ a: false, b: false, lastEvent: null });

  useEffect(() => {
    return bus.subscribeType("btn", (event) => {
      setState({
        a: event.button === "A" ? event.state === "down" : state.a,
        b: event.button === "B" ? event.state === "down" : state.b,
        lastEvent: event,
      });
    });
  }, [bus]);

  return state;
}
```

Note: The `setState` uses functional form to avoid stale closure on `state`:

Actually, fix the stale closure:

```typescript
export function useButtons(): ButtonState {
  const bus = useStickmanBus();
  const [state, setState] = useState<ButtonState>({ a: false, b: false, lastEvent: null });

  useEffect(() => {
    return bus.subscribeType("btn", (event) => {
      setState((prev) => ({
        a: event.button === "A" ? event.state === "down" : prev.a,
        b: event.button === "B" ? event.state === "down" : prev.b,
        lastEvent: event,
      }));
    });
  }, [bus]);

  return state;
}
```

- [ ] **Step 2: Implement useGestures**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { GestureEvent } from "./types";
import { DEFAULTS } from "./utils";

export interface GestureConfig {
  clearAfterMs?: number;
}

export interface GestureState {
  lastGesture: GestureEvent["gesture"] | null;
  timestamp: number;
  ref: React.RefObject<{ lastGesture: GestureEvent["gesture"] | null; timestamp: number }>;
}

export function useGestures(config?: GestureConfig): GestureState {
  const bus = useStickmanBus();
  const clearMs = config?.clearAfterMs ?? DEFAULTS.gesturesClearMs;
  const [state, setState] = useState<{ lastGesture: GestureEvent["gesture"] | null; timestamp: number }>({
    lastGesture: null,
    timestamp: 0,
  });
  const ref = useRef({ lastGesture: null as GestureEvent["gesture"] | null, timestamp: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = bus.subscribeType("gesture", (event) => {
      const now = Date.now();
      const val = { lastGesture: event.gesture, timestamp: now };
      ref.current = val;
      setState(val);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const cleared = { lastGesture: null, timestamp: 0 };
        ref.current = cleared;
        setState(cleared);
      }, clearMs);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bus, clearMs]);

  return { ...state, ref };
}
```

- [ ] **Step 3: Implement useToss**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { TossPhase, TossEvent } from "./types";
import { DEFAULTS } from "./utils";

export interface TossConfig {
  resetAfterMs?: number;
}

export interface TossState {
  phase: TossPhase;
  launchG: number | null;
  heightIn: number | null;
  heightM: number | null;
  freefallMs: number | null;
  ref: React.RefObject<Omit<TossState, "ref">>;
}

const IDLE: Omit<TossState, "ref"> = {
  phase: "idle",
  launchG: null,
  heightIn: null,
  heightM: null,
  freefallMs: null,
};

export function useToss(config?: TossConfig): TossState {
  const bus = useStickmanBus();
  const resetMs = config?.resetAfterMs ?? DEFAULTS.tossResetMs;
  const [state, setState] = useState<Omit<TossState, "ref">>(IDLE);
  const ref = useRef<Omit<TossState, "ref">>(IDLE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = bus.subscribeType("toss", (event: TossEvent) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      let next: Omit<TossState, "ref">;

      if (event.state === "airborne") {
        next = { phase: "airborne", launchG: event.launchG, heightIn: null, heightM: null, freefallMs: null };
      } else if (event.state === "landed") {
        next = {
          phase: "landed",
          launchG: ref.current.launchG,
          heightIn: event.heightIn,
          heightM: event.heightM,
          freefallMs: event.freefallMs,
        };
        timerRef.current = setTimeout(() => {
          ref.current = IDLE;
          setState(IDLE);
        }, resetMs);
      } else {
        next = { ...IDLE, phase: "lost" };
        timerRef.current = setTimeout(() => {
          ref.current = IDLE;
          setState(IDLE);
        }, resetMs);
      }

      ref.current = next;
      setState(next);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bus, resetMs]);

  return { ...state, ref };
}
```

- [ ] **Step 4: Implement useDeviceMode**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";

export interface DeviceMode {
  mode: "wand" | "toss" | "debug" | null;
}

export function useDeviceMode(): DeviceMode {
  const bus = useStickmanBus();
  const [mode, setMode] = useState<DeviceMode>({ mode: null });

  useEffect(() => {
    return bus.subscribeType("mode", (event) => {
      setMode({ mode: event.mode });
    });
  }, [bus]);

  return mode;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add stickman/app/hooks/stickman/useButtons.ts stickman/app/hooks/stickman/useGestures.ts stickman/app/hooks/stickman/useToss.ts stickman/app/hooks/stickman/useDeviceMode.ts
git commit -m "feat(hooks): add useButtons, useGestures, useToss, useDeviceMode hooks"
```

---

### Task 8: Barrel Export (index.ts)

**Files:**
- Create: `stickman/app/hooks/stickman/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
export { StickmanProvider } from "./StickmanProvider";
export { useStickmanBus } from "./useStickmanBus";
export { useStickmanStatus } from "./useStickmanStatus";
export { usePointer } from "./usePointer";
export { useOrientation } from "./useOrientation";
export { useSmoothedIMU } from "./useSmoothedIMU";
export { useRawIMU } from "./useRawIMU";
export { useButtons } from "./useButtons";
export { useGestures } from "./useGestures";
export { useToss } from "./useToss";
export { useDeviceMode } from "./useDeviceMode";
export { pointerToScreen, dtSmooth, DEFAULTS } from "./utils";
export type * from "./types";
```

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/hooks/stickman/index.ts
git commit -m "feat(hooks): add barrel export for stickman hooks"
```

---

## Chunk 4: Component Migration

### Task 9: Wire up StickmanProvider in page.tsx

**Files:**
- Modify: `stickman/app/page.tsx`

- [ ] **Step 1: Wrap IMUVisualizer with StickmanProvider**

Update `stickman/app/page.tsx`:

```typescript
import { StickmanProvider } from "./hooks/stickman";
import { IMUVisualizer } from "./components/IMUVisualizer";

export default function Home() {
  return (
    <StickmanProvider>
      <IMUVisualizer />
    </StickmanProvider>
  );
}
```

- [ ] **Step 2: Verify it compiles and the app loads**

Run: `cd stickman && npx next build`
Expected: Build succeeds. (Do NOT start dev server — per CLAUDE.md rules.)

- [ ] **Step 3: Commit**

```bash
git add stickman/app/page.tsx
git commit -m "feat: wire StickmanProvider into page.tsx"
```

---

### Task 10: Extract CompassOverlay

**Files:**
- Create: `stickman/app/components/CompassOverlay.tsx`

- [ ] **Step 1: Create CompassOverlay using useOrientation**

Extract the compass SVG from IMUVisualizer (lines 289-396) into its own component. It should use `useOrientation()` for arrow rotation and tilt ring, and `useSmoothedIMU()` for the pitch/roll display.

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useOrientation, useSmoothedIMU } from "@/app/hooks/stickman";

export function CompassOverlay() {
  const orientation = useOrientation();
  const smoothedIMU = useSmoothedIMU();
  const arrowRef = useRef<SVGGElement>(null);
  const tiltRingRef = useRef<SVGCircleElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);

  // rAF loop for imperative DOM updates (no re-renders)
  useEffect(() => {
    let id: number;
    const update = () => {
      const o = orientation.current;
      const s = smoothedIMU.current;

      if (arrowRef.current) {
        arrowRef.current.setAttribute("transform", `rotate(${o.angle})`);
      }
      if (tiltRingRef.current) {
        const circ = 2 * Math.PI * 85;
        tiltRingRef.current.setAttribute("stroke-dasharray", `${circ * o.tiltMag} ${circ}`);
        tiltRingRef.current.setAttribute("stroke", `rgba(0, 212, 255, ${0.06 + o.tiltMag * 0.5})`);
      }
      if (pitchRef.current) {
        pitchRef.current.textContent = `${s.p.toFixed(1)}° / ${s.r.toFixed(1)}°`;
      }

      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [orientation, smoothedIMU]);

  // Compass ticks (static, rendered once)
  const ticks = [];
  for (let i = 0; i < 360; i += 10) {
    const rad = (i * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const isMajor = i % 90 === 0;
    const isMedium = i % 30 === 0;
    const inner = isMajor ? 92 : isMedium ? 96 : 100;
    const outer = 106;
    ticks.push(
      <line
        key={i}
        x1={sin * inner} y1={-cos * inner}
        x2={sin * outer} y2={-cos * outer}
        stroke={isMajor ? "#555" : isMedium ? "#444" : "#2a2a2a"}
        strokeWidth={isMajor ? 2.5 : isMedium ? 1.5 : 0.8}
      />
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
      <svg viewBox="-120 -120 240 240" className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-lg">
        <circle cx="0" cy="0" r="108" fill="#0d0d0d" opacity="0.85" />
        <circle cx="0" cy="0" r="108" fill="none" stroke="#1a1a1a" strokeWidth="2" />
        {ticks}
        <circle
          ref={tiltRingRef}
          cx="0" cy="0" r="85"
          fill="none" stroke="rgba(0,212,255,0.06)"
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray="0 534" transform="rotate(-90)"
        />
        <line x1="-12" y1="0" x2="12" y2="0" stroke="#333" strokeWidth="0.8" />
        <line x1="0" y1="-12" x2="0" y2="12" stroke="#333" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="3" fill="#222" />
        <g ref={arrowRef}>
          <line x1="0" y1="35" x2="0" y2="-62" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
          <polygon points="0,-80 -11,-56 0,-64 11,-56" fill="#00d4ff" />
          <circle cx="0" cy="40" r="3.5" fill="#00d4ff" opacity="0.3" />
        </g>
      </svg>
      <div ref={pitchRef} className="text-center font-mono text-[9px] text-zinc-500 mt-0.5" />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/components/CompassOverlay.tsx
git commit -m "feat(components): extract CompassOverlay using useOrientation hook"
```

---

### Task 11: Extract IMUHud

**Files:**
- Create: `stickman/app/components/IMUHud.tsx`

- [ ] **Step 1: Create IMUHud with imperative DOM updates**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useSmoothedIMU } from "@/app/hooks/stickman";

export function IMUHud() {
  const smoothedIMU = useSmoothedIMU();
  const accelRef = useRef<HTMLSpanElement>(null);
  const gyroRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let id: number;
    let frameCount = 0;
    const update = () => {
      frameCount++;
      // Throttle DOM updates to every 3rd frame (~20fps)
      if (frameCount % 3 === 0) {
        const s = smoothedIMU.current;
        if (accelRef.current) {
          accelRef.current.textContent =
            `ax ${s.ax.toFixed(3)} ay ${s.ay.toFixed(3)} az ${s.az.toFixed(3)}`;
        }
        if (gyroRef.current) {
          gyroRef.current.textContent =
            `gx ${s.gx.toFixed(1)} gy ${s.gy.toFixed(1)} gz ${s.gz.toFixed(1)}`;
        }
      }
      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [smoothedIMU]);

  return (
    <div className="absolute bottom-4 left-4 z-20 pointer-events-none font-mono text-[10px] text-zinc-600 flex flex-col gap-0.5">
      <span ref={accelRef} />
      <span ref={gyroRef} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add stickman/app/components/IMUHud.tsx
git commit -m "feat(components): extract IMUHud using useSmoothedIMU hook"
```

---

### Task 12: Extract PaintViz

**Files:**
- Create: `stickman/app/components/PaintViz.tsx`

- [ ] **Step 1: Create PaintViz**

Extract the paint-mode canvas rendering from IMUVisualizer (lines 166-280) into its own component. It uses `usePointer()` for position, `useSmoothedIMU()` for gyro-driven hue, and `useStickmanStatus()` for `receiving`.

The canvas resize logic, trail management, glow/main/core rendering passes, and leading dot all move here. The animation loop reads `pointer.current` each frame.

Key changes from the original:
- Uses `usePointer()` instead of inline pointer calculation
- Uses `useSmoothedIMU()` for gyro magnitude (hue calculation)
- Uses `useStickmanStatus()` for `receiving` flag
- Uses `pointerToScreen()` for coordinate mapping

Full implementation: extract lines 166-280 from current `IMUVisualizer.tsx`, replacing the inline pointer with `usePointer()` and `pointerToScreen()`.

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/components/PaintViz.tsx
git commit -m "feat(components): extract PaintViz using usePointer hook"
```

---

### Task 13: Update ConstellationViz

**Files:**
- Modify: `stickman/app/components/ConstellationViz.tsx`

- [ ] **Step 1: Replace pointerRef prop with usePointer hook**

Remove the `pointerRef` prop. Add `usePointer()` and `pointerToScreen()` internally.

Key changes:
- Remove `ConstellationVizProps` interface and `pointerRef` prop
- Add `import { usePointer, pointerToScreen } from "@/app/hooks/stickman"`
- Call `const pointer = usePointer()` inside the component
- In the rAF loop, replace `pointerRef.current` reads with `pointer.current` and use `pointerToScreen()`
- Remove `memo` wrapper (no props to memoize)

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/components/ConstellationViz.tsx
git commit -m "refactor(components): ConstellationViz uses usePointer hook directly"
```

---

### Task 14: Update ParticleImageViz

**Files:**
- Modify: `stickman/app/components/ParticleImageViz.tsx`

- [ ] **Step 1: Replace pointerRef prop with usePointer hook**

Same pattern as ConstellationViz:
- Remove `ParticleImageVizProps` interface and `pointerRef` prop
- Add `import { usePointer, pointerToScreen } from "@/app/hooks/stickman"`
- Call `const pointer = usePointer()` inside the component
- In the animation loop, replace `pointerRef.current` reads with `pointer.current` and use `pointerToScreen()`
- Remove `memo` wrapper

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/components/ParticleImageViz.tsx
git commit -m "refactor(components): ParticleImageViz uses usePointer hook directly"
```

---

### Task 15: Update Model3DViz

**Files:**
- Modify: `stickman/app/components/Model3DViz.tsx`

- [ ] **Step 1: Replace imuRef prop with useOrientation + useSmoothedIMU**

Key changes:
- Remove `Model3DVizProps` interface and `imuRef` prop from all components
- Add `import { useOrientation, useSmoothedIMU } from "@/app/hooks/stickman"`
- In `PigModel`: call `useOrientation()` and `useSmoothedIMU()`
- Replace gravity normalization (`gLen`, `gnx`, `gny`, `gnz`) with `orientation.current.gravityX/Y/Z`
- Replace `gz` with `smoothedIMU.current.gz`
- Use R3F `useFrame((_, delta) => ...)` instead of hardcoded `dt = 1/60`
- Remove `memo` wrapper from `Model3DViz`

See spec section "Model3DViz Migration (Pig)" for the exact before/after.

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add stickman/app/components/Model3DViz.tsx
git commit -m "refactor(components): Model3DViz uses useOrientation + useSmoothedIMU hooks"
```

---

### Task 16: Rewrite IMUVisualizer as thin shell

**Files:**
- Modify: `stickman/app/components/IMUVisualizer.tsx`

- [ ] **Step 1: Rewrite IMUVisualizer**

Replace the entire file with the thin shell from the spec. It should:
- Import `useStickmanStatus` for `receiving` and `presenceCount`
- Import all viz components: `PaintViz`, `ConstellationViz`, `ParticleImageViz`, `Model3DViz`
- Import `CompassOverlay` and `IMUHud`
- Import `ConnectionState`
- Use `useState` for `mode` (type `VizMode = "paint" | "stars" | "bingo" | "3d"`)
- Render header with mode toggle buttons, presence count, and ConnectionState
- Render active viz, waiting overlay, compass, and HUD
- Remove ALL old imports: `useChannel`, `usePresence`, `usePresenceListener`, the old interfaces, refs, animation loop, canvas rendering, compass ticks, etc.

Target: ~80-100 lines.

- [ ] **Step 2: Verify it compiles**

Run: `cd stickman && npx tsc --noEmit`

- [ ] **Step 3: Verify the app builds**

Run: `cd stickman && npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add stickman/app/components/IMUVisualizer.tsx
git commit -m "refactor(components): slim IMUVisualizer to thin shell composing hooks and viz components"
```

---

## Chunk 5: Verification & Cleanup

### Task 17: Full build + type check + lint

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `cd stickman && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Build**

Run: `cd stickman && npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Lint**

Run: `cd stickman && npm run lint`
Expected: No errors (or only pre-existing ones).

- [ ] **Step 4: Run tests**

Run: `cd stickman && npm test`
Expected: All tests pass.

---

### Task 18: Clean up unused code

**Files:**
- Possibly modify: `stickman/app/components/IMUVisualizer.tsx` (remove any lingering old code)
- Possibly delete: `stickman/app/components/Messages.tsx` (if confirmed unused)

- [ ] **Step 1: Check for unused imports and dead code**

Run: `cd stickman && npx tsc --noEmit` and check for unused variable warnings.
Review IMUVisualizer to confirm no old interfaces, refs, or logic remain.

- [ ] **Step 2: Commit any cleanup**

```bash
git add -A stickman/app/
git commit -m "chore: clean up unused code after event system migration"
```

---

### Task 19: Manual verification with device

**Files:** None (manual testing)

- [ ] **Step 1: Verify all four viz modes work**

Start the dev server (with user permission). Navigate to the app. Connect the device. Test:
1. Paint mode — pointer moves, trail renders, hue changes with rotation speed
2. Stars mode — particles repulse from pointer position
3. Bingo mode — particle image with pointer repulsion, click to cycle images
4. 3D mode — pig model rotates with device orientation
5. Compass overlay — arrow follows device tilt
6. HUD — shows accelerometer and gyro values
7. Mode switching — pointer stays warm (no snap to origin)
8. Connection status — shows connected/presence count

- [ ] **Step 2: Commit final state**

```bash
git add -A && git commit -m "feat: complete event system migration — all viz modes verified"
```

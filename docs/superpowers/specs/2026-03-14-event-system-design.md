# Stickman Event System & Pointer Abstraction

**Date:** 2026-03-14
**Status:** Reviewed (realtime expert + React architect)
**Goal:** Extract event processing and pointer detection from IMUVisualizer into a reusable, layered hook system so any visualization can consume device data with minimal boilerplate.

---

## Problem

IMUVisualizer (~420 lines) is a god component handling: Ably subscription, IMU smoothing, gravity estimation, linear acceleration extraction, pointer computation, paint-mode canvas rendering, compass SVG, HUD, mode switching, and presence tracking.

Only `imu` events are consumed — the device publishes `btn`, `gesture`, `toss`, and `mode` events that the web app ignores entirely. The pointer pipeline is buried in an animation loop and can't be reused. Both ConstellationViz and ParticleImageViz duplicate the normalized-to-screen coordinate mapping.

## Architecture: Layered Event Bus + Specialized Hooks

Four layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Visualization Components                                    │
│  (consume hooks, render visuals)                             │
├─────────────────────────────────────────────────────────────┤
│  Processing Hooks                                            │
│  usePointer() · useOrientation() · useButtons()              │
│  useGestures() · useToss() · useDeviceMode() · useRawIMU()   │
│  useSmoothedIMU()                                            │
├─────────────────────────────────────────────────────────────┤
│  Shared Processing Core                                      │
│  useGravity() (internal) — single gravity estimate           │
│  shared pointer singleton in provider                        │
├─────────────────────────────────────────────────────────────┤
│  Event Bus (StickmanProvider)                                │
│  Ably subscription → parse → typed dispatch (per-type Map)   │
│  Two contexts: bus (stable refs) + status (reactive state)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Event Types

All device events as a discriminated union. One source of truth for the protocol.

```typescript
// hooks/stickman/types.ts

export interface IMURawEvent {
  type: 'imu';
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  p: number; r: number;
  t: number; // Device uptime in ms (millis()), resets on reboot. NOT wall-clock.
}

export interface ButtonEvent {
  type: 'btn';
  button: 'A' | 'B';
  state: 'down' | 'up';
}

export interface GestureEvent {
  type: 'gesture';
  gesture: 'Circle Left' | 'Circle Right' | 'Tap' | 'Thrust';
}

export interface TossAirborneEvent {
  type: 'toss';
  state: 'airborne';
  launchG: number;
}

export interface TossLandedEvent {
  type: 'toss';
  state: 'landed';
  heightIn: number;
  heightM: number;
  freefallMs: number;
}

export interface TossLostEvent {
  type: 'toss';
  state: 'lost';
}

export type TossEvent = TossAirborneEvent | TossLandedEvent | TossLostEvent;

export interface ModeEvent {
  type: 'mode';
  mode: 'wand' | 'toss' | 'debug';
}

export type StickmanEvent = IMURawEvent | ButtonEvent | GestureEvent | TossEvent | ModeEvent;
```

---

## Layer 2: Event Bus (StickmanProvider)

A React context provider that subscribes to the Ably channel and dispatches typed events to subscribers.

### File: `hooks/stickman/StickmanProvider.tsx`

**Responsibilities:**
1. Subscribe to Ably channel `stickman` (all event names: `imu`, `btn`, `gesture`, `toss`, `mode`)
2. Parse each message into a typed `StickmanEvent`
3. Dispatch to registered callbacks via per-type `Map<string, Set<handler>>` for O(1) routing
4. Run the shared pointer pipeline (always warm — see Shared Processing Core)
5. Run the shared gravity pipeline (always warm)
6. Track connection/receiving status in a separate context

**Two contexts (prevents re-render contamination):**

```typescript
// Context 1: Stable subscription API — functions in refs, never causes re-renders
export interface StickmanBusContext {
  subscribe: (handler: (event: StickmanEvent) => void) => () => void;
  subscribeType: <T extends StickmanEvent['type']>(
    type: T,
    handler: (event: Extract<StickmanEvent, { type: T }>) => void
  ) => () => void;
  // Shared refs (always warm, never cause re-renders)
  sharedPointer: React.RefObject<PointerState>;
  sharedGravity: React.RefObject<GravityState>;
  sharedSmoothedIMU: React.RefObject<SmoothedIMUState>;
}

// Context 2: Reactive status — only consumed by components that display status
export interface StickmanStatusContext {
  connected: boolean;       // Ably connection state
  connectionState: string;  // Full Ably state string ('connecting' | 'connected' | 'disconnected' | etc.)
  receiving: boolean;       // True when IMU data actively arriving (resets to false after 3s timeout)
  presenceCount: number;
}
```

**Key design decisions:**

- **Per-type dispatch Map** — internally maintains `Map<string, Set<handler>>` keyed by event type, plus a separate Set for "subscribe all" handlers. Dispatch goes directly to the relevant Set. No filtering iteration.
- **Subscriber contract** — handlers MUST be O(1) and non-blocking. They should only write to refs or enqueue work. Heavy processing belongs in rAF loops, not in subscription callbacks.
- **Receiving timeout** — if no `imu` event arrives within 3 seconds, `receiving` resets to `false`. This handles device sleep and disconnection gracefully. (Fixes pre-existing bug where `receiving` was one-directional.)
- **Message parsing** — uses `message.name` to determine event type, adds `type` field. Invalid messages are silently dropped.
- **Ably hooks stay** — uses `useChannel` from ably/react under the hood.
- **Unsubscription safety** — subscriber Set is copied before iteration during dispatch, so removal during dispatch is safe.

---

## Layer 2.5: Shared Processing Core

Both the pointer and orientation need gravity estimation. Running them independently would cause visual divergence — the compass arrow could briefly disagree with the pointer direction during sharp tilts (one-frame phase offset from rAF callback ordering + Ably delivery timing).

**Solution:** The provider itself runs a single rAF loop that processes:

1. **Shared smoothed IMU** — low-pass filter on raw IMU data
2. **Shared gravity estimate** — slower LP on smoothed accelerometer
3. **Shared pointer** — tilt tracking + jolt velocity from the smoothed/gravity data

This loop runs always (not just when a viz is mounted), so mode switching never cold-starts. The cost is trivial — a few dozen multiplications per frame.

```typescript
export interface GravityState {
  // Gravity unit vector
  x: number; y: number; z: number;
  // Tilt magnitude (0 = level, 1 = fully tilted)
  tiltMag: number;
  // Compass angle in degrees
  angle: number;
}

export interface SmoothedIMUState {
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  p: number; r: number;
}
```

### Delta-Time-Aware Smoothing

All exponential smoothing uses delta-time scaling to produce frame-rate-independent behavior:

```typescript
// Instead of: value += (target - value) * FACTOR
// Use:        value += (target - value) * (1 - Math.pow(1 - FACTOR, dt * 60))
// where dt = seconds since last frame

function dtSmooth(current: number, target: number, factor: number, dt: number): number {
  return current + (target - current) * (1 - Math.pow(1 - factor, dt * 60));
}
```

This normalizes behavior across 60Hz, 120Hz (ProMotion), and janky frames. Same treatment applies to `JOLT_DECAY`:

```typescript
vel.x = vel.x * Math.pow(JOLT_DECAY, dt * 60) - linX * JOLT_GAIN * dt * 60;
```

### Background Tab Handling

When the browser tab is backgrounded, rAF stops but Ably keeps delivering messages. On resume, the `target` ref has fresh data but `smooth` is stale. The rAF loop detects time gaps:

```typescript
if (dt > 0.2) {
  // Tab was backgrounded — snap to current target, skip smoothing
  Object.assign(smooth, target);
  Object.assign(gravity, { x: target.ax, y: target.ay, z: target.az });
  // Reset velocity to avoid phantom jolts
  vel.x = 0; vel.y = 0;
}
```

### Visibility Change Optimization

The rAF loop pauses itself when `document.hidden === true` and resumes on `visibilitychange`. This prevents wasted processing in background tabs.

---

## Layer 3: Processing Hooks

Hooks provide the consumer API. High-frequency hooks return refs from the shared core. Low-frequency hooks manage their own React state.

### `usePointer(config?): PointerRef`

**Default behavior (no config):** Returns the provider's shared pointer ref. Zero additional processing. All consumers reading the default pointer see the exact same values — no divergence, always warm.

**Custom config:** Runs its own rAF loop with custom tuning, reading from the shared gravity (never diverges on gravity). This is for the rare case where a viz needs different sensitivity.

```typescript
export interface PointerConfig {
  smoothing?: number;      // Low-pass filter factor (default: 0.18)
  gravityLp?: number;      // Gravity estimation LP (default: 0.08) — ignored when using shared gravity
  posTrack?: number;       // Position tracking to tilt (default: 0.25)
  joltGain?: number;       // Acceleration → velocity gain (default: 0.03)
  joltDead?: number;       // Linear accel dead zone (default: 0.12)
  joltDecay?: number;      // Velocity damping (default: 0.85)
  clamp?: number;          // Max range for normalized coords (default: 2)
  enabled?: boolean;       // Pause processing (default: true)
}

export interface PointerState {
  x: number;   // Normalized position (-clamp to +clamp)
  y: number;
  vx: number;  // Jolt velocity (useful for trail effects, new API surface)
  vy: number;
}
```

**Behavior:** `usePointer()` with no args → returns `sharedPointer` from context. `usePointer({ joltGain: 0.06 })` → creates a custom instance that still reads shared gravity for consistency.

**Return:** Always a `React.RefObject<PointerState>`. Never null — initialized to `{x:0, y:0, vx:0, vy:0}` immediately.

### `useOrientation(): OrientationRef`

Returns the shared gravity data from the provider. No independent processing.

```typescript
export interface OrientationState {
  gravityX: number;
  gravityY: number;
  gravityZ: number;
  tiltMag: number;    // 0 = level, 1 = fully tilted
  angle: number;      // Compass angle in degrees
  pitch: number;      // Raw pitch from device
  roll: number;       // Raw roll from device
}
```

Since it reads from the same shared gravity as `usePointer()`, the compass and pointer always agree.

### `useSmoothedIMU(): SmoothedIMURef`

Returns the shared smoothed IMU data. For components that need the full smoothed accelerometer/gyroscope (e.g., 3D model visualization driven by smoothed orientation, HUD display).

```typescript
// Returns ref to smoothed { ax, ay, az, gx, gy, gz, p, r }
type SmoothedIMURef = React.RefObject<SmoothedIMUState>;
```

### `useButtons(): ButtonState`

Low-frequency — returns React state.

```typescript
export interface ButtonState {
  a: boolean;          // true = currently held down
  b: boolean;
  lastEvent: ButtonEvent | null;
}
```

Subscribes to `btn` events. Tracks held state.

### `useGestures(config?): GestureState`

Low-frequency — returns React state.

```typescript
export interface GestureConfig {
  clearAfterMs?: number;  // Auto-clear timeout (default: 2000)
}

export interface GestureState {
  lastGesture: GestureEvent['gesture'] | null;
  timestamp: number;
}
```

Auto-clears `lastGesture` after timeout. Timeout is cleaned up on unmount (no stale setState). Compatible with StrictMode double-mount (timer restarts on remount if gesture is still active).

**Ref escape hatch for rAF consumers:**

```typescript
// For animation loops that need gesture data without re-renders
export interface GestureState {
  lastGesture: GestureEvent['gesture'] | null;
  timestamp: number;
  ref: React.RefObject<{ lastGesture: GestureEvent['gesture'] | null; timestamp: number }>;
}
```

This solves the stale-closure problem identified in the expert review — rAF loops read `gestureState.ref.current` instead of the state value.

### `useToss(config?): TossState`

Low-frequency — returns React state.

```typescript
export interface TossConfig {
  resetAfterMs?: number;  // Auto-reset delay (default: 3000)
}

export type TossPhase = 'idle' | 'airborne' | 'landed' | 'lost';

export interface TossState {
  phase: TossPhase;
  launchG: number | null;
  heightIn: number | null;
  heightM: number | null;
  freefallMs: number | null;
  ref: React.RefObject<TossState>;  // Ref escape hatch for rAF consumers
}
```

State machine: `idle → airborne → landed → idle` (auto-resets after delay). `lost` also resets to idle. Timer cleaned up on unmount.

### `useDeviceMode(): DeviceMode`

```typescript
export interface DeviceMode {
  mode: 'wand' | 'toss' | 'debug' | null;  // null = unknown until first event
}
```

### `useRawIMU(): RawIMURef`

Escape hatch for unprocessed data.

```typescript
type RawIMURef = React.RefObject<IMURawEvent | null>;  // null before first event
```

---

## Utility Functions

```typescript
// hooks/stickman/utils.ts

// Convert normalized pointer to screen coordinates
export function pointerToScreen(
  pointer: PointerState,
  width: number,
  height: number,
  scale: number = 0.45
): { x: number; y: number } {
  return {
    x: width / 2 + pointer.x * width * scale,
    y: height / 2 + pointer.y * height * scale,
  };
}

// Delta-time-aware exponential smoothing
export function dtSmooth(current: number, target: number, factor: number, dt: number): number {
  return current + (target - current) * (1 - Math.pow(1 - factor, dt * 60));
}

// Default tuning constants
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

---

## File Structure

```
stickman/app/
├── hooks/
│   └── stickman/
│       ├── index.ts              # Re-exports everything
│       ├── types.ts              # Event type definitions
│       ├── StickmanProvider.tsx   # Event bus + shared processing core
│       ├── useStickmanBus.ts     # Internal: bus context access
│       ├── useStickmanStatus.ts  # Status context access (connected, receiving, etc.)
│       ├── usePointer.ts         # Pointer hook (shared default + custom config)
│       ├── useOrientation.ts     # Gravity/tilt/compass hook
│       ├── useSmoothedIMU.ts     # Smoothed IMU data hook
│       ├── useButtons.ts         # Button state hook
│       ├── useGestures.ts        # Gesture detection hook
│       ├── useToss.ts            # Toss lifecycle hook
│       ├── useDeviceMode.ts      # Device mode hook
│       ├── useRawIMU.ts          # Raw IMU data hook
│       └── utils.ts              # pointerToScreen, dtSmooth, defaults
├── components/
│   ├── IMUVisualizer.tsx         # Simplified: layout + mode switching (~80 lines)
│   ├── PaintViz.tsx              # Extracted paint mode (was inline in IMUVisualizer)
│   ├── ConstellationViz.tsx      # Updated: uses usePointer() directly
│   ├── ParticleImageViz.tsx      # Updated: uses usePointer() directly
│   ├── Model3DViz.tsx            # Updated: uses useOrientation() + useSmoothedIMU()
│   ├── CompassOverlay.tsx        # Extracted: uses useOrientation()
│   ├── IMUHud.tsx                # Extracted: uses useSmoothedIMU() with rAF + imperative DOM
│   ├── AblyProviderWrapper.tsx   # Unchanged
│   ├── ConnectionState.tsx       # Uses Ably hooks directly (infrastructure-level, not migrated)
│   └── PresenceStatus.tsx        # Unchanged
└── page.tsx                      # Wraps with StickmanProvider (inside layout's AblyProviderWrapper)
```

---

## Provider Composition

```
layout.tsx:   AblyProviderWrapper          (infrastructure — stays here)
  page.tsx:     StickmanProvider            (feature-level — goes here)
                  IMUVisualizer
```

`AblyProviderWrapper` stays in `layout.tsx` (as it is today). `StickmanProvider` goes in `page.tsx`. If other pages are added later, they get Ably access but don't pay the cost of IMU processing.

---

## Migration: IMUVisualizer Before/After

**Before:** ~420 lines, handles everything.

**After:** ~80 lines — layout, mode switching, composing child components:

```tsx
export function IMUVisualizer() {
  const { receiving, presenceCount } = useStickmanStatus();
  const [mode, setMode] = useState<VizMode>('paint');

  return (
    <div className="flex flex-col h-[100dvh] bg-[#050505] text-zinc-100 select-none overflow-hidden">
      <Header mode={mode} setMode={setMode} presenceCount={presenceCount} />
      <div className="flex-1 relative min-h-0">
        {mode === 'paint' && <PaintViz />}
        {mode === 'stars' && <ConstellationViz />}
        {mode === 'bingo' && <ParticleImageViz />}
        {mode === '3d' && <Model3DViz />}
        {!receiving && <WaitingOverlay />}
        <CompassOverlay />
        <IMUHud />
      </div>
    </div>
  );
}
```

### IMUHud Approach

IMUHud displays raw data at 60fps. Uses `useSmoothedIMU()` with a rAF loop and imperative DOM updates (via refs to span elements), matching the pattern used by the compass overlay today. No React re-renders for HUD updates.

### Model3DViz Migration (Pig)

Model3DViz currently takes an `imuRef` prop and does its own gravity normalization internally. In the new architecture, it consumes two hooks directly — no props needed:

- **`useOrientation()`** — provides the pre-normalized gravity vector (`gravityX/Y/Z`), eliminating duplicate gravity math
- **`useSmoothedIMU()`** — provides smoothed gyro Z for yaw rotation

**Before** (current — duplicates gravity normalization, hardcodes dt):
```tsx
function PigModel({ imuRef }: Model3DVizProps) {
  useFrame(() => {
    const { ax, ay, az, gz } = imuRef.current;
    const gLen = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    const gnx = ax / gLen;  // ← duplicated gravity normalization
    const gny = ay / gLen;
    const gnz = az / gLen;
    const screenDir = new THREE.Vector3(-gnx, -gnz, gny);
    // ...
    const dt = 1 / 60;  // ← frame-rate dependent
    const yawDelta = -gz * dt * (Math.PI / 180);
  });
}
```

**After** (uses centralized orientation + smoothed IMU):
```tsx
function PigModel() {
  const orientation = useOrientation();
  const smoothedIMU = useSmoothedIMU();
  const groupRef = useRef<THREE.Group>(null);
  const smoothQuat = useRef(new THREE.Quaternion());

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const o = orientation.current;
    const imu = smoothedIMU.current;

    // Device→Three.js axis mapping (viz-specific, stays here)
    const screenDir = new THREE.Vector3(-o.gravityX, -o.gravityZ, o.gravityY);
    screenDir.normalize();

    const targetQuat = new THREE.Quaternion().setFromUnitVectors(REST_UP, screenDir);

    // Yaw from smoothed gyro Z — uses R3F's delta instead of hardcoded 1/60
    const yawDelta = -imu.gz * delta * (Math.PI / 180);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(screenDir, yawDelta);
    targetQuat.premultiply(yawQuat);

    smoothQuat.current.slerp(targetQuat, 0.12);
    groupRef.current.quaternion.copy(smoothQuat.current);
  });

  return (
    <group ref={groupRef}>
      <Center><primitive object={scene.clone()} scale={1.5} /></Center>
    </group>
  );
}
```

**What changes:**
- No more `imuRef` prop — reads hooks directly
- Gravity normalization comes from `useOrientation()` (centralized, shared with compass)
- Gyro Z comes from `useSmoothedIMU()`
- Uses R3F's `delta` parameter from `useFrame` instead of hardcoded `1/60`
- Device-to-Three.js axis mapping stays in the component (it's viz-specific)

**What stays the same:**
- Quaternion slerp smoothing
- The visual rotation behavior
- Scene setup (lights, grid, environment, orbit controls)

---

## Visualization Consumption Patterns

### Default pointer (recommended — most viz):

```tsx
function MyViz() {
  const pointer = usePointer();  // shared singleton, always warm
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let id: number;
    const animate = () => {
      const { x, y } = pointerToScreen(pointer.current, canvas.width, canvas.height);
      // draw using x, y
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
```

### Custom pointer (rare — different sensitivity):

```tsx
function TwitchyViz() {
  const pointer = usePointer({ joltGain: 0.06, smoothing: 0.12 });
  // pointer is a custom instance with higher sensitivity
  // gravity estimation still matches the shared core
}
```

### Multi-event consumption (future magic wand):

```tsx
function MagicWandViz() {
  const pointer = usePointer({ joltGain: 0.06, smoothing: 0.12 });
  const orientation = useOrientation();
  const gestures = useGestures();
  const { a: buttonHeld } = useButtons();

  useEffect(() => {
    let id: number;
    const animate = () => {
      const p = pointer.current;
      const o = orientation.current;
      const g = gestures.ref.current;  // Read gesture via ref, not stale closure
      // Use p.x, p.y for wand tip position
      // Use o.angle for wand rotation
      // Check g.lastGesture for spell effects
      // buttonHeld tracked via separate ref if needed in rAF
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
```

---

## What Doesn't Change

- **Ably setup** — AblyProviderWrapper, .env.local, channel name all stay
- **Visual output** — all four viz modes (paint, stars, bingo, 3d) render identically to today
- **tsparticles** — ConstellationViz keeps its particle engine
- **react-three-fiber** — Model3DViz keeps its R3F setup, scene, lighting
- **Rendering approach** — canvas + rAF loops, ref-based animation state
- **ConnectionState** — continues using Ably hooks directly (infrastructure-level component)

## Known Simplifications

- **Device timestamp (`t`)** is available in raw events but not used for interpolation. At 10Hz input / 60fps output, the low-pass smoothing approach is adequate. If input rate increases to 25Hz+, revisit with proper dt-between-samples interpolation.
- **`PointerState.vx/vy`** is new API surface not consumed by current visualizations. It enables future trail/momentum effects without re-extracting from the pipeline.

## Testing Strategy

- **Event types** — type-check tests (compile-time)
- **Bus** — unit test: synthetic Ably messages → correct typed events dispatched to correct per-type Set
- **Shared core** — unit test: feed IMU sequence → verify smoothed output, gravity, and pointer match current behavior (snapshot baseline from existing IMUVisualizer)
- **usePointer (custom)** — unit test: feed IMU sequence with non-default config → verify tuning parameters take effect
- **useButtons/useGestures/useToss** — unit test: feed event sequences → verify state transitions and auto-clear/reset timers
- **Integration** — render a minimal viz with the provider, feed synthetic events, verify pointer output
- **Delta-time** — test with simulated variable frame rates to verify frame-rate independence

---

## Performance Considerations

- **No new re-renders** — high-frequency data (pointer, orientation, raw IMU, smoothed IMU) stays in refs
- **No new dependencies** — pure React (context + refs + rAF)
- **Single shared rAF loop** for core processing (gravity + pointer + smoothed IMU) in the provider
- **Custom usePointer** runs its own rAF but reads shared gravity — no divergence, minimal cost
- **Lazy subscription** — hooks only subscribe when mounted. Unmounted viz = no subscription cost
- **Visibility optimization** — rAF loop pauses when tab is backgrounded, snaps to current state on resume
- **Two contexts** — bus context value is stable (ref-based functions, never changes). Status context only re-renders components that display connection/presence info.

---

## Expert Review Summary

Reviewed by realtime systems expert and React architecture expert. Key issues addressed:

| Issue | Resolution |
|-------|------------|
| Frame-rate-dependent smoothing | Delta-time-aware exponential filter (`dtSmooth`) |
| Gravity divergence between hooks | Shared gravity core in provider |
| Mode-switch cold-starts pointer | Shared pointer singleton, always warm |
| Model3DViz unaccounted for | Added `useSmoothedIMU()` hook |
| Context re-render contamination | Split into bus context + status context |
| Background tab snap-back | Detect dt > 200ms, snap to target |
| Per-type dispatch efficiency | `Map<string, Set<handler>>` internally |
| Stale closure in rAF examples | `.ref` escape hatch on gesture/toss state |
| `receiving` never resets | 3s timeout on no IMU events |
| HUD update strategy | rAF + imperative DOM (no re-renders) |
| ConnectionState migration | Stays on Ably hooks directly |
| Subscriber dispatch contract | Documented: O(1) non-blocking handlers only |
| Visibility optimization | rAF pauses on `document.hidden` |
| Timer cleanup (StrictMode) | Timers cleaned up on unmount, restarted on remount |

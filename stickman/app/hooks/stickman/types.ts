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

export interface GravityState {
  x: number;  // device +X = LEFT edge
  y: number;  // device +Y = toward TOP
  z: number;  // device +Z = out of screen
  tiltMag: number;
  angle: number;
  // NXP AN3461 3-axis tilt angles (radians), stable at all orientations
  tiltLR: number;  // left/right: atan2(ax, sqrt(ay² + az²))
  tiltFB: number;  // forward/back: atan2(-ay, sqrt(ax² + az²))
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
  tiltLR: number;  // left/right tilt in radians (NXP AN3461)
  tiltFB: number;  // forward/back tilt in radians (NXP AN3461)
}

export type TossPhase = "idle" | "airborne" | "landed" | "lost";

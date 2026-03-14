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

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
    for (const h of [...allHandlers.current]) h(event);
    const typed = typedHandlers.current.get(event.type);
    if (typed) {
      for (const h of [...typed]) (h as (event: StickmanEvent) => void)(event);
    }
  }, []);

  const target = useRef<IMURawEvent>({
    type: "imu", ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0,
  });
  const smooth = useRef<SmoothedIMUState>({
    ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0,
  });
  const gravity = useRef<GravityState>({ x: 0, y: 0, z: 1, tiltMag: 0, angle: 0, tiltLR: 0, tiltFB: 0, yaw: 0 });
  const pointer = useRef<PointerState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const dotPos = useRef({ x: 0, y: 0 });
  const dotVel = useRef({ x: 0, y: 0 });
  const lastFrameTime = useRef(0);

  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [receiving, setReceiving] = useState(false);
  const receivingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivingRef = useRef(false);

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

    dispatch(event);

    if (event.type === "imu") {
      if (!receivingRef.current) {
        receivingRef.current = true;
        setReceiving(true);
      }
      if (receivingTimer.current) clearTimeout(receivingTimer.current);
      receivingTimer.current = setTimeout(() => {
        receivingRef.current = false;
        setReceiving(false);
      }, DEFAULTS.receivingTimeoutMs);
    }
  });

  const { presenceData } = usePresenceListener("stickman");
  const presenceCount = presenceData.length;

  // Clean up receiving timer independently of animation loop
  useEffect(() => {
    return () => {
      if (receivingTimer.current) clearTimeout(receivingTimer.current);
    };
  }, []);

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

      if (dt > 0.2) {
        s.ax = t.ax; s.ay = t.ay; s.az = t.az;
        s.gx = t.gx; s.gy = t.gy; s.gz = t.gz;
        s.p = t.p; s.r = t.r;
        g.x = t.ax; g.y = t.ay; g.z = t.az;
        vel.x = 0; vel.y = 0;
        dt = 1 / 60;
      }

      s.ax = dtSmooth(s.ax, t.ax, DEFAULTS.smoothing, dt);
      s.ay = dtSmooth(s.ay, t.ay, DEFAULTS.smoothing, dt);
      s.az = dtSmooth(s.az, t.az, DEFAULTS.smoothing, dt);
      s.gx = dtSmooth(s.gx, t.gx, DEFAULTS.smoothing, dt);
      s.gy = dtSmooth(s.gy, t.gy, DEFAULTS.smoothing, dt);
      s.gz = dtSmooth(s.gz, t.gz, DEFAULTS.smoothing, dt);
      s.p = dtSmooth(s.p, t.p, DEFAULTS.smoothing, dt);
      s.r = dtSmooth(s.r, t.r, DEFAULTS.smoothing, dt);

      g.x = dtSmooth(g.x, s.ax, DEFAULTS.gravityLp, dt);
      g.y = dtSmooth(g.y, s.ay, DEFAULTS.gravityLp, dt);
      g.z = dtSmooth(g.z, s.az, DEFAULTS.gravityLp, dt);

      const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1;
      const gnx = g.x / gMag;
      const gny = g.y / gMag;

      g.tiltMag = Math.sqrt(gnx * gnx + gny * gny);
      g.angle = Math.atan2(-gnx, gny) * (180 / Math.PI);

      // NXP AN3461 3-axis tilt angles (stable at all orientations)
      // Device: +X=left, +Y=top, +Z=screen-out
      g.tiltLR = Math.atan2(g.x, Math.sqrt(g.y * g.y + g.z * g.z));
      g.tiltFB = Math.atan2(-g.y, Math.sqrt(g.x * g.x + g.z * g.z));

      // Yaw: integrate gyro Z when device is mostly flat (gz > 0.7g)
      // Accel can't detect spin around screen-normal, only gyro can.
      // Decays slowly toward 0 to prevent unbounded drift.
      const GYRO_DEAD = 3.0; // dps dead zone (gyro noise at rest)
      const gzDps = Math.abs(s.gz) > GYRO_DEAD ? s.gz : 0;
      if (Math.abs(g.z) > 0.5) {
        g.yaw += gzDps * dt * (Math.PI / 180);
      }
      g.yaw *= 0.995; // slow drift decay

      const accelDotG = s.ax * gnx + s.ay * gny + s.az * (g.z / gMag);
      let linX = s.ax - accelDotG * gnx;
      let linY = s.ay - accelDotG * gny;
      const linMag = Math.sqrt(linX * linX + linY * linY);
      if (linMag < DEFAULTS.joltDead) { linX = 0; linY = 0; }

      const restX = -gnx;
      const restY = -gny;
      pos.x = dtSmooth(pos.x, restX, DEFAULTS.posTrack, dt);
      pos.y = dtSmooth(pos.y, restY, DEFAULTS.posTrack, dt);

      const decayFactor = Math.pow(DEFAULTS.joltDecay, dt * 60);
      vel.x = vel.x * decayFactor - linX * DEFAULTS.joltGain * dt * 60;
      vel.y = vel.y * decayFactor - linY * DEFAULTS.joltGain * dt * 60;

      pointer.current = {
        x: Math.max(-DEFAULTS.clamp, Math.min(DEFAULTS.clamp, pos.x + vel.x)),
        y: Math.max(-DEFAULTS.clamp, Math.min(DEFAULTS.clamp, pos.y + vel.y)),
        vx: vel.x,
        vy: vel.y,
      };

      animId = requestAnimationFrame(tick);
    };

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
    };
  }, []);

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

"use client";

import { useEffect, useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { PointerState, PointerConfig, IMURawEvent } from "./types";
import { dtSmooth, DEFAULTS } from "./utils";

export function usePointer(config?: PointerConfig): React.RefObject<PointerState> {
  const bus = useStickmanBus();
  const hasConfig = config !== undefined;
  const customPointer = useCustomPointer(bus, config ?? {}, hasConfig);
  return hasConfig ? customPointer : bus.sharedPointer;
}

function useCustomPointer(
  bus: ReturnType<typeof useStickmanBus>,
  config: PointerConfig,
  active: boolean,
): React.RefObject<PointerState> {
  const pointer = useRef<PointerState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const targetRef = useRef<IMURawEvent | null>(null);
  const smoothRef = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const lastTime = useRef(0);

  // Store config in refs so the rAF loop doesn't restart on config changes
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const enabled = (config.enabled ?? true) && active;

  useEffect(() => {
    if (!enabled) return;

    const unsub = bus.subscribeType("imu", (event) => {
      targetRef.current = event;
    });

    let animId: number;
    lastTime.current = performance.now() / 1000;

    const tick = () => {
      const now = performance.now() / 1000;
      let dt = now - lastTime.current;
      lastTime.current = now;

      const c = configRef.current;
      const smoothing = c.smoothing ?? DEFAULTS.smoothing;
      const posTrack = c.posTrack ?? DEFAULTS.posTrack;
      const joltGain = c.joltGain ?? DEFAULTS.joltGain;
      const joltDead = c.joltDead ?? DEFAULTS.joltDead;
      const joltDecay = c.joltDecay ?? DEFAULTS.joltDecay;
      const clamp = c.clamp ?? DEFAULTS.clamp;

      if (dt > 0.2) {
        if (targetRef.current) {
          smoothRef.current.ax = targetRef.current.ax;
          smoothRef.current.ay = targetRef.current.ay;
          smoothRef.current.az = targetRef.current.az;
        }
        vel.current.x = 0;
        vel.current.y = 0;
        dt = 1 / 60;
      }

      const t = targetRef.current;
      if (!t) { animId = requestAnimationFrame(tick); return; }

      const s = smoothRef.current;
      s.ax = dtSmooth(s.ax, t.ax, smoothing, dt);
      s.ay = dtSmooth(s.ay, t.ay, smoothing, dt);
      s.az = dtSmooth(s.az, t.az, smoothing, dt);

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
  }, [bus, enabled]);

  return pointer;
}

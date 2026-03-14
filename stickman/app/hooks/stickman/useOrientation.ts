"use client";

import { useMemo } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { OrientationState } from "./types";

export function useOrientation(): React.RefObject<OrientationState> {
  const bus = useStickmanBus();

  const ref = useMemo(() => {
    const cached: OrientationState = {
      gravityX: 0, gravityY: 0, gravityZ: 1,
      tiltMag: 0, angle: 0, pitch: 0, roll: 0,
    };
    const obj = {} as { current: OrientationState };
    Object.defineProperty(obj, "current", {
      get() {
        const g = bus.sharedGravity.current;
        const s = bus.sharedSmoothedIMU.current;
        cached.gravityX = g.x;
        cached.gravityY = g.y;
        cached.gravityZ = g.z;
        cached.tiltMag = g.tiltMag;
        cached.angle = g.angle;
        cached.pitch = s.p;
        cached.roll = s.r;
        return cached;
      },
    });
    return obj;
  }, [bus]);

  return ref as React.RefObject<OrientationState>;
}

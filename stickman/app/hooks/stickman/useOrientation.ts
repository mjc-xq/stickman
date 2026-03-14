"use client";

import { useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { OrientationState } from "./types";

export function useOrientation(): React.RefObject<OrientationState> {
  const bus = useStickmanBus();
  const ref = useRef<OrientationState>(null as unknown as OrientationState);

  const gravRef = bus.sharedGravity;
  const imuRef = bus.sharedSmoothedIMU;

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

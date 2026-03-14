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

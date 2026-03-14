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

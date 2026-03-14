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
      setState((prev) => ({
        a: event.button === "A" ? event.state === "down" : prev.a,
        b: event.button === "B" ? event.state === "down" : prev.b,
        lastEvent: event,
      }));
    });
  }, [bus]);

  return state;
}

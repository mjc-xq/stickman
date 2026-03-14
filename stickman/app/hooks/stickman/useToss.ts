"use client";

import { useEffect, useRef, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { TossPhase, TossEvent } from "./types";
import { DEFAULTS } from "./utils";

export interface TossConfig {
  resetAfterMs?: number;
}

export interface TossState {
  phase: TossPhase;
  launchG: number | null;
  heightIn: number | null;
  heightM: number | null;
  freefallMs: number | null;
  ref: React.RefObject<Omit<TossState, "ref">>;
}

const IDLE: Omit<TossState, "ref"> = {
  phase: "idle",
  launchG: null,
  heightIn: null,
  heightM: null,
  freefallMs: null,
};

export function useToss(config?: TossConfig): TossState {
  const bus = useStickmanBus();
  const resetMs = config?.resetAfterMs ?? DEFAULTS.tossResetMs;
  const [state, setState] = useState<Omit<TossState, "ref">>(IDLE);
  const ref = useRef<Omit<TossState, "ref">>(IDLE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = bus.subscribeType("toss", (event: TossEvent) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      let next: Omit<TossState, "ref">;

      if (event.state === "airborne") {
        next = { phase: "airborne", launchG: event.launchG, heightIn: null, heightM: null, freefallMs: null };
      } else if (event.state === "landed") {
        next = {
          phase: "landed",
          launchG: ref.current.launchG,
          heightIn: event.heightIn,
          heightM: event.heightM,
          freefallMs: event.freefallMs,
        };
        timerRef.current = setTimeout(() => {
          ref.current = IDLE;
          setState(IDLE);
        }, resetMs);
      } else {
        next = { ...IDLE, phase: "lost" };
        timerRef.current = setTimeout(() => {
          ref.current = IDLE;
          setState(IDLE);
        }, resetMs);
      }

      ref.current = next;
      setState(next);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bus, resetMs]);

  return { ...state, ref };
}

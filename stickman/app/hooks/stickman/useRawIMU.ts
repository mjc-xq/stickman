"use client";

import { useEffect, useRef } from "react";
import { useStickmanBus } from "./useStickmanBus";
import type { IMURawEvent } from "./types";

export function useRawIMU(): React.RefObject<IMURawEvent | null> {
  const bus = useStickmanBus();
  const ref = useRef<IMURawEvent | null>(null);

  useEffect(() => {
    return bus.subscribeType("imu", (event) => {
      ref.current = event;
    });
  }, [bus]);

  return ref;
}

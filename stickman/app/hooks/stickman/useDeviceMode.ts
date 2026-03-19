"use client";

import { useEffect, useState } from "react";
import { useStickmanBus } from "./useStickmanBus";

export interface DeviceMode {
  mode: "active" | "debug" | null;
}

export function useDeviceMode(): DeviceMode {
  const bus = useStickmanBus();
  const [mode, setMode] = useState<DeviceMode>({ mode: null });

  useEffect(() => {
    return bus.subscribeType("mode", (event) => {
      setMode({ mode: event.mode });
    });
  }, [bus]);

  return mode;
}

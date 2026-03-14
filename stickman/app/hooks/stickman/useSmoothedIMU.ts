"use client";

import type { SmoothedIMUState } from "./types";
import { useStickmanBus } from "./useStickmanBus";

export function useSmoothedIMU(): React.RefObject<SmoothedIMUState> {
  return useStickmanBus().sharedSmoothedIMU;
}

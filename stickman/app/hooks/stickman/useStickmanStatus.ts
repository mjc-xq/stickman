"use client";

import { createContext, useContext } from "react";

export interface StickmanStatus {
  connected: boolean;
  connectionState: string;
  receiving: boolean;
  presenceCount: number;
}

export const StickmanStatusContext = createContext<StickmanStatus>({
  connected: false,
  connectionState: "disconnected",
  receiving: false,
  presenceCount: 0,
});

export function useStickmanStatus(): StickmanStatus {
  return useContext(StickmanStatusContext);
}
